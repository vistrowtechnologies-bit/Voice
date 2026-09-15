"""Keep a caller's "ठीक है"/"हाँ" from cutting the agent off mid-sentence.

livekit-agents gates interruption on word count only, and on phone calls
min_words is 2 while min_duration is inert with vad=None. Hindi
acknowledgements are almost all exactly two words, so on call 978 a bare
"ठीक है" and a "हाँ बोल लो" each stopped the agent mid-sentence and it restarted
with a different line. Our own on_user_turn_completed cannot rescue this: the
framework interrupts the current speech before calling it.
"""
import re

from livekit.agents.voice.agent_activity import AgentActivity

# Whole-utterance match only: every word must be a backchannel. A bare "ना" is
# left out on purpose — on its own it can mean "no".
_BACKCHANNEL = re.compile(
    r"^(?:\s*(?:ठीक है|जी हाँ|हाँ जी|हाँ|हां|हा|जी|हम्म|हम|अच्छा|ओके|सही है|बिल्कुल|"
    r"बोलिए ना|बताइए ना|बोल लो|बोलो|बोलिए|बोलिये|बताइए|बताइये|कहिए|"
    r"theek hai|achha|acha|haan|han|ji|hmm|mm|okay|ok|yes|yeah|yep|right|sure|go ahead|bolo|boliye|bataiye)"
    r"[\s,.।!?-]*)+$",
    re.IGNORECASE,
)


def is_backchannel(text: str) -> bool:
    t = (text or "").strip()
    return bool(t) and len(t) <= 30 and bool(_BACKCHANNEL.match(t))


def _agent_mid_speech(activity) -> bool:
    speech = activity._current_speech
    return speech is not None and speech.allow_interruptions and not speech.interrupted


_orig_interrupt = AgentActivity._interrupt_by_audio_activity
_orig_end_of_turn = AgentActivity.on_end_of_turn


def _interrupt_by_audio_activity(self):
    recognition = self._audio_recognition
    if recognition is not None and _agent_mid_speech(self) and is_backchannel(recognition._current_transcript):
        return None
    return _orig_interrupt(self)


def on_end_of_turn(self, info):
    if _agent_mid_speech(self) and is_backchannel(info.new_transcript):
        # Same path the framework takes for an utterance under min_words: the
        # transcript is kept, not committed, and the agent keeps talking.
        self._cancel_preemptive_generation()
        return False
    return _orig_end_of_turn(self, info)


def apply() -> None:
    AgentActivity._interrupt_by_audio_activity = _interrupt_by_audio_activity
    AgentActivity.on_end_of_turn = on_end_of_turn
