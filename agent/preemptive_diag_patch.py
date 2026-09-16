"""Diagnostic-only logging for livekit-agents' preemptive-generation reuse.

Call 988: session.history saved a verbatim duplicate of an earlier assistant
turn's text (turn 16's exact text, reappearing as turn 22) in place of what
tts_node's own logs show was actually spoken at that point in the call — the
real reply for that turn is simply missing from the saved transcript. Traced
into livekit-agents' own reuse logic (agent_activity.py's
_user_turn_completed_task, ~line 2630): a preemptively-generated speech_handle
is reused verbatim as the confirmed reply whenever its seeding interim
transcript and chat context still match the final ones at commit time. That
method is ~150 lines of framework internals — too large and too easy to drift
from upstream to safely reimplement just to add visibility, and the
framework's own log lines for this decision ("using preemptive generation" /
"preemptive generation invalidated...") are DEBUG/WARNING on a shared
"livekit.agents" logger already confirmed silent in our deployed logs (zero
matches anywhere in call 988's full log).

Instead this patches three small, already-isolated methods that bracket the
same decision without touching it: on_preemptive_generation (a preemptive
speech_handle is created), _cancel_preemptive_generation (one is discarded),
and _schedule_speech (any speech_handle — preemptive-reuse or fresh — is
actually queued for playback). Logged through OUR OWN logger, which is
reliably INFO-visible in our pipeline. A speech id logged at creation that
reappears at scheduling IS a reuse; correlating that sequence against
tts_node's logged text and the saved transcript on the next real occurrence
of this bug should show exactly which turn's preemptive object got reused for
which turn's reply, and why the mismatch happened.

No behavior change: every patched method calls straight through to the
original and returns its result unchanged.
"""
import logging

from livekit.agents.voice.agent_activity import AgentActivity

logger = logging.getLogger("real-estate-voice-agent")

_orig_on_preemptive_generation = AgentActivity.on_preemptive_generation
_orig_cancel_preemptive_generation = AgentActivity._cancel_preemptive_generation
_orig_schedule_speech = AgentActivity._schedule_speech


def _on_preemptive_generation(self, info):
    result = _orig_on_preemptive_generation(self, info)
    preemptive = self._preemptive_generation
    if preemptive is not None:
        logger.info(
            "[preemptive-diag] created speech_id=%s transcript=%r",
            preemptive.speech_handle.id,
            (info.new_transcript or "")[:120],
        )
    return result


def _cancel_preemptive_generation(self):
    preemptive = self._preemptive_generation
    if preemptive is not None:
        logger.info("[preemptive-diag] cancelled speech_id=%s", preemptive.speech_handle.id)
    return _orig_cancel_preemptive_generation(self)


def _schedule_speech(self, speech, priority, force=False):
    logger.info("[preemptive-diag] scheduling speech_id=%s priority=%s", speech.id, priority)
    return _orig_schedule_speech(self, speech, priority, force=force)


def apply() -> None:
    AgentActivity.on_preemptive_generation = _on_preemptive_generation
    AgentActivity._cancel_preemptive_generation = _cancel_preemptive_generation
    AgentActivity._schedule_speech = _schedule_speech
