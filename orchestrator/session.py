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

import datetime
import logging
from dataclasses import dataclass, field
from typing import Callable

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


def build_tools_for_session(session: Session, custom_functions: list[dict] | None = None) -> None:
    """Merges the global tool set with any operator-defined custom
    functions for this agent, scoped to this Session instance only (mirrors
    agent/main.py building a fresh tool list per RealEstateAgent instance,
    not a process-global mutation)."""
    schemas = list(tools.TOOL_SCHEMAS)
    handlers = dict(tools.TOOL_FUNCTIONS)
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

    detected = detect_reply_language(caller_text)
    if detected:
        session.reply_language = detected

    session.transcript.append({"role": "user", "text": caller_text})
    session.messages.append({"role": "user", "content": caller_text})

    reply_text, new_messages = await llm.run_turn(
        session.model, session.messages, session.tool_schemas, session.tool_handlers, session
    )
    session.messages.extend(new_messages)
    session.transcript.append({"role": "assistant", "text": reply_text})

    audio_bytes, content_type = await tts.synthesize(session.voice, reply_text, session.reply_language)
    return reply_text, audio_bytes, content_type


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
