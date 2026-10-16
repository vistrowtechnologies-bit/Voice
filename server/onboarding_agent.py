"""The starter agent, set up from the onboarding answers.

Every new account gets one blank agent ("Artha") at signup. When the owner
finishes onboarding, its industry, goals and caller languages become that
agent's instructions, language, welcome line and after-call fields, so the
first test call already sounds like their business.

Deterministic on purpose: no model call, so it is instant, free, cannot fail
mid-onboarding, and the admin panel can rebuild the same settings from the
stored answers to tell whether the customer has edited the agent since.
"Build with AI" stays the way to get a richer, model-written draft.
"""

from __future__ import annotations

# Onboarding labels (web-demo/src/pages/Onboarding.tsx) -> agent language.
LANGUAGE_CODES = {
    "Hindi": "hi-IN", "English": "en-IN", "Marathi": "mr-IN", "Tamil": "ta-IN",
    "Telugu": "te-IN", "Kannada": "kn-IN", "Malayalam": "ml-IN", "Gujarati": "gu-IN",
    "Bengali": "bn-IN", "Punjabi": "pa-IN", "Odia": "od-IN",
}

# What a caller of this kind of business usually wants, and the details worth
# collecting. Keys are the onboarding industry labels.
INDUSTRIES = {
    "Real estate": {
        "business": "a real estate business",
        "callers": "home buyers and investors asking about projects, prices, availability and site visits",
        "fields": [
            ("requirement", "string", "What the caller wants, e.g. 2 BHK flat, plot, office space"),
            ("budget", "string", "Budget the caller mentioned"),
            ("preferred_location", "string", "Area or project the caller is interested in"),
            ("purchase_timeline", "string", "When the caller plans to buy"),
        ],
    },
    "Healthcare & clinics": {
        "business": "a healthcare clinic",
        "callers": "patients asking about timings, doctors, treatments, fees and appointments",
        "fields": [
            ("patient_concern", "string", "The health concern or treatment the caller asked about"),
            ("preferred_doctor", "string", "Doctor or department the caller asked for"),
        ],
    },
    "Education": {
        "business": "an education institute",
        "callers": "students and parents asking about courses, batches, fees and admissions",
        "fields": [
            ("course_interest", "string", "Course, exam or class the caller is interested in"),
            ("student_class", "string", "Current class or qualification of the student"),
        ],
    },
    "Banking & lending": {
        "business": "a banking and lending business",
        "callers": "customers asking about loans, eligibility, documents and interest rates",
        "fields": [
            ("loan_type", "string", "Type of loan or product the caller asked about"),
            ("loan_amount", "string", "Amount the caller needs"),
            ("monthly_income", "string", "Monthly income, if the caller shared it"),
        ],
    },
    "Insurance": {
        "business": "an insurance business",
        "callers": "customers asking about policies, premiums, renewals and claims",
        "fields": [
            ("policy_type", "string", "Type of insurance the caller asked about"),
            ("renewal_or_new", "string", "Whether it is a renewal, a new policy or a claim"),
        ],
    },
    "E-commerce & retail": {
        "business": "an online store",
        "callers": "customers asking about products, orders, delivery, returns and refunds",
        "fields": [
            ("order_number", "string", "Order number, if the caller gave one"),
            ("product_interest", "string", "Product the caller asked about"),
        ],
    },
    "Travel & hospitality": {
        "business": "a travel and hospitality business",
        "callers": "guests asking about packages, rooms, availability, prices and bookings",
        "fields": [
            ("destination_or_property", "string", "Destination, package or property the caller asked about"),
            ("travel_dates", "string", "Travel or stay dates"),
            ("number_of_guests", "number", "How many people are travelling"),
        ],
    },
    "Automotive & logistics": {
        "business": "an automotive and logistics business",
        "callers": "customers asking about vehicles, services, shipments, pickups and deliveries",
        "fields": [
            ("service_needed", "string", "Vehicle, service or shipment the caller asked about"),
            ("location", "string", "City or pickup location"),
        ],
    },
    "Marketing / agency": {
        "business": "a marketing agency",
        "callers": "businesses asking about services, pricing, past work and meetings",
        "fields": [
            ("service_interest", "string", "Service the caller is interested in"),
            ("company_name", "string", "The caller's company"),
        ],
    },
}
_GENERIC = {
    "business": "a business",
    "callers": "people asking about the business's products, services, prices and timings",
    "fields": [("requirement", "string", "What the caller needs")],
}

# Onboarding goal label -> (one goal line for the prompt, after-call fields).
USE_CASES = {
    "Answer inbound calls": ("Answer every call politely, understand what the caller needs and help with it.", []),
    "Qualify leads": (
        "Qualify the lead: understand the need, budget and timeline, one question at a time.",
        [("lead_quality", "string", "hot, warm or cold, based on need, budget and timeline")],
    ),
    "Follow-up & outbound calls": (
        "On calls you make, say who you are and why you are calling in the first line, then follow up on their enquiry.",
        [("interested", "boolean", "Whether the person is interested")],
    ),
    "Book appointments": (
        "Book an appointment or visit: agree a date and time and repeat it back to confirm.",
        [
            ("preferred_date_time", "string", "Date and time the caller agreed to"),
            ("appointment_booked", "boolean", "Whether an appointment or visit was booked"),
        ],
    ),
    "Customer support": (
        "Solve the caller's problem if you can; if you cannot, collect the details so the team can call back.",
        [
            ("issue_summary", "string", "The caller's problem in one line"),
            ("issue_resolved", "boolean", "Whether the issue was solved on the call"),
        ],
    ),
    "Payment reminders": (
        "Remind the customer about the payment due, politely, and ask when they will pay.",
        [("promised_payment_date", "string", "When the customer said they will pay")],
    ),
    "Website voice assistant": ("Help website visitors find what they are looking for and take their details if they want a callback.", []),
}

