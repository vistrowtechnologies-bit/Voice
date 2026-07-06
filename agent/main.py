import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, TurnHandlingOptions, WorkerOptions, cli, llm
from livekit.plugins import openai, sarvam

import db
from emotion import is_frustrated
from language import detect_reply_language
from prompts.real_estate_qualification import SALES_REP_SYSTEM_PROMPT
from tools import book_site_visit, check_availability, log_lead

load_dotenv()
db.init_db()

logger = logging.getLogger("real-estate-voice-agent")
logger.setLevel(logging.INFO)

# Normal, neutral delivery vs. a calmer one used to de-escalate a frustrated
# caller. Kept subtle — 0.85 pace read as sluggish rather than calm in
# testing. Sarvam's pace/pitch ranges are [0.3, 3.0] / [-0.75, 0.75].
NEUTRAL_VOICE = {"pace": 1.0, "pitch": 0.0}
CALM_VOICE = {"pace": 0.95, "pitch": -0.08}

# A single code-switched word/phrase shouldn't flip the reply language —
# require the same candidate language across this many consecutive turns
# (roughly "a couple of sentences") before actually switching.
LANGUAGE_SWITCH_CONFIRMATION_TURNS = 3


class RealEstateAgent(Agent):
    def __init__(self, config: dict | None = None) -> None:
        # Dashboard-managed settings (agents table, edited via the web UI)
        # override the code defaults, so prompt/voice/model/KB changes apply
        # on the next call without a redeploy. Missing table or empty fields
        # fall back to the in-code defaults.
        config = config or {}
        instructions = config.get("system_prompt") or SALES_REP_SYSTEM_PROMPT
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
        self._calm_mode = False
        self._reply_language = reply_language
        self._pending_language: str | None = None
        self._pending_language_streak = 0

    async def on_enter(self) -> None:
        self.session.generate_reply()

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = new_message.text_content

        frustrated = is_frustrated(text)
        if frustrated != self._calm_mode:
            self._calm_mode = frustrated
            self.tts.update_options(**(CALM_VOICE if frustrated else NEUTRAL_VOICE))
            logger.info("switching voice delivery to %s", "calm" if frustrated else "neutral")

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


def _agent_id_from_job(ctx: JobContext) -> int | None:
    """Inbound phone calls arrive in a room whose metadata (set by the SIP
    dispatch rule in server/livekit_sip.py) names which dashboard agent should
    handle the dialed number. Browser calls have no such metadata. Returns None
    on anything unexpected, so we fall back to the default first-agent config.
    """
    try:
        raw = ctx.job.room.metadata
    except Exception:
        return None
    if not raw:
        return None
    try:
        agent_id = json.loads(raw).get("agent_id")
    except (ValueError, AttributeError):
        return None
    return int(agent_id) if agent_id is not None else None


async def entrypoint(ctx: JobContext) -> None:
    logger.info("starting session in room %s", ctx.room.name)
    config = db.get_agent_config(_agent_id_from_job(ctx))
    if config and config.get("status") == "paused":
        # Paused from the dashboard — don't take the call.
        logger.info("agent '%s' is paused; skipping room %s", config.get("name"), ctx.room.name)
        return
    started_at = datetime.now(timezone.utc)
    lead_data: dict = {}
    agent = RealEstateAgent(config)
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
