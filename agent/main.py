import asyncio
import json
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from livekit import api
from livekit.agents import Agent, AgentSession, JobContext, TurnHandlingOptions, WorkerOptions, cli, llm
from livekit.plugins import google, openai, sarvam

import db
from language import LANGUAGE_NAMES, detect_reply_language
from prompts.platform_assistant import build_platform_assistant_prompt
from prompts.real_estate_qualification import build_sales_rep_prompt
from tools import book_site_visit, capture_platform_lead, check_availability, end_call, log_lead

load_dotenv()
db.init_db()

logger = logging.getLogger("real-estate-voice-agent")
logger.setLevel(logging.INFO)

# A single code-switched word/phrase shouldn't flip the reply language —
# require the same candidate language across this many consecutive turns
# (roughly "a couple of sentences") before actually switching.
LANGUAGE_SWITCH_CONFIRMATION_TURNS = 3


# Sarvam bulbul:v3's own `pace`/`temperature`/`pitch` govern how the voice is
# actually delivered (speaking speed and prosodic variation) — separate from
# and complementary to the LLM's temperature, which only affects word choice.
# A flat/robotic-sounding voice is a TTS delivery problem, not a wording one,
# so tone presets live here rather than as an LLM sampling-temperature knob.
TONE_PRESETS: dict[str, dict[str, float]] = {
    # Measured and steady — a bit slower and low-variation, for formal/
    # informational agents (banking, legal, official notices).
    "professional": {"pace": 0.95, "temperature": 0.4, "pitch": 0.0},
    # Sarvam bulbul:v3's own defaults — natural conversational delivery.
    "balanced": {"pace": 1.0, "temperature": 0.6, "pitch": 0.0},
    # Faster and more expressive/varied prosody — addresses "slow and
    # robotic" by injecting more natural pitch/pace variation per line.
    "casual": {"pace": 1.08, "temperature": 0.85, "pitch": 0.05},
}
DEFAULT_TONE = "balanced"


