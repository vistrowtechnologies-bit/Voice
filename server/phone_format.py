"""One phone-number format for the whole platform: E.164 ("+918080197945").

Every number that enters the system — typed in the dashboard, imported from
a CSV, captured by the agent mid-call, sent by a lead webhook, or presented
as caller ID — goes through to_e164(), so the same person is always the same
string. Before this, three India-only normalizers disagreed: a contact stored
as "8080197945" never matched the "+918080197945" on 101 calls, and the
Do-Not-Call key only knew how to strip India's "91", so a US number blocked
as "+1 415…" would not have matched the same number typed as "415…".

A bare local number is read in the account's country (Settings → Workspace
details → Country, default India). Uses Google's libphonenumber, the same
metadata Android and Gmail use, rather than hand-rolled prefix rules.

server/phone_format.py and agent/phone_format.py must stay byte-identical:
the agent writes DNC rows and call phones that the server's dialer then
matches against. test_phone_format.py enforces it.
"""

import phonenumbers

DEFAULT_COUNTRY = "IN"


def normalize_country(country: str | None) -> str:
    """An ISO 3166 alpha-2 code libphonenumber knows, else the default."""
    code = (country or "").strip().upper()
    return code if code in phonenumbers.SUPPORTED_REGIONS else DEFAULT_COUNTRY


def to_e164(raw: str | None, country: str | None = DEFAULT_COUNTRY) -> str:
    """E.164 for `raw`, or "" when it is not a usable phone number.

    A number written with a leading "+" (or its "00" international form) is
    taken as international and kept if its length is possible for that
    country — caller ID from a carrier must never be dropped because the
    metadata lags a new number range. A bare number is read in `country` and
    must be fully valid there, so junk such as "000000000" or "123" is
    rejected instead of becoming a plausible-looking number we would dial.
    A bare number that already carries the country code ("918080197945") is
    accepted too, the common way numbers get pasted from spreadsheets.
    """
    text = str(raw or "").strip()
    if not text:
        return ""
    region = normalize_country(country)
    digits = "".join(ch for ch in text if ch.isdigit())
    if text.startswith("00") and not text.startswith("+"):
        text, digits = "+" + digits[2:], digits[2:]
    explicit = text.startswith("+")

    # A bare number is tried in the account's country first, then as
    # "+<digits>" in case it already carries a country code. The retry is
    # held to full validity, so it can never rescue junk.
    candidates = [text] if explicit else [text, "+" + digits]
    for candidate in candidates:
        try:
            number = phonenumbers.parse(candidate, region)
        except phonenumbers.NumberParseException:
            continue
        ok = phonenumbers.is_valid_number(number) or (
            explicit and phonenumbers.is_possible_number(number)
        )
        if ok:
            return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    return ""


def match_key(raw: str | None, country: str | None = DEFAULT_COUNTRY) -> str:
    """Key for matching the same number however it was written (DNC list,
    campaign de-duplication). The E.164 form when the number parses, else its
    bare digits, so an unparseable value still matches an identical one."""
    return to_e164(raw, country) or "".join(ch for ch in str(raw or "") if ch.isdigit())


def dial_code(country: str | None) -> str:
    """"+91" for "IN" — the prefix the dashboard pre-selects."""
    return "+" + str(phonenumbers.country_code_for_region(normalize_country(country)))
