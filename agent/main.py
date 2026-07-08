import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, TurnHandlingOptions, WorkerOptions, cli, llm
from livekit.plugins import openai, sarvam

import db
from language import detect_reply_language
from prompts.real_estate_qualification import build_sales_rep_prompt
from tools import book_site_visit, check_availability, log_lead

load_dotenv()
db.init_db()

logger = logging.getLogger("real-estate-voice-agent")
logger.setLevel(logging.INFO)

# A single code-switched word/phrase shouldn't flip the reply language —
# require the same candidate language across this many consecutive turns
# (roughly "a couple of sentences") before actually switching.
LANGUAGE_SWITCH_CONFIRMATION_TURNS = 3


class RealEstateAgent(Agent):
    def __init__(
        self,
        config: dict | None = None,
        visitor_name: str | None = None,
        visitor_phone: str | None = None,
    ) -> None:
        # Dashboard-managed settings (agents table, edited via the web UI)
        # override the code defaults, so prompt/voice/model/KB changes apply
        # on the next call without a redeploy. Missing table or empty fields
        # fall back to the in-code defaults.
        config = config or {}
        instructions = config.get("system_prompt") or build_sales_rep_prompt(config.get("name") or "Riya")
        if visitor_name and visitor_phone:
            # Website-widget calls collect these in a pre-call form, so the
            # agent already has them — this both stops it re-asking (the
            # built-in prompt's own goal list says "if not already known
            # from the call context") and guarantees log_call() below has a
            # name/phone to save even if the agent's log_lead tool never
            # fires during a short or abandoned call.
            instructions += (
                f"\n\n# Caller context\nThe caller already gave their name ({visitor_name}) and phone "
                f"number ({visitor_phone}) before this call started — you already know them, don't ask "
                "again unless you need to confirm one of them."
            )
        if config.get("kb_id"):
            kb = db.get_kb_content(config["kb_id"])
            if kb:
                instructions += (
                    "\n\n# Knowledge base — verified project facts you may rely on\n" + kb
                )
        reply_language = config.get("language") or "hi-IN"
        super().__init__(
            instructions=instructions,
            stt=sarvam.STT(
                # "unknown" is a first-class value on saaras:v3 covering 20+
                # Indian languages (Hindi, Marathi, Malayalam, Gujarati, Tamil,
                # Telugu, Kannada, Bengali, Punjabi, Odia, English, and more) —
                # needed since we support more than just Hindi/English.
                # "codemix" mode is Hindi-English-specific; plain "transcribe"
                # is Sarvam's general-purpose multi-language mode.
                language="unknown",
                model="saaras:v3",
                mode="transcribe",
                flush_signal=True,
            ),
            llm=openai.LLM(model=config.get("model") or "gpt-4.1"),
            tts=sarvam.TTS(
                target_language_code=reply_language,
                model="bulbul:v3",
                speaker=config.get("voice") or "pooja",
            ),
            tools=[check_availability, book_site_visit, log_lead],
        )
        self._reply_language = reply_language
        self._pending_language: str | None = None
        self._pending_language_streak = 0

    async def on_enter(self) -> None:
        self.session.generate_reply()

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = new_message.text_content

        candidate = detect_reply_language(text)
        if candidate is None or candidate == self._reply_language:
            # Ambiguous turn, or already the current language — nothing to
            # confirm. Reset the streak so a one-off stray word elsewhere
            # doesn't half-count toward a future switch.
            self._pending_language = None
            self._pending_language_streak = 0
            return

        if candidate == self._pending_language:
            self._pending_language_streak += 1
        else:
            self._pending_language = candidate
            self._pending_language_streak = 1

        if self._pending_language_streak >= LANGUAGE_SWITCH_CONFIRMATION_TURNS:
            self._reply_language = candidate
            self._pending_language = None
            self._pending_language_streak = 0
            self.tts.update_options(target_language_code=candidate)
            logger.info("switching reply language to %s", candidate)