def _build_llm(model: str):
    """Picks the LLM plugin by model-name prefix, so an operator can switch
    an agent between OpenAI and Gemini from the dashboard's model dropdown
    without any other config change. GEMINI_API_KEY is the name Google AI
    Studio labels its key with; fall back to GOOGLE_API_KEY (the google-genai
    SDK's own default env var) since either may already be set."""
    if model.startswith("gemini"):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        return google.LLM(model=model, api_key=api_key)
    return openai.LLM(model=model)


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
        agent_name = config.get("name") or "Artha"
        if config.get("system_prompt"):
            instructions = config["system_prompt"]
        elif config.get("is_platform_demo"):
            instructions = build_platform_assistant_prompt(agent_name)
        else:
            instructions = build_sales_rep_prompt(agent_name)
        if visitor_name and visitor_phone:
            # Website-widget calls collect these in a pre-call form, so the
            # agent already has them — this both stops it re-asking (the
            # built-in prompt's own goal list says "if not already known
            # from the call context") and guarantees log_call() below has a
            # name/phone to save even if the agent's log_lead tool never
            # fires during a short or abandoned call. Explicitly demanding
            # the name in the opening line, not just "you know it" — the
            # model won't reliably use it unprompted otherwise.
            first_name = visitor_name.strip().split()[0]
            instructions += (
                f"\n\n# Caller context\nThe caller already gave their name ({visitor_name}) and phone "
                f"number ({visitor_phone}) before this call started. Greet them by name — start your very "
                f'first sentence of the call with their first name (e.g. "Hi {first_name}, ..."). You '
                "already know their name and number, so don't ask for either again unless you need to "
                "confirm one of them."
            )
        if config.get("kb_id"):
            kb = db.get_kb_content(config["kb_id"])
            if kb:
                if db.is_kb_strict(config["kb_id"]):
                    # Strict mode: the KB (especially its operator-approved
                    # Q&A pairs) is the only permitted source for concrete
                    # facts — prices, sizes, dates, distances, legal status.
                    # This is what stops the model improvising a plausible
                    # but wrong number on a live sales call.
                    instructions += (
                        "\n\n# Knowledge base — THE authoritative facts for this call\n"
                        "The knowledge base below is your ONLY source for concrete facts about "
                        "this business and its projects: prices, sizes, distances, dates, legal "
                        "status, amenities, payment plans, contact details. Follow it strictly:\n"
                        "- When a caller's question matches an approved answer below, give that "
                        "answer (naturally rephrased for speech and translated into the caller's "
                        "language, but with every number, price, and name kept exactly as written).\n"
                        "- Never state a concrete fact about this business that is not in the "
                        "knowledge base — no guessing, no rounding, no 'approximately' around a "
                        "number that isn't there, even if you believe you know the answer.\n"
                        "- If the knowledge base doesn't cover something, say you'll have the team "
                        "confirm it, offer to note the question down, and move the conversation "
                        "forward — that is always better than an invented answer.\n"
                        "- Your general real-estate expertise is still fine for generic concepts "
                        "(what RERA is, how home loans work); strictness applies to THIS "
                        "business's specific facts.\n\n" + kb
                    )
                else:
                    instructions += (
                        "\n\n# Knowledge base — verified project facts you may rely on\n" + kb
                    )
        # Lead capture and default-language instructions are appended here,
        # unconditionally, rather than living only inside build_sales_rep_prompt
        # — an operator-written custom system_prompt (config["system_prompt"])
        # REPLACES that built-in prompt entirely, and previously took its lead
        # -capture and language instructions down with it: a custom-prompted
        # agent would never call log_lead/book_site_visit (tools are bound
        # either way, but the LLM was never told to use them) and would open
        # every call in whatever language it defaulted to, ignoring the
        # dashboard's configured language, since reply_language below only
        # ever fed the TTS pronunciation hint, never the LLM's own text.
        instructions += (
            "\n\n# Lead capture (do this regardless of the persona/rules above)\n"
            "Use whichever of these tools actually matches what this call is about — "
            "your persona/system prompt above tells you which one applies, and you "
            "only ever need one of the two:\n"
            "- Real-estate / per-tenant sales calls: as the conversation naturally "
            "reveals the caller's budget, preferred location(s), timeline, or interest "
            "in visiting in person, call log_lead to record whatever you've learned so "
            "far — call it again with the fuller picture if more comes up later in the "
            "same call, don't wait until every field is known. If the caller wants to "
            "see a property in person, use check_availability to find open slots, then "
            "book_site_visit to confirm one.\n"
            "- Vistrow Voice platform-assistant calls (explaining Vistrow Voice itself "
            "to a prospective customer): once you have the caller's name plus at least "
            "one more of company/contact/use case/team size, call "
            "capture_platform_lead — call it again if more comes up later in the same "
            "call.\n"
            "These tool calls are silent to the caller — never mention or narrate that "
            "you're saving, logging, or recording anything.\n\n"
            "Call the end_call tool once the caller clearly signals the conversation is "
            "over — they thank you with nothing further to ask, say goodbye, or otherwise "
            "indicate they're done. Don't call it for a mere pause or a one-word \"okay\" "
            "— only on a clear end-of-call signal.\n\n"
            "# Speak numbers and units naturally (do this regardless of the persona/rules above)\n"
            "Everything you write is converted directly to speech by a TTS engine that reads bare "
            "digits and abbreviations LITERALLY, one character at a time — it cannot expand them "
            "the way a human would. So:\n"
            "- Write every number out in words appropriate to the reply language (e.g. \"eighteen "
            "seventeen\", not \"1817\"), including in ranges — never leave a range like \"1817-3000\" "
            "as bare digits with a hyphen; say it naturally, e.g. \"eighteen seventeen to three "
            "thousand\".\n"
            "- Expand every abbreviation and unit into full words: \"sq.ft\" → \"square feet\", "
            "\"km\" → \"kilometers\", \"%\" → \"percent\". Never let an abbreviation reach TTS as "
            "literal text.\n"
            "- This only changes HOW a number/unit is written for speech, never the underlying value "
            "— the figure itself must stay exactly what the knowledge base or caller said."
        )
        reply_language = config.get("language") or "hi-IN"
        language_name = LANGUAGE_NAMES.get(reply_language, "Hindi")
        instructions += (
            f"\n\n# Default language\nOpen the call and speak first in {language_name} "
            "(native script, not romanized) — there's no caller input yet to mirror, so "
            f"{language_name} is the default until the caller's own language is clear. "
            "Once they speak, follow the multilingual rules above and match them."
        )
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
            llm=_build_llm(config.get("model") or "gpt-4.1"),
            tts=sarvam.TTS(
                target_language_code=reply_language,
                model="bulbul:v3",
                speaker=config.get("voice") or "pooja",
                **TONE_PRESETS.get(config.get("tone") or DEFAULT_TONE, TONE_PRESETS[DEFAULT_TONE]),
            ),
            tools=[check_availability, book_site_visit, log_lead, capture_platform_lead, end_call],
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
        logger.info(
            "language candidate %s (streak %s/%s) from turn: %r",
            candidate, self._pending_language_streak, LANGUAGE_SWITCH_CONFIRMATION_TURNS, text,
        )

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


