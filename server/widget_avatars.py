"""Curated call-button avatar catalog for the embeddable widget.

Deliberately a closed set (not arbitrary customer uploads). "default" is
the animated orb (agent-orb.mp4) and stays first/primary - every other key
is a static AI-generated headshot photo for a customer who wants a human
face on their call button instead of the orb. Swapped from the earlier
flat-color waveform-mark swatches (blue/green/orange/red/teal) since no
live site had picked one at the time (verified against the `sites` table
before removing those keys/images).
"""

WIDGET_AVATAR_CATALOG = {
    "default": "Orb (default)",
    "artha": "Artha",
    "female1": "Priya",
    "female2": "Ananya",
    "female3": "Meera",
    "male1": "Arjun",
    "male2": "Rohan",
    "male3": "Vikram",
}


def is_valid_avatar_key(key: str | None) -> bool:
    return key in WIDGET_AVATAR_CATALOG