def _call_context_from_job(ctx: JobContext) -> dict:
    """Room metadata names which dashboard agent should handle this call, and
    (for phone/widget calls) which number or site it came in on:

    - Phone: {"agent_id", "phone_number"} — stamped by the SIP dispatch rule
      in server/livekit_sip.py.
    - Website widget: {"agent_id", "site_id", "visitor_name", "visitor_phone"}
      — stamped by /widget/token in server/token_api.py from its pre-call
      name/phone form.
    - Dashboard "Browser test": {"agent_id"} only — from /token.
    - Public demo call page: no metadata at all.

    Returns {"agent_id": int|None, "call_type": "phone"|"widget"|"browser",
    "site_id": int|None, "visitor_name": str|None, "visitor_phone": str|None},
    defaulting to the "browser" catch-all on anything unexpected so the call
    still gets handled by the default agent.
    """
    default = {
        "agent_id": None,
        "call_type": "browser",
        "site_id": None,
        "visitor_name": None,
        "visitor_phone": None,
    }
    try:
        raw = ctx.job.room.metadata
    except Exception:
        return default
    if not raw:
        return default
    try:
        meta = json.loads(raw)
    except ValueError:
        return default

    agent_id = meta.get("agent_id")
    site_id = meta.get("site_id")
    call_type = "phone" if meta.get("phone_number") else "widget" if site_id is not None else "browser"
    return {
        "agent_id": int(agent_id) if agent_id is not None else None,
        "call_type": call_type,
        "site_id": int(site_id) if site_id is not None else None,
        "visitor_name": meta.get("visitor_name"),
        "visitor_phone": meta.get("visitor_phone"),
    }


async def entrypoint(ctx: JobContext) -> None:
    logger.info("starting session in room %s", ctx.room.name)
    call_context = _call_context_from_job(ctx)
    config = db.get_agent_config(call_context["agent_id"])
    if config and config.get("status") == "paused":
        # Paused from the dashboard — don't take the call.
        logger.info("agent '%s' is paused; skipping room %s", config.get("name"), ctx.room.name)
        return
    started_at = datetime.now(timezone.utc)
    # Pre-seed with whatever the visitor already typed into the widget's
    # pre-call form, so the call log has a name/phone even if the agent's
    # own log_lead tool never runs (call ends early, visitor hangs up, etc).
    # The agent's own log_lead call later still overwrites these if it
    # captures something more specific during the conversation.
    lead_data: dict = {}
    if call_context["visitor_name"]:
        lead_data["name"] = call_context["visitor_name"]
    if call_context["visitor_phone"]:
        lead_data["phone"] = call_context["visitor_phone"]
    agent = RealEstateAgent(config, call_context["visitor_name"], call_context["visitor_phone"])
    session = AgentSession(
        userdata={"room": ctx.room, "lead_data": lead_data},
        # A single stray word (noise, STT hallucination, or TTS bleeding
        # back into the mic) shouldn't be enough to interrupt the agent
        # mid-sentence — require a couple of real words first.
        turn_handling=TurnHandlingOptions(interruption={"min_words": 2}),
    )

    # Captured via event, not a point-in-time read — by the time the job
    # drains and the shutdown callback runs, the visitor has already left the
    # participant list, and `ctx.room` isn't populated yet this early either
    # (the room only actually connects during session.start() below).
    visitor_holder: dict[str, str | None] = {"identity": None}

    def _on_participant_connected(participant) -> None:
        logger.info("DEBUG participant_connected fired: %s", participant.identity)
        if visitor_holder["identity"] is None:
            visitor_holder["identity"] = participant.identity

    ctx.room.on("participant_connected", _on_participant_connected)
    logger.info(
        "DEBUG at listener-register time, remote_participants=%s",
        list(ctx.room.remote_participants.keys()),
    )
    for existing in ctx.room.remote_participants.values():
        _on_participant_connected(existing)

    async def log_call() -> None:
        ended_at = datetime.now(timezone.utc)
        transcript = [
            {"role": item.role, "text": item.text_content}
            for item in session.history.items
            if getattr(item, "text_content", None)
        ]
        try:
            db.save_call(
                {
                    "room_name": ctx.room.name,
                    "visitor_identity": visitor_holder["identity"],
                    "started_at": started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                    "duration_seconds": (ended_at - started_at).total_seconds(),
                    "reply_language": agent._reply_language,
                    "transcript": transcript,
                    "call_type": call_context["call_type"],
                    "site_id": call_context["site_id"],
                    **lead_data,
                }
            )
            logger.info("saved call log for room %s (%d turns)", ctx.room.name, len(transcript))
        except Exception:
            logger.exception("failed to save call log for room %s", ctx.room.name)

    ctx.add_shutdown_callback(log_call)
    await session.start(agent=agent, room=ctx.room)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