async def _hang_up(room_name: str) -> None:
    """Ends the call for both sides once the agent's goodbye has finished
    playing. room.disconnect() would only drop the agent's own participant,
    leaving the caller alone in a now-agent-less room — deleting the room
    via the LiveKit API actually disconnects everyone, which is what a
    caller expects "the call ended" to mean."""
    try:
        async with api.LiveKitAPI() as lkapi:
            await lkapi.room.delete_room(api.DeleteRoomRequest(room=room_name))
    except Exception:
        logger.warning("failed to end call gracefully for room %s", room_name, exc_info=True)


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
    userdata = {"room": ctx.room, "lead_data": lead_data, "ending_call": False}
    session = AgentSession(
        userdata=userdata,
        # A single stray word (noise, STT hallucination, or TTS bleeding
        # back into the mic) shouldn't be enough to interrupt the agent
        # mid-sentence — require a couple of real words first.
        turn_handling=TurnHandlingOptions(interruption={"min_words": 2}),
        # Silence check-in: if the caller goes quiet for this long, the
        # session marks user_state "away" (see _on_user_state_changed
        # below) rather than just sitting mute — a caller who lost audio,
        # got distracted, or whose connection stalled would otherwise never
        # know the agent is still there.
        user_away_timeout=6.5,
    )

    def _on_user_state_changed(ev) -> None:
        if ev.new_state == "away":
            session.generate_reply(
                instructions=(
                    "The caller has gone quiet for a few seconds. Check in warmly and briefly — "
                    "one short question like asking if they're still there — and nothing else."
                )
            )

    def _on_agent_state_changed(ev) -> None:
        # end_call (tools.py) sets userdata["ending_call"] and returns
        # instructions for a goodbye line; this waits for that goodbye to
        # actually finish playing (agent state drops out of "speaking")
        # before tearing the room down, so the farewell is never cut off
        # mid-sentence.
        if userdata.get("ending_call") and ev.old_state == "speaking" and ev.new_state != "speaking":
            userdata["ending_call"] = False
            asyncio.create_task(_hang_up(ctx.room.name))

    session.on("user_state_changed", _on_user_state_changed)
    session.on("agent_state_changed", _on_agent_state_changed)

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
                    # Which dashboard agent took the call — explicit from room
                    # metadata when routed, otherwise whichever agent config
                    # actually loaded (the default/first one).
                    "agent_id": call_context["agent_id"] or (config or {}).get("id"),
                    "account_id": (config or {}).get("account_id"),
                    **lead_data,
                }
            )
            logger.info("saved call log for room %s (%d turns)", ctx.room.name, len(transcript))
        except Exception:
            logger.exception("failed to save call log for room %s", ctx.room.name)

    ctx.add_shutdown_callback(log_call)
    await session.start(agent=agent, room=ctx.room)


if __name__ == "__main__":
    # num_idle_processes defaults to 4 in production mode — four prewarmed
    # subprocesses, each with the full plugin stack (google/openai/sarvam)
    # loaded, sitting in memory before a single call happens. On a memory-
    # constrained Railway container that idle footprint alone can leave too
    # little headroom for an actual call's audio buffers/STT/TTS
    # connections, and the OS OOM-killer SIGKILLs the job subprocess
    # (observed in production logs as "process exited with non-zero exit
    # code -9" ~20-30s into a call) — livekit-agents then transparently
    # respawns a fresh subprocess for the same job, which is why the agent
    # appears to restart the conversation from scratch. 1 keeps one warm
    # process (still fast pickup for the next call) without the 4x footprint.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, num_idle_processes=1))
