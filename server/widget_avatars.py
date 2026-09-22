"""Curated call-button avatar catalog for the embeddable widget.

Deliberately a closed set (not arbitrary customer uploads), and now a very
short one: the animated orb, or Artha.

"default" is the animated orb (agent-orb.mp4) and stays first/primary.
"artha" is the waving loop (artha.mp4) used on our own marketing site — the
one avatar with motion, which is the point of offering a face at all.

The six static headshots (female1-3 / male1-3, shown as Priya, Ananya,
Meera, Arjun, Rohan, Vikram) were removed on 2026-09-22: a still photo on a
call button reads as a stock image next to a moving one, and no live site
had picked any of them (verified against `sites.widget_avatar` and
`site_page_routes.avatar_override` before deleting the keys and their .png
files — every site was on "artha" or "default"). The same check is what
retired the flat-color waveform swatches before them.

Adding a face back means adding its video, not just a photo. A key here
must have a .png in static/widget-avatars/ (the dashboard swatch and the
in-call still both use it) and, to be worth offering, a matching .mp4 —
see VIDEO_AVATAR_KEYS in widget/src/widget.ts.
"""

WIDGET_AVATAR_CATALOG = {
    "default": "Orb (default)",
    "artha": "Artha",
}


def is_valid_avatar_key(key: str | None) -> bool:
    return key in WIDGET_AVATAR_CATALOG
