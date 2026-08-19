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


def _substitute_template_vars(session: Session, text: str) -> str:
    """Ported from agent/main.py's _substitute_template_vars — fills
    {{first_name}}/{{last_name}}/{{name}}/{{phone}}/{{company}}/
    {{custom.KEY}} tokens (in an operator-authored custom_system_prompt from
    a campaign dial's CSV import, or a welcome_message set on the agent)
    with this call's contact data. An unmatched token is left blank rather
    than as literal braces, since a stray "{{whatever}}" read aloud by the
    TTS is far more jarring than a silently-dropped clause."""
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

    # A blank value (e.g. no visitor name on a test call) still leaves the
    # token's surrounding punctuation/spacing behind - "नमस्कार {{name}}!"
    # becomes "नमस्कार !", a stray space before the "!" that reads as
    # broken. Collapse whitespace runs and drop any space directly before
    # punctuation so a skipped variable disappears cleanly.
    filled = _TEMPLATE_VAR_RE.sub(repl, text)
    filled = re.sub(r"[ \t]{2,}", " ", filled)
    filled = re.sub(r" +([!?.,।])", r"\1", filled)
    return filled.strip()


async def build_system_prompt(session: Session) -> str:
    """Assembles the system prompt: persona + KB + voice-style rules. See
    module docstring re: fidelity vs. agent/main.py's full prompt assembly.

    async (and its db.* calls wrapped in asyncio.to_thread) because
    orchestrator/db.py's connection pool is synchronous/blocking - called
    directly, one slow or newly-establishing DB connection freezes the
    WHOLE event loop, stalling every other concurrent call, not just this
    one. Confirmed live: a region migration that put this process further
    from Postgres turned an unrelated call's start_stream into a ~20s
    stall, entirely because something else in the same process was
    blocked on a synchronous DB call at that moment."""
    if session.custom_system_prompt:
        persona = (
            _substitute_template_vars(session, session.custom_system_prompt)
            if "{{" in session.custom_system_prompt
            else session.custom_system_prompt
        )
    else:
        persona = build_generic_assistant_prompt(session.agent_name, session.business_name)

    parts = [persona]
    if session.kb_id is not None:
        kb_text = await asyncio.to_thread(db.get_kb_content, session.kb_id)
        if kb_text:
            if await asyncio.to_thread(db.is_kb_strict, session.kb_id):
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

    memory = (
        await asyncio.to_thread(db.get_caller_memory, session.agent_id, session.visitor_phone)
        if session.agent_id
        else ""
    )
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
        # training data, fighting this instruction turn after turn. Confirmed
        # live on a female voice (Ritu) still saying "बताता हूँ" (masculine)
        # even with a single mid-prompt mention — prepending this as the
        # very FIRST part of the prompt and widening the verb table across
        # all four gendered languages measurably helps.
        _woman = session.voice_gender == "female"
        _f = "feminine" if _woman else "masculine"
        _examples = (
            "Hindi: \"मैं बताती हूँ\", \"मैं करती हूँ\", \"मैं आई हूँ\", \"मैं समझती हूँ\", \"मैं देख रही हूँ\" "
            "— never \"बताता / करता / आया / समझता / देख रहा हूँ\".\n"
            "Marathi: \"मी सांगते\", \"मी करते\", \"मी आले\" — never \"सांगतो / करतो / आलो\".\n"
            "Gujarati: \"હું કહું છું\" stays the same, but \"હું આવી\" — never \"આવ્યો\".\n"
            "Punjabi: \"ਮੈਂ ਦੱਸਦੀ ਹਾਂ\", \"ਮੈਂ ਆਈ ਹਾਂ\" — never \"ਦੱਸਦਾ / ਆਇਆ ਹਾਂ\"."
            if _woman else
            "Hindi: \"मैं बताता हूँ\", \"मैं करता हूँ\", \"मैं आया हूँ\", \"मैं समझता हूँ\", \"मैं देख रहा हूँ\" "
            "— never \"बताती / करती / आई / समझती / देख रही हूँ\".\n"
            "Marathi: \"मी सांगतो\", \"मी करतो\", \"मी आलो\" — never \"सांगते / करते / आले\".\n"
            "Gujarati: \"હું કહું છું\" stays the same, but \"હું આવ્યો\" — never \"આવી\".\n"
            "Punjabi: \"ਮੈਂ ਦੱਸਦਾ ਹਾਂ\", \"ਮੈਂ ਆਇਆ ਹਾਂ\" — never \"ਦੱਸਦੀ / ਆਈ ਹਾਂ\"."
        )
        parts.insert(
            0,
            f"# Your identity — read this first, it governs everything below\n"
            f"You, {session.agent_name}, ARE {'a woman' if _woman else 'a man'} — this is not a "
            f"persona detail buried in a longer prompt, it is who you are on every single "
            f"turn of this call, from your very first word to your last. In every language "
            f"that marks the speaker's grammatical gender (Hindi, Marathi, Gujarati, Punjabi, "
            f"and others), ALWAYS use {_f} first-person verb forms — never the opposite, "
            f"never mixed, not even once, not even under time pressure mid-sentence. This "
            f"holds even if a caller addresses you with the wrong gender or asks something "
            f"unrelated — your own self-reference never changes. Concretely:\n{_examples}",
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
            f"You are {'a woman' if _woman else 'a man'} — in THIS reply, if you use Hindi, "
            "Marathi, Gujarati, or Punjabi, every first-person verb must be "
            + ("feminine: बताती/करती/आई/समझती/देख रही हूँ, मी सांगते/करते/आले, હું આવી, "
               "ਮੈਂ ਦੱਸਦੀ/ਆਈ ਹਾਂ"
               if _woman else
               "masculine: बताता/करता/आया/समझता/देख रहा हूँ, मी सांगतो/करतो/आलो, હું આવ્યો, "
               "ਮੈਂ ਦੱਸਦਾ/ਆਇਆ ਹਾਂ")
            + f" — the {'masculine' if _woman else 'feminine'} form is wrong every time, "
            "with no exceptions, no matter what was said in earlier turns."
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
    # Must run before the greeting appends its own assistant message below -
    # handle_utterance[_streaming] only seed the system prompt when
    # session.messages is still empty, so a greeting spoken first (the
    # normal case) was silently skipping it forever: the whole call ran
    # with no persona, no KB, nothing but bare chat history, which is why
    # the model would confidently invent facts instead of using the real
    # knowledge base or even its assigned persona.
    if not session.messages:
        session.messages.append({"role": "system", "content": await build_system_prompt(session)})
    if session.welcome_message:
        text = (
            _substitute_template_vars(session, session.welcome_message)
            if "{{" in session.welcome_message
            else session.welcome_message
        )
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


def listening_cue_text(reply_language: str) -> str:
    """The exact words get_listening_cue_audio will speak — so a caller can
    record the cue in the transcript without duplicating the lookup."""
    return _LISTENING_CUE_TEXT.get(reply_language, _LISTENING_CUE_TEXT_DEFAULT)


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
        session.messages.append({"role": "system", "content": await build_system_prompt(session)})

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


class _BufferedTTSStream:
    """Actively drains an async generator of ulaw chunks into an internal
    queue from the moment this is constructed — a background task, not lazy
    iteration — so synthesis for this sentence starts immediately, the same
    "starts now, overlaps whatever the pipeline is still sending" property
    asyncio.create_task(tts.synthesize(...)) already gives the batch path
    below. Without this, a bare async generator does nothing until the
    consumer starts iterating it (Python generators are lazy), which would
    silently lose the overlap and let synthesis start only once this
    sentence's turn to be sent actually arrives."""

    def __init__(self, source) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()
        self._task = asyncio.create_task(self._drain(source))

    async def _drain(self, source) -> None:
        try:
            async for chunk in source:
                await self._queue.put(("chunk", chunk))
        except tts.TTSError as e:
            await self._queue.put(("error", e))
        except Exception as e:  # noqa: BLE001 — surfaced to the consumer as a TTSError, not swallowed
            await self._queue.put(("error", tts.TTSError(f"Streaming TTS failed: {e}")))
        finally:
            await self._queue.put(("end", None))

    async def chunks(self):
        while True:
            kind, value = await self._queue.get()
            if kind == "chunk":
                yield value
            elif kind == "error":
                raise value
            else:
                return

    def cancel(self) -> None:
        self._task.cancel()


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

    on_reply_chunk, when given, is tried first for each sentence — real
    streaming delivery (chunks handed to the caller as they arrive from
    tts.synthesize_stream, instead of waiting for the whole sentence to
    finish synthesizing). tts.synthesize_stream returns None for any
    voice/provider it doesn't support yet (ElevenLabs, Google — see its
    docstring), and this pipeline falls back to the batch on_reply_audio
    path for that one sentence when it does, so a call using a mixed or
    unsupported voice degrades to exactly today's behavior rather than
    failing.
    """

    def __init__(
        self,
        voice: str,
        reply_language: str,
        on_reply_audio: Callable[[bytes, str], Awaitable[None]],
        on_reply_chunk: Callable[[object], Awaitable[None]] | None = None,
        tone_kwargs: dict | None = None,
    ) -> None:
        self._voice = voice
        self._reply_language = reply_language
        self._on_reply_audio = on_reply_audio
        self._on_reply_chunk = on_reply_chunk
        self._tone_kwargs = tone_kwargs or {}
        self._queue: asyncio.Queue = asyncio.Queue()
        # Sentences whose audio actually started going out, in order. Read by
        # handle_utterance_streaming when a barge-in cancels the turn: without
        # it, the words the caller genuinely heard before interrupting are
        # thrown away with the cancelled reply, and the whole turn records as
        # nothing at all (confirmed live - a barge-in loop looked like total
        # silence in the dashboard while the caller was hearing real speech).
        self.spoken: list[str] = []
        self._consumer = asyncio.create_task(self._consume())
        # Every _BufferedTTSStream currently open (queued or actively being
        # consumed) — abort() needs this to cancel their background drain
        # tasks explicitly; cancelling self._consumer alone doesn't touch
        # them, same sibling-task reasoning as self._consumer itself.
        self._active_streams: list[_BufferedTTSStream] = []

    async def enqueue(self, sentence: str) -> None:
        stream = None
        if self._on_reply_chunk is not None:
            # tone_kwargs (pace/pitch) only apply to Sarvam's speed/pitch
            # knobs, which synthesize_stream shares with synthesize() — see
            # tts._synth_sarvam_stream's signature.
            pace = self._tone_kwargs.get("pace")
            pitch = self._tone_kwargs.get("pitch")
            stream = tts.synthesize_stream(self._voice, sentence, self._reply_language, pace=pace, pitch=pitch)
        if stream is not None:
            buffered = _BufferedTTSStream(stream)
            self._active_streams.append(buffered)
            await self._queue.put(("stream", buffered, sentence))
            return
        synth_task = asyncio.create_task(
            tts.synthesize(self._voice, sentence, self._reply_language, **self._tone_kwargs)
        )
        await self._queue.put(("batch", synth_task, sentence))

    async def _consume(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                return
            kind, payload, sentence = item
            try:
                if kind == "stream":
                    # Marked before sending, same reasoning as the batch
                    # path below — a barge-in mid-stream still means the
                    # caller heard the start of it.
                    self.spoken.append(sentence)
                    try:
                        await self._on_reply_chunk(payload.chunks())
                    finally:
                        if payload in self._active_streams:
                            self._active_streams.remove(payload)
                else:
                    audio_bytes, content_type = await payload
                    # Marked before the send, not after: _send_reply_audio paces
                    # frames in real time, so a barge-in landing mid-sentence still
                    # means the caller heard the start of it. "Started playing" is
                    # the honest signal for a transcript meant to reflect what was
                    # actually said aloud; "finished playing" would silently drop
                    # exactly the interrupted sentence we most want recorded.
                    self.spoken.append(sentence)
                    await self._on_reply_audio(audio_bytes, content_type)
            except tts.TTSError as e:
                logger.warning("TTS failed for one sentence, skipping it: %s", e)
                continue

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
        # Cancelling the consumer above doesn't touch any _BufferedTTSStream's
        # own background drain task — another sibling-task relationship, same
        # reasoning as the consumer itself. Without this, every barge-in
        # leaves an open Sarvam WebSocket connection running to completion
        # in the background instead of actually stopping.
        for stream in self._active_streams:
            stream.cancel()
        self._active_streams.clear()


async def handle_utterance_streaming(
    session: Session,
    caller_wav_bytes: bytes,
    on_reply_audio: Callable[[bytes, str], Awaitable[None]],
    on_transcript: Callable[[str, str], Awaitable[None]] | None = None,
    on_reply_chunk: Callable[[object], Awaitable[None]] | None = None,
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

    on_reply_chunk, when given, is _OrderedTTSPipeline's real-streaming path
    — see its docstring. Left None for the browser adapter on purpose: it
    already gets a whole clip near-instantly (see server.py's browser
    _send_reply_audio comment) and expects one self-describing WAV/MP3 blob
    it can decodeAudioData() in one shot, not raw ulaw frames, so streaming
    there would be a regression, not a win. Phone calls pass it; browser
    calls don't and fall back to on_reply_audio for every sentence,
    identical to today.
    """
    if not session.messages:
        session.messages.append({"role": "system", "content": await build_system_prompt(session)})

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
    pipeline = _OrderedTTSPipeline(session.voice, session.reply_language, on_reply_audio, on_reply_chunk, tone_kwargs)

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
        # pipeline.close() is inside this same try, not after it: the
        # consumer task (streaming already-queued sentences out) is a
        # sibling task, not a child of this coroutine, so a cancellation
        # that lands while awaiting close() (i.e. the model already
        # finished generating and we're just draining/sending remaining
        # audio - the most likely moment for a real barge-in, since that's
        # most of a turn's wall-clock time) would otherwise propagate
        # straight out WITHOUT ever calling pipeline.abort(), leaving the
        # consumer running and the interrupted reply's audio still playing
        # to completion. Confirmed as the actual reason barge-in silently
        # failed to stop in-flight audio even when the cancellation itself
        # fired correctly.
        await pipeline.close()
    except asyncio.CancelledError:
        await pipeline.abort()
        # A cancelled turn re-raises past the transcript append below, so
        # without this a barged-in reply is recorded as if the agent never
        # spoke - the single reason a barge-in failure loop was invisible in
        # transcripts and could only be inferred from what the caller
        # reported hearing. Flagged `interrupted` rather than written as a
        # normal turn: this is what was said aloud up to the cut, not a
        # complete reply, and anything reading these rows should be able to
        # tell the difference.
        spoken = " ".join(pipeline.spoken).strip()
        if spoken:
            session.transcript.append({"role": "assistant", "text": spoken, "interrupted": True})
        raise
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
    call_id = await asyncio.to_thread(db.save_call, record)
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
            await asyncio.to_thread(
                db.save_caller_memory, session.account_id, session.agent_id, session.visitor_phone, summary
            )

    return call_id
