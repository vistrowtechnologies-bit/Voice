"""Curated call-button avatar catalog for the embeddable widget.

Deliberately a closed set (not arbitrary customer uploads) - same waveform
mark in a few accent colors, generated once via PIL from the brand mark's
waveform shape. Keeps every widget visually on-brand while letting a
customer pick a color that fits their own site instead of Vistrow purple.
"""

WIDGET_AVATAR_CATALOG = {
    "default": "Orb (default)",
    "blue": "Blue",
    "green": "Green",
    "orange": "Orange",
    "red": "Red",
    "teal": "Teal",
}


def is_valid_avatar_key(key: str | None) -> bool:
    return key in WIDGET_AVATAR_CATALOG
