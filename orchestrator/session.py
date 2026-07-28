"""Core call session — the STT -> LLM -> TTS turn loop and per-call state,
replacing livekit-agents' AgentSession/Agent/JobContext for one call.

Phase 1 scope (per the migration plan): a working turn-based pipeline
callable with a canned audio file, verified locally, with no telephony or
browser transport wired in yet. Phase 2/3 adapters will feed audio in via
`Session.handle_utterance(wav_bytes)` and consume replies via
`Session.on_event`/the returned TTS audio — this module doesn't know or
care whether that audio came from EnableX's WebSocket stream or a browser.

Prompt assembly here is a faithful-enough port of agent/main.py's
instruction-building (agent name/business, KB injection, lead-capture
block, voice-style rules) for Phase 1's verification goal — NOT yet a
line-for-line port of every clause in main.py's ~240-line prompt stitching
(date/time injection, gender agreement, memory recall phrasing, template
substitution). That full fidelity is required before Phase 2/3 cutover
(the plan's "zero visible behavior change" goal) and is tracked as
follow-up work once the pipeline itself is proven.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable

import db
import emotion
import llm
import stt
import tts
import tools
import voice_catalog
from language import LANGUAGE_NAMES, detect_reply_language
from prompts.generic_assistant import build_generic_assistant_prompt
from prompts.voice_style import VOICE_STYLE_PROMPT

logger = logging.getLogger("orchestrator-session")

_IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


@dataclass
class Session:
    """One call's live state. Mirrors the fields agent/main.py threaded
    through JobContext.userdata / RunContext.userdata, minus anything
    LiveKit-room-specific."""

    account_id: int | None
    agent_id: int | None
    call_type: str = "browser"  # "phone" | "widget" | "browser"
    site_id: int | None = None
    voice: str = "shubh"
    voice_gender: str = ""  # set in __post_init__ from voice_catalog, below
    reply_language: str = "hi-IN"
    pending_language: str | None = None
    pending_language_streak: int = 0
    transfer_phone: str = ""
    visitor_name: str = ""
    visitor_phone: str = ""
    visitor_email: str = ""
    company: str = ""
    custom_fields: dict = field(default_factory=dict)

    agent_name: str = "Artha"
    business_name: str = "this business"
    model: str = "gpt-4o-mini"
    custom_system_prompt: str = ""
    kb_id: int | None = None
    memory_enabled: bool = False
    first_speaker: str = "agent"
    welcome_message: str = ""

    lead_data: dict = field(default_factory=dict)
    messages: list[dict] = field(default_factory=list)
    transcript: list[dict] = field(default_factory=list)
    ending_call: bool = False
    started_at: datetime.datetime = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc))

    on_event: Callable[[dict], None] | None = None
    tool_schemas: list[dict] = field(default_factory=list)
    tool_handlers: dict[str, callable] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Ported from agent/main.py's __init__ — many Indian languages
        # (Hindi, Marathi, Gujarati, Punjabi) inflect first-person verbs by
        # the SPEAKER's gender, so the LLM must know whether this voice is a
        # woman or a man, or it defaults to masculine forms even on a female
        # voice. Derived from the voice catalog so it's automatic for every
        # voice, no per-agent config needed.
        self.voice_gender = (voice_catalog.get_voice(self.voice) or {}).get("gender") or ""

    @property
    def tts_provider(self) -> str:
        return tts.tts_provider_of(self.voice)

    def emit_event(self, payload: dict) -> None:
        """Replaces agent/tools.py's _publish_event (LiveKit room data-channel
        publish). Phase 3's browser/widget WebSocket adapter wires on_event to
        an actual client message send; until then this is a no-op except for
        phone calls, which have no live UI to push to anyway."""
        if self.on_event is not None:
            self.on_event(payload)


LANGUAGE_SWITCH_CONFIRMATION_TURNS = 3


def _update_reply_language(session: Session, caller_text: str) -> None:
    """Ported from agent/main.py's on_user_turn_completed (2026-07-15 fix,
    see language.py's module docstring) — ported because it was NOT part of
    Phase 1's prompt-assembly port and its absence here reproduced the exact
    bug it fixed: a single noisy/ambiguous turn immediately flipping
    reply_language mid-call. A same-voice TTS clip in a different language
    also just sounds like a different person, so this shows up to the
    caller as "two different voices", not only as wrong-language text.

    Treats a Devanagari "hi-IN" reading as a non-signal on an already-mr-IN
    session (script alone can't distinguish Hindi from Marathi) — that pair
    is the one genuinely ambiguous case, so it alone requires
    LANGUAGE_SWITCH_CONFIRMATION_TURNS consecutive turns agreeing before
    switching. Every other candidate is already a confident, unambiguous
    script/Latin match (see language.py's ratio+char-count gate), so it
    switches immediately — requiring the same 3-turn confirmation for those
    too made "switch the instant they switch" (the promise in
    VOICE_STYLE_PROMPT) feel broken/sluggish for the common case."""
    candidate = detect_reply_language(caller_text)
    if candidate == "hi-IN" and session.reply_language == "mr-IN":
        candidate = None
    if candidate is None or candidate == session.reply_language:
        session.pending_language = None
        session.pending_language_streak = 0
        return

    if candidate == session.pending_language:
        session.pending_language_streak += 1
    else:
        session.pending_language = candidate
        session.pending_language_streak = 1

    ambiguous_pair = candidate == "hi-IN" or session.reply_language == "hi-IN"
    if not ambiguous_pair:
        session.reply_language = candidate
        session.pending_language = None
        session.pending_language_streak = 0
        return

    if session.pending_language_streak >= LANGUAGE_SWITCH_CONFIRMATION_TURNS:
        session.reply_language = candidate
        session.pending_language = None
        session.pending_language_streak = 0


_TEMPLATE_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def _substitute_template_vars(session: Session) -> str:
    """Ported from agent/main.py's _substitute_template_vars — fills
    {{first_name}}/{{last_name}}/{{name}}/{{phone}}/{{company}}/
    {{custom.KEY}} tokens in an operator-authored custom_system_prompt
    (from a campaign dial's CSV import) with this call's contact data. An
    unmatched token is left blank rather than as literal braces, since a
    stray "{{whatever}}" read aloud by the TTS is far more jarring than a
    silently-dropped clause."""
    name_parts = session.visitor_name.split(None, 1) if session.visitor_name else []
    values = {
        "first_name": name_parts[0] if name_parts else "",
        "last_name": name_parts[1] if len(name_parts) > 1 else "",
        "name": session.visitor_name,
        "phone": session.visitor_phone,
        "company": session.company,
        "custom": session.custom_fields,
    }

    def repl(match: re.Match) -> str:
        key = match.group(1)
        if key.startswith("custom."):
            return str(values["custom"].get(key[7:], ""))
        return str(values.get(key, ""))

    return _TEMPLATE_VAR_RE.sub(repl, session.custom_system_prompt)


def build_system_prompt(session: Session) -> str:
    """Assembles the system prompt: persona + KB + voice-style rules. See
    module docstring re: fidelity vs. agent/main.py's full prompt assembly."""
    if session.custom_system_prompt:
        persona = (
            _substitute_template_vars(session) if "{{" in session.custom_system_prompt else session.custom_system_prompt
        )
    else:
        persona = build_generic_assistant_prompt(session.agent_name, session.business_name)

    parts = [persona]
    if session.kb_id is not None:
        kb_text = db.get_kb_content(session.kb_id)
        if kb_text:
            if db.is_kb_strict(session.kb_id):
                # Ported from agent/main.py's equivalent block (same
                # strict-mode wording, proven in production) — the KB is the
                # only permitted source for concrete facts, which is what
                # stops the model improvising a plausible but wrong number.
                header = (
                    "## Knowledge base — THE authoritative facts for this call\n"
                    "The knowledge base below is your ONLY source for concrete facts about this "
                    "business and its projects: prices, sizes, distances, dates, legal status, "
                    "amenities, payment plans, contact details. Follow it strictly:\n"
                    "- When a caller's question matches an approved answer below, give that answer "
                    "(naturally rephrased for speech and translated into the caller's language, but "
                    "with every number, price, and name kept exactly as written).\n"
                    "- Never state a concrete fact about this business that is not in the knowledge "
                    "base — no guessing, no rounding, no 'approximately' around a number that isn't "
                    "there, even if you believe you know the answer.\n"
                    "- If the knowledge base doesn't cover something, say you'll have the team "
                    "confirm it, offer to note the question down, and move the conversation forward "
                    "— that is always better than an invented answer.\n"
                    "- Your general expertise is still fine for generic concepts related to this "
                    "industry; strictness applies to THIS business's specific facts."
                )
            else:
                header = "## Knowledge base (use this for factual questions; you may also use general knowledge)"
            parts.append(f"{header}\n{kb_text}")

    # Unconditional regardless of persona type (built-in, generic, or a
    # tenant's own custom system_prompt) — a custom prompt REPLACES the
    # persona/content above but never this. Without it, a real-estate agent
    # answering a caller's random tangent (health, weather, whatever) reads
    # as broken/unfocused rather than a real sales rep staying on task.
    parts.append(
        "## Staying on topic\n"
        "If the caller asks something entirely unrelated to this business (general life advice, "
        "health, or any other unrelated topic), do not try to actually answer it — briefly and "
        "warmly acknowledge them, then steer the conversation back to how you can help them here."
    )

    memory = db.get_caller_memory(session.agent_id, session.visitor_phone) if session.agent_id else ""
    if memory:
        parts.append(f"## What you remember about this caller from before\n{memory}")

    # Ported from agent/main.py — the only source of truth for "today",
    # "tomorrow", "next Monday" etc.; without it the model resolves relative
    # dates from training-data memory, which books appointments on the wrong
    # date. check_calendar_availability/book_appointment need this to
    # compute their date argument correctly.
    now_ist = datetime.datetime.now(_IST)
    parts.append(
        f"## Current date and time\nRight now it is {now_ist.strftime('%A, %d %B %Y')}, "
        f"{now_ist.strftime('%H:%M')} IST. This is the ONLY source of truth for \"today\", "
        "\"tomorrow\", \"next Monday\", \"this weekend\", etc. — never resolve a relative date "
        "from memory or assumption. When calling check_calendar_availability or book_appointment, "
        "compute the date argument (YYYY-MM-DD) from this real date."
    )

    if session.voice_gender in ("male", "female"):
        # Ported from agent/main.py (see Session.__post_init__ above for why
        # this is derived from the voice catalog). Also reinforced per-turn
        # in _gender_reminder_message below — a single system-prompt mention
        # tends to drift over a long conversation since masculine Hindi/
        # Marathi/Gujarati verb forms are simply far more frequent in
        # training data, fighting this instruction turn after turn.
        _woman = session.voice_gender == "female"
        parts.append(
            f"## Your voice and gender\nYou, {session.agent_name}, speak with a "
            f"{'woman' if _woman else 'man'}'s voice — you ARE {'a woman' if _woman else 'a man'}. "
            "In every language that marks the speaker's grammatical gender (Hindi, Marathi, "
            "Gujarati, Punjabi, and others), always refer to yourself with the correct "
            f"{'feminine' if _woman else 'masculine'} forms and never mix genders. For example in "
            "Hindi say " + (
                "\"मैं बताती हूँ\", \"मैं करती हूँ\", \"मैं आई हूँ\" (feminine) — never the masculine "
                "\"बताता / करता / आया हूँ\"."
                if _woman else
                "\"मैं बताता हूँ\", \"मैं करता हूँ\", \"मैं आया हूँ\" (masculine) — never the feminine "
                "\"बताती / करती / आई हूँ\"."
            )
        )

    parts.append(VOICE_STYLE_PROMPT)
    return "\n\n".join(parts)


def _gender_reminder_message(session: Session) -> dict | None:
    """Ported from agent/main.py's on_user_turn_completed — the one-time
    system-prompt gender instruction drifts over a long conversation (see
    build_system_prompt's comment), so this re-injects a short reminder
    before every turn's LLM call, same as the proven LiveKit path does."""
    if session.voice_gender not in ("male", "female"):
        return None
    _woman = session.voice_gender == "female"
    return {
        "role": "system",
        "content": (
            f"Reminder: you are {'a woman' if _woman else 'a man'} — in this reply, if you're "
            "speaking Hindi, Marathi, Gujarati, or Punjabi, use "
            + ("feminine (\"बताती/करती/आई हूँ\")" if _woman else "masculine (\"बताता/करता/आया हूँ\")")
            + " first-person verb forms, never the opposite."
        ),
    }


_DEFAULT_OPENER_HI = "{greeting} नमस्ते! ये {agent_name} है। बताइए, आपकी क्या मदद करूँ?"
_DEFAULT_OPENER_EN = "{greeting} this is {agent_name}. Thanks for calling — how can I help you today?"
_DEFAULT_OPENERS = {"hi-IN": _DEFAULT_OPENER_HI}


async def build_greeting_audio(session: Session) -> tuple[bytes, str] | None:
    """Speaks first, like agent/main.py's on_enter() — a fixed line via TTS
    only (no LLM round trip, so the caller isn't sitting in dead air for a
    generate_reply() cycle). Returns None when first_speaker == 'user', per
    the same opt-out agent/main.py supports."""
    if session.first_speaker == "user":
        return None
    if session.welcome_message:
        text = session.welcome_message
    else:
        greeting = f"Hi {session.visitor_name.split()[0]}," if session.visitor_name else "Hi,"
        template = _DEFAULT_OPENERS.get(session.reply_language, _DEFAULT_OPENER_EN)
        text = template.format(greeting=greeting, agent_name=session.agent_name)
    session.messages.append({"role": "assistant", "content": text})
    session.transcript.append({"role": "assistant", "text": text})
    audio, content_type = await tts.synthesize(session.voice, text, session.reply_language)
    return audio, content_type


_LISTENING_CUE_TEXT = {"hi-IN": "जी, बताइए।"}
_LISTENING_CUE_TEXT_DEFAULT = "Mm-hmm, go ahead."
_listening_cue_cache: dict[tuple[str, str], tuple[bytes, str]] = {}


async def get_listening_cue_audio(voice: str, reply_language: str) -> tuple[bytes, str]:
    """A short, near-instant acknowledgment ('yes, go ahead') played the
    moment a barge-in is detected — before STT/LLM/TTS have even started on
    what the caller actually said. Without this, the real ~1-2s pipeline
    latency after an interruption reads as dead air and callers hang up
    thinking the call dropped. Cached per (voice, language) at process
    scope — synthesized once, reused for every barge-in after that, so it
    never adds latency of its own after the first use."""
    key = (voice, reply_language)
    cached = _listening_cue_cache.get(key)
    if cached:
        return cached
    text = _LISTENING_CUE_TEXT.get(reply_language, _LISTENING_CUE_TEXT_DEFAULT)
    result = await tts.synthesize(voice, text, reply_language)
    _listening_cue_cache[key] = result
    return result


def _parse_json_config(raw, default):
    """db.get_agent_config returns a raw DB row, so JSON columns
    (custom_functions) arrive as strings — same defensive parse as
    agent/main.py's _parse_json_config."""
    if isinstance(raw, (list, dict)):
        return raw
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def build_tools_for_session(session: Session, custom_functions=None) -> None:
    """Merges the global tool set with any operator-defined custom
    functions for this agent, scoped to this Session instance only (mirrors
    agent/main.py building a fresh tool list per RealEstateAgent instance,
    not a process-global mutation)."""
    schemas = list(tools.TOOL_SCHEMAS)
    handlers = dict(tools.TOOL_FUNCTIONS)
    custom_functions = _parse_json_config(custom_functions, [])
    if custom_functions:
        custom_schemas, custom_handlers = tools.build_custom_function_tools(custom_functions)
        schemas.extend(custom_schemas)
        handlers.update(custom_handlers)
    session.tool_schemas = schemas
    session.tool_handlers = handlers


async def handle_utterance(session: Session, caller_wav_bytes: bytes) -> tuple[str, bytes, str]:
    """One full turn: STT the caller's utterance, run it through the LLM
    (with tools), TTS the reply. Returns (reply_text, reply_audio_bytes,
    reply_audio_content_type). Raises stt.STTError/tts.TTSError on a
    genuine provider failure — the telephony/browser adapter decides how to
    degrade (e.g. a filler "sorry, could you repeat that?").
    """
    if not session.messages:
        session.messages.append({"role": "system", "content": build_system_prompt(session)})

    caller_text = await stt.transcribe(caller_wav_bytes)
    if not caller_text:
        raise stt.STTError("No speech detected in utterance.")

    _update_reply_language(session, caller_text)

    session.transcript.append({"role": "user", "text": caller_text})
    session.messages.append({"role": "user", "content": caller_text})
    gender_reminder = _gender_reminder_message(session)
    if gender_reminder:
        session.messages.append(gender_reminder)

    reply_text, new_messages = await llm.run_turn(
        session.model, session.messages, session.tool_schemas, session.tool_handlers, session
    )
    session.messages.extend(new_messages)
    session.transcript.append({"role": "assistant", "text": reply_text})

    tone_kwargs = _tone_kwargs_for(session, caller_text)
    audio_bytes, content_type = await tts.synthesize(session.voice, reply_text, session.reply_language, **tone_kwargs)
    return reply_text, audio_bytes, content_type


def _tone_kwargs_for(session: Session, caller_text: str) -> dict:
    """Ported from agent/main.py's on_user_turn_completed live prosody
    adaptation (self.tts.update_options(pace=..., pitch=...)) — detects the
    caller's emotion from their last turn and returns the matching delta as
    kwargs for tts.synthesize(), applied on top of each provider's neutral
    baseline (Sarvam pace=1.0/pitch=0.0, ElevenLabs speed=1.0/style=0.0).
    Unlike agent/main.py there's no per-agent TONE_PRESETS base to layer
    onto (no such config exists in the orchestrator's Session yet) — this
    reacts relative to a flat neutral baseline, which still delivers real
    emotion-adaptive delivery instead of the completely static TTS the
    orchestrator had before. Returns {} for neutral/undetected emotion, so
    the synthesize() call is byte-identical to today's for the common case."""
    caller_emotion = emotion.detect_caller_emotion(caller_text)
    if not caller_emotion:
        return {}
    if session.tts_provider == "elevenlabs":
        delta = emotion.ELEVENLABS_EMOTION_DELTAS.get(caller_emotion)
        if not delta:
            return {}
        return {"speed": 1.0 + delta.get("speed", 0.0), "style": 0.0 + delta.get("style", 0.0)}
    delta = emotion.EMOTION_TONE_DELTAS.get(caller_emotion)
    if not delta:
        return {}
    return {"pace": 1.0 + delta.get("pace", 0.0), "pitch": 0.0 + delta.get("pitch", 0.0)}


class _OrderedTTSPipeline:
    """Overlaps TTS synthesis with delivery: as soon as llm.stream_turn()
    hands us a completed sentence, synthesis for it starts immediately in
    the background while the PREVIOUS sentence is still being sent — instead
    of synthesizing and sending one sentence fully before starting the next.
    A single consumer task sends finished clips strictly in enqueue order,
    so playback order is preserved even though synthesis overlaps.

    Without this, a long multi-sentence reply pays N sequential TTS round
    trips (~2-3s each on Sarvam) back to back — this cuts that to roughly
    one round trip's worth of added latency regardless of sentence count.
    """

    def __init__(
        self,
        voice: str,
        reply_language: str,
        on_reply_audio: Callable[[bytes, str], Awaitable[None]],
        tone_kwargs: dict | None = None,
    ) -> None:
        self._voice = voice
        self._reply_language = reply_language
        self._on_reply_audio = on_reply_audio
        self._tone_kwargs = tone_kwargs or {}
        self._queue: asyncio.Queue = asyncio.Queue()
        self._consumer = asyncio.create_task(self._consume())

    async def enqueue(self, sentence: str) -> None:
        synth_task = asyncio.create_task(
            tts.synthesize(self._voice, sentence, self._reply_language, **self._tone_kwargs)
        )
        await self._queue.put(synth_task)

    async def _consume(self) -> None:
        while True:
            synth_task = await self._queue.get()
            if synth_task is None:
                return
            try:
                audio_bytes, content_type = await synth_task
            except tts.TTSError as e:
                logger.warning("TTS failed for one sentence, skipping it: %s", e)
                continue
            await self._on_reply_audio(audio_bytes, content_type)

    async def close(self) -> None:
        """Graceful end-of-turn: drain and send whatever's still queued."""
        await self._queue.put(None)
        await self._consumer

    async def abort(self) -> None:
        """Barge-in / cancellation: stop immediately, drop anything queued.
        The consumer is its own asyncio.Task (a sibling, not a child of
        whatever coroutine called enqueue()), so cancelling the turn that
        created this pipeline does NOT automatically stop it — without this,
        already-queued sentences would keep getting sent after a barge-in."""
        self._consumer.cancel()
        try:
            await self._consumer
        except asyncio.CancelledError:
            pass


async def handle_utterance_streaming(
    session: Session,
    caller_wav_bytes: bytes,
    on_reply_audio: Callable[[bytes, str], Awaitable[None]],
    on_transcript: Callable[[str, str], Awaitable[None]] | None = None,
) -> str:
    """Same STT -> LLM -> TTS turn as handle_utterance, but pipelined:
    llm.stream_turn() calls back per-sentence as the model generates them,
    each sentence is synthesized and delivered via on_reply_audio()
    immediately — the caller hears the first sentence while the model is
    still writing the rest, instead of waiting for the full reply then the
    full TTS render. Returns the full reply text (for transcript/logging).
    Raises stt.STTError the same way handle_utterance does; a mid-reply
    tts.TTSError is swallowed per-sentence (skip that sentence, keep going)
    rather than aborting an otherwise-fine reply.

    on_transcript, when given, is called with ("user"|"assistant", text) as
    each side's text becomes final — the browser adapter uses this to push
    a live transcript over the WS; the phone path has no on-screen surface
    for it and leaves this None.
    """
    if not session.messages:
        session.messages.append({"role": "system", "content": build_system_prompt(session)})

    caller_text = await stt.transcribe(caller_wav_bytes)
    if not caller_text:
        raise stt.STTError("No speech detected in utterance.")

    _update_reply_language(session, caller_text)

    session.transcript.append({"role": "user", "text": caller_text})
    session.messages.append({"role": "user", "content": caller_text})
    gender_reminder = _gender_reminder_message(session)
    if gender_reminder:
        session.messages.append(gender_reminder)
    if on_transcript:
        await on_transcript("user", caller_text)

    tone_kwargs = _tone_kwargs_for(session, caller_text)
    pipeline = _OrderedTTSPipeline(session.voice, session.reply_language, on_reply_audio, tone_kwargs)

    async def _on_sentence(sentence: str) -> None:
        # Just enqueue — returns immediately so llm.stream_turn() can keep
        # consuming the model's stream for the NEXT sentence right away,
        # instead of blocking here for the ~2-3s this sentence's TTS takes.
        await pipeline.enqueue(sentence)
        if on_transcript:
            # Per-sentence, not just once at the end with the full reply —
            # a multi-sentence reply's audio starts playing immediately as
            # each sentence is synthesized, but the full reply_text isn't
            # known until stream_turn fully finishes. Waiting for that made
            # the transcript visibly lag several seconds behind the audio.
            await on_transcript("assistant", sentence)

    try:
        reply_text, new_messages = await llm.stream_turn(
            session.model, session.messages, session.tool_schemas, session.tool_handlers, session, _on_sentence
        )
    except asyncio.CancelledError:
        await pipeline.abort()
        raise
    await pipeline.close()
    session.messages.extend(new_messages)
    session.transcript.append({"role": "assistant", "text": reply_text})
    return reply_text


def build_save_call_record(session: Session, room_name: str) -> dict:
    """Shapes this session into the exact dict db.save_call expects — same
    keys agent/main.py's log_call builds, so the dashboard/billing/CRM
    contract stays unchanged regardless of which engine produced the call."""
    ended_at = datetime.datetime.now(datetime.timezone.utc)
    duration_seconds = (ended_at - session.started_at).total_seconds()
    record = {
        "room_name": room_name,
        "visitor_identity": session.visitor_phone or session.visitor_name or "",
        "started_at": session.started_at.strftime("%Y-%m-%d %H:%M:%S"),
        "ended_at": ended_at.strftime("%Y-%m-%d %H:%M:%S"),
        "duration_seconds": duration_seconds,
        "reply_language": session.reply_language,
        "voice": session.voice,
        "transcript": session.transcript,
        "call_type": session.call_type,
        "site_id": session.site_id,
        "agent_id": session.agent_id,
        "account_id": session.account_id,
        **session.lead_data,
    }
    return record


async def _post_call_summary(transcript: list[dict]) -> str:
    """Simplified port of agent/main.py's _post_call_analysis — just the
    memory-summary half (the operator-defined structured-field extraction
    half has no orchestrator config equivalent yet, so isn't ported).
    Best-effort — returns "" on any failure so call teardown never breaks."""
    if not transcript:
        return ""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return ""
    convo = "\n".join(f"{t['role']}: {t['text']}" for t in transcript if t.get("text"))[:6000]
    if not convo:
        return ""
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this voice-call transcript in 1-3 sentences capturing who the "
                        "caller is and what they wanted, written to help recognize and help them on "
                        "a future call. Respond with ONLY the summary text, nothing else."
                    ),
                },
                {"role": "user", "content": convo},
            ],
            temperature=0,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        logger.warning("post-call summary failed", exc_info=True)
        return ""


async def finalize_call(session: Session, room_name: str) -> int | None:
    """Persists the call, fires the call_completed integration event and
    per-agent webhook — same call-end contract as agent/main.py's log_call.
    """
    record = build_save_call_record(session, room_name)
    call_id = db.save_call(record)
    event = {
        "type": "call_completed",
        "name": session.lead_data.get("name") or session.visitor_name,
        "phone": session.lead_data.get("phone") or session.visitor_phone,
        "email": session.visitor_email,
        "transcript": session.transcript,
        "duration_seconds": record["duration_seconds"],
        "channel": session.call_type,
        "language": session.reply_language,
        "agent_name": session.agent_name,
        "extracted_data": {},
    }
    await tools._post_webhook(event)
    await tools._deliver_to_integrations(session.account_id, event, call_id=call_id)

    if session.memory_enabled and session.visitor_phone and session.agent_id:
        summary = await _post_call_summary(session.transcript)
        if summary:
            db.save_caller_memory(session.account_id, session.agent_id, session.visitor_phone, summary)

    return call_id
