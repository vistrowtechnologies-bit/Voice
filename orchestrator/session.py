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
from dataclasses import dataclass, field
from typing import Awaitable, Callable

import db
import llm
import stt
import tts
import tools
import voice_catalog
from language import LANGUAGE_NAMES, detect_reply_language
from prompts.generic_assistant import build_generic_assistant_prompt
from prompts.voice_style import VOICE_STYLE_PROMPT

logger = logging.getLogger("orchestrator-session")


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

    Requires LANGUAGE_SWITCH_CONFIRMATION_TURNS consecutive turns agreeing
    on the same candidate before actually switching, and treats a
    Devanagari "hi-IN" reading as a non-signal on an already-mr-IN session
    (script alone can't distinguish Hindi from Marathi)."""
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

    if session.pending_language_streak >= LANGUAGE_SWITCH_CONFIRMATION_TURNS:
        session.reply_language = candidate
        session.pending_language = None
        session.pending_language_streak = 0


def build_system_prompt(session: Session) -> str:
    """Assembles the system prompt: persona + KB + voice-style rules. See
    module docstring re: fidelity vs. agent/main.py's full prompt assembly."""
    if session.custom_system_prompt:
        persona = session.custom_system_prompt
    else:
        persona = build_generic_assistant_prompt(session.agent_name, session.business_name)

    parts = [persona]
    if session.kb_id is not None:
        kb_text = db.get_kb_content(session.kb_id)
        if kb_text:
            strict = db.is_kb_strict(session.kb_id)
            header = (
                "## Knowledge base (answer ONLY from this for factual questions; if it's not "
                "covered here, say you don't have that information rather than guessing)"
                if strict
                else "## Knowledge base (use this for factual questions; you may also use general knowledge)"
            )
            parts.append(f"{header}\n{kb_text}")

    memory = db.get_caller_memory(session.agent_id, session.visitor_phone) if session.agent_id else ""
    if memory:
        parts.append(f"## What you remember about this caller from before\n{memory}")

    parts.append(VOICE_STYLE_PROMPT)
    return "\n\n".join(parts)


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

    reply_text, new_messages = await llm.run_turn(
        session.model, session.messages, session.tool_schemas, session.tool_handlers, session
    )
    session.messages.extend(new_messages)
    session.transcript.append({"role": "assistant", "text": reply_text})

    audio_bytes, content_type = await tts.synthesize(session.voice, reply_text, session.reply_language)
    return reply_text, audio_bytes, content_type


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
        self, voice: str, reply_language: str, on_reply_audio: Callable[[bytes, str], Awaitable[None]]
    ) -> None:
        self._voice = voice
        self._reply_language = reply_language
        self._on_reply_audio = on_reply_audio
        self._queue: asyncio.Queue = asyncio.Queue()
        self._consumer = asyncio.create_task(self._consume())

    async def enqueue(self, sentence: str) -> None:
        synth_task = asyncio.create_task(tts.synthesize(self._voice, sentence, self._reply_language))
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
    if on_transcript:
        await on_transcript("user", caller_text)

    pipeline = _OrderedTTSPipeline(session.voice, session.reply_language, on_reply_audio)

    async def _on_sentence(sentence: str) -> None:
        # Just enqueue — returns immediately so llm.stream_turn() can keep
        # consuming the model's stream for the NEXT sentence right away,
        # instead of blocking here for the ~2-3s this sentence's TTS takes.
        await pipeline.enqueue(sentence)

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
    if on_transcript and reply_text:
        await on_transcript("assistant", reply_text)
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
    return call_id