OUTCOME_FIELDS = {"lead_quality", "interested", "appointment_booked", "issue_resolved"}

STARTER_NAME = "Artha"  # provision_account_defaults; the default voice is female


def agent_language(languages: list[str]) -> str:
    """Hindi + English callers get Hindi (the agent mixes in English and
    switches when the caller does); otherwise the first Indian language picked."""
    codes = [LANGUAGE_CODES[l] for l in languages if l in LANGUAGE_CODES]
    if not codes:
        return "hi-IN"
    if "hi-IN" in codes:
        return "hi-IN"
    regional = [c for c in codes if c != "en-IN"]
    return regional[0] if regional else "en-IN"


def _and(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def _industry(profile: dict) -> dict:
    return INDUSTRIES.get(profile.get("industry") or "", _GENERIC)


def _welcome(company: str, language: str, outbound_only: bool) -> str:
    """Only Hindi and English: other scripts would need a native speaker's
    review, and a blank line falls back to the runtime's own greeting."""
    if outbound_only:
        return ""
    if language == "hi-IN":
        return f"नमस्ते, मैं {STARTER_NAME} बोल रही हूँ, {company} से। बताइए, मैं आपकी क्या मदद कर सकती हूँ?"
    if language == "en-IN":
        return f"Hi, this is {STARTER_NAME} from {company}. How can I help you today?"
    return ""


def _prompt(company: str, profile: dict, language: str, goals: list[str]) -> str:
    industry = _industry(profile)
    kind = industry["business"]
    if profile.get("industry") == "Other" and profile.get("industryOther"):
        kind = f"a {profile['industryOther']} business"
    names = [l for l in profile.get("languages") or [] if l in LANGUAGE_CODES]
    main = next((name for name, code in LANGUAGE_CODES.items() if code == language), "Hindi")
    others = [l for l in names if l != main]
    speaks = f"Speak in {main}"
    if main == "Hindi":
        speaks += " mixed with everyday English words, the way callers naturally talk"
    if others:
        speaks += f". Callers may also speak {_and(others)}: switch to the caller's language as soon as they use it"
    else:
        speaks += ". If the caller speaks another language, switch to it"
    # Outcomes (booked, resolved, lead quality) are judged after the call,
    # not asked, so only the details a caller can give are listed here.
    fields = [desc for key, _, desc in _fields(profile)[1:] if key not in OUTCOME_FIELDS]
    ask = "\n".join(f"- {d}" for d in fields) or "- What the caller needs"
    goal_lines = "\n".join(f"- {g}" for g in goals)
    return (
        f"# Role\nYou are {STARTER_NAME}, the voice assistant of {company}, {kind}. "
        f"You talk on the phone with {industry['callers']}.\n\n"
        f"# Goal\n{goal_lines}\n\n"
        "# Call flow\n"
        "1. Greet the caller and ask how you can help.\n"
        "2. Listen, then answer what you know from these instructions.\n"
        "3. Collect the details below naturally, one question at a time, and ask for the caller's name.\n"
        "4. Before ending, repeat back what was agreed and the next step.\n\n"
        f"# Details to collect\n{ask}\n\n"
        "# Common questions & answers\n"
        "You do not have exact prices, timings, addresses or offers yet. Never guess them: "
        "say the team will share the exact details and offer a callback.\n\n"
        f"# Tone\n{speaks}. Warm, polite and confident. Keep every reply to one or two short sentences, "
        "spoken style: no lists, no emojis, numbers and prices in words.\n\n"
        "# Never do\n"
        "- Never make up prices, availability, offers or policies.\n"
        "- Never promise anything the team has not confirmed.\n"
        "- Never ask for card numbers, OTPs or passwords."
    )


def _fields(profile: dict) -> list[tuple[str, str, str]]:
    out = [("caller_name", "string", "The caller's name")]
    for item in _industry(profile)["fields"]:
        out.append(item)
    for goal in profile.get("useCases") or []:
        out.extend(USE_CASES.get(goal, ("", []))[1])
    seen, unique = set(), []
    for key, kind, desc in out:
        if key not in seen:
            seen.add(key)
            unique.append((key, kind, desc))
    return unique[:8]


def agent_from_profile(profile: dict, company: str) -> dict:
    """Agent settings (camelCase, as PATCH /agents takes them) for the answers."""
    company = (company or "").strip() or "our company"
    goals_picked = [g for g in profile.get("useCases") or [] if g in USE_CASES]
    goals = [USE_CASES[g][0] for g in goals_picked] or [USE_CASES["Answer inbound calls"][0]]
    if "Something else" in (profile.get("useCases") or []) and profile.get("useCaseOther"):
        goals.append(f"Also: {profile['useCaseOther']}.")
    language = agent_language(profile.get("languages") or [])
    outbound_only = set(goals_picked) <= {"Follow-up & outbound calls", "Payment reminders"} and bool(goals_picked)
    industry_label = profile.get("industryOther") if profile.get("industry") == "Other" else profile.get("industry")
    jobs = ", ".join(g.lower() for g in goals_picked[:3]) or "answers calls"
    return {
        "description": f"{industry_label or 'Business'} agent for {company}: {jobs}."[:200],
        "language": language,
        "welcomeMessage": _welcome(company, language, outbound_only),
        "systemPrompt": _prompt(company, profile, language, goals),
        "postCallFields": [{"key": k, "type": t, "description": d} for k, t, d in _fields(profile)],
    }
