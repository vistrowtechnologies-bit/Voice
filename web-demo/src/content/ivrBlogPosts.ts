import type { VoiceBlogSection } from './voiceBlog'

// IVR article cluster (Oct 2026). Targets the "ivr", "interactive voice
// response", "ivr system", "ivr in banking" and "ivr service provider" search
// intents. Each article links to /ai-ivr, /vs-ivr and the other three.
// Product statements must match the dashboard (help articles + agent code):
// transfer is phone-only, bookings go to Appointments, integrations are Zoho
// CRM, ArthaLeads, Slack, Google Sheets and webhook. No prices, no named
// competitors, no invented statistics. Sample dialogue is labelled as such.

export interface IvrBlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readTime: string
  sections: VoiceBlogSection[]
}

const CATEGORY = 'IVR & phone systems'
const PUBLISHED = '2026-10-14'

export const IVR_POSTS: IvrBlogPost[] = [
  {
    slug: 'what-is-ivr-interactive-voice-response',
    title: 'What is IVR (interactive voice response)? How it works and where AI fits',
    excerpt: 'A plain explanation of IVR systems: the menu, the keypad tones, speech options, cloud IVR and call routing, and where a conversational AI agent changes the picture.',
    category: CATEGORY,
    publishedAt: PUBLISHED,
    readTime: '',
    sections: [
      { heading: 'IVR in one paragraph', paragraphs: [
        'IVR stands for interactive voice response. It is the system that answers a phone call with recorded or synthesised prompts and lets the caller choose what happens next, usually by pressing keys: “press 1 for new bookings, press 2 for an existing order.” Based on the choice, the IVR plays information, collects a number such as an account or order ID, or routes the call to a queue of people.',
        'Almost everyone in India has used one: a bank’s phone banking line, a telecom operator’s customer care number, a courier’s tracking line or a hospital’s appointment desk. An IVR system is the reason a business can take many calls at once without a person answering every one of them first.',
      ] },
      { heading: 'How an IVR system works, step by step', paragraphs: [
        'Under the menus, a typical IVR call follows the same chain. The call arrives on a phone number, the IVR answers, plays a greeting, and then waits for input. Each key a caller presses sends a short tone, called DTMF (dual-tone multi-frequency). The system maps each tone to a branch of a call flow, sometimes called the IVR tree.',
        'At each branch the IVR can do one of a handful of things: play a message, ask for more digits, look something up in a connected system, or hand the call to a routing component that finds a free person. Some IVRs also accept a small set of spoken words such as “yes”, “no” or a department name. That is still a menu: the caller has to say one of the expected words.',
      ], points: [
        'Greeting and language choice, often “press 1 for English, 2 for Hindi”.',
        'Main menu with a few numbered options.',
        'Sub-menus for each option, sometimes several levels deep.',
        'Data collection: digits for an account, order or policy number.',
        'Self-service answers played from recordings or a database.',
        'Transfer to a queue, a department or a voicemail box.',
      ] },
      { heading: 'Types of IVR: on-premise, cloud and conversational', paragraphs: [
        'An on-premise IVR runs on hardware or software inside the business’s own telephony setup. It gives full control, but changes to the menu, prompts or integrations usually need a vendor or an in-house telephony team.',
        'A cloud IVR, also called a hosted IVR, runs on a provider’s servers. The business rents numbers and configures the call flow from a web dashboard. Cloud IVR made IVR practical for many smaller businesses because there is nothing to install, and the number of simultaneous calls can usually be changed with the plan. If you are comparing vendors, the [checklist for choosing an IVR service provider](/resources/blog/how-to-choose-an-ivr-service-provider-india) covers the questions to ask.',
        'A conversational or AI IVR keeps the job of the IVR (answer, understand, route or resolve) but replaces the menu with speech. The caller says what they need in their own words, and an AI voice agent works out the intent, answers from approved information, books a slot or transfers the call. Our [AI IVR overview](/ai-ivr) describes how that works on a business number in India.',
      ] },
      { heading: 'Where a menu IVR still works well', paragraphs: [
        'A short menu is predictable and quick for callers who already know which option they want. It is easy to audit, it behaves the same way every time, and keypad input works in noisy places and for callers who prefer not to speak. If most of your calls split cleanly into two or three departments, a well-built menu may be all you need.',
        'Problems start when the menu grows. Callers listen to six options, choose the closest one, land in the wrong queue and repeat their story to a person. Language menus add another layer before the caller has said anything. Every new product or policy means re-recording prompts and re-mapping keys. These are the calls where conversation helps.',
      ] },
      { heading: 'Where AI fits into an IVR call', paragraphs: [
        'An AI voice agent can sit where the main menu used to be. Instead of “press 1, press 2”, it asks “How can I help?” and listens. Because it understands the sentence rather than a key, it can handle a request that does not match any menu option, ask one follow-up question, and then complete the step or route the call with the context attached.',
        'It does not have to replace everything at once. A common pattern is to keep the IVR for one or two stable choices and send the rest to an AI agent, or to put the agent on a single line such as after-hours calls first. The article on [IVR versus an AI voice agent](/resources/blog/ivr-vs-ai-voice-agent-india) walks through that decision, and the [AI voice agent vs traditional IVR comparison](/vs-ivr) has a side-by-side table.',
      ] },
      { heading: 'What an AI IVR call looks like on Vistrow Voice', paragraphs: [
        'On Vistrow Voice, a number is routed to an agent with its own hours, active days and concurrent-call limit. The agent opens in the language you choose and follows the caller across Hindi, English and nine other Indian languages, so there is no language menu. It answers from the knowledge base you upload, books into the built-in Appointments calendar, takes callback requests, and on phone calls can transfer to a colleague’s number when a person is needed.',
        'Every call is saved with a transcript, a summary and the details captured, plus the recording if recording is on. Leads can be sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or any webhook. The menu you used to maintain becomes a set of written instructions and approved answers that you can edit and test in the browser before publishing.',
      ] },
      { heading: 'Common IVR terms, briefly', paragraphs: [
        'A few words come up whenever IVR is discussed. Knowing them makes vendor conversations easier, whether you are buying a menu IVR, an AI agent or both.',
      ], points: [
        'DTMF: the tones a keypad sends; the input a menu IVR listens for.',
        'IVR tree or call flow: the map of prompts, branches and destinations.',
        'ACD (automatic call distribution): the component that picks which person gets a transferred call.',
        'Containment or self-service rate: the share of calls finished without a person.',
        'Concurrent calls or channels: how many calls the system can handle at the same time.',
        'Toll-free and virtual numbers: the numbers callers dial; usually provided by the telephony provider.',
      ] },
    ],
  },
  {
    slug: 'ivr-vs-ai-voice-agent-india',
    title: 'IVR vs AI voice agent: which should Indian businesses use?',
    excerpt: 'A decision guide built on your own call reasons: when a keypad menu is enough, when a conversational agent pays off, and how to run both without confusing callers.',
    category: CATEGORY,
    publishedAt: PUBLISHED,
    readTime: '',
    sections: [
      { heading: 'Start with your calls, not the technology', paragraphs: [
        'The useful question is not “IVR or AI?” in general. It is “which of my calls need a conversation?” A menu IVR is good at sorting callers who already know what they want. An AI voice agent is good at understanding callers who explain what they want in their own words. Most businesses have both kinds of call, in different proportions.',
        'So the first step is a list. Take a week of calls, or ask the people who answer them, and write down the ten most common reasons people call. For each reason, note how the caller usually describes it, what a good outcome looks like, and what goes wrong today.',
      ] },
      { heading: 'Four questions that decide it', paragraphs: [
        'Run each call reason through four questions. The answers usually point clearly to a menu, to a conversation, or to a person.',
      ], points: [
        'Can the caller name the option in one or two words? If yes, a menu option is fine.',
        'Does the next question depend on the answer? If yes, a conversation fits better than a fixed branch.',
        'Is the answer in approved material you can give the agent? If not, the call belongs with a person.',
        'What does a wrong answer cost? The higher the cost, the narrower the agent’s scope and the faster the handoff.',
      ] },
      { heading: 'A worked example: mapping a five-option menu', paragraphs: [
        'Here is an illustrative menu for a diagnostic lab, not a customer’s real setup: 1 for test prices, 2 for home sample collection, 3 for reports, 4 for corporate tie-ups, 9 to speak to an executive.',
        'Test prices and home collection are classic conversation calls. Callers ask “how much is a thyroid test and can someone come tomorrow morning?”, which crosses two menu options in one sentence. An AI agent can answer the price from the approved list and book the visit in the same call. Reports usually need a lookup in the lab’s own system; that can stay with a person, or be handled by a custom function that calls the lab’s API if one exists. Corporate tie-ups are rare and high-value, so they go to a person with a short summary. Option 9 becomes “ask for a person at any time”.',
        'The result is not a smarter menu. It is a different split of work: the agent handles the repetitive, explainable calls end to end, and people get fewer calls with more context.',
      ] },
      { heading: 'Three ways to run both', paragraphs: [
        'You do not have to switch every line on the same day. These patterns let you keep what works and test the rest.',
      ], points: [
        'Agent first, person on request: the agent answers every call and transfers on phone calls when the caller asks or the topic needs it.',
        'Short menu, then agent: keep one stable key choice (for example existing customers) and send everything else to the agent.',
        'Line by line: move one number, such as after-hours or a campaign enquiry line, to the agent and leave the others on the existing IVR.',
      ] },
      { heading: 'Questions to settle before you switch', paragraphs: [
        'A few practical decisions make the difference between a smooth change and a confusing one. Settle them with the people who answer calls today, because they know which requests are simple and which only look simple.',
        'Write the answers into the agent’s instructions and knowledge base before the first real call, then test them in the browser with colleagues playing difficult callers: one who is impatient, one who switches language, one who stays silent and one who asks for a manager in the first sentence.',
      ], points: [
        'Which topics must always go to a person, whatever the caller says?',
        'Which number does a transfer ring, and who answers it after hours?',
        'What does the agent say when it does not know, and who follows up?',
        'Which details must be captured on every call, and where should they go?',
      ] },
      { heading: 'What changes for callers and for your team', paragraphs: [
        'For callers, the main change is speed to the point. They do not wait through options or choose a language first. On Vistrow Voice the agent starts in your default language and switches when the caller does, across Hindi, English and nine other Indian languages, including mixed speech such as Hinglish.',
        'For your team, the change is what arrives with each call. A menu IVR tells you which keys were pressed. An agent leaves a transcript, a summary and the details it was asked to capture, which can be sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook. Transfers work on phone calls; a conversation started from the website widget runs in the browser, so the agent takes a callback number instead.',
      ] },
      { heading: 'When to keep the IVR', paragraphs: [
        'Keep a keypad option where callers must enter a long number accurately and you already have a working flow for it, where a regulator or internal policy requires a fixed script, or where your callers strongly prefer keys. Accessibility matters too: some people find speech input harder than a keypad. A hybrid design with a clear keypad path and a clear route to a person covers more callers than either method alone. Regulated sectors have their own reasons to keep certain flows on keys; the guide to [IVR in banking and finance](/resources/blog/ivr-in-banking-and-finance) explains which calls those are.',
        'Also keep it while you pilot. Moving a line to an agent is easy to reverse if the old flow still exists, and the comparison is fairer when both run on real traffic.',
      ] },
      { heading: 'How to measure the switch', paragraphs: [
        'Pick measures you can read from call records rather than impressions. Useful ones: the share of calls that reach a clear outcome (answer, booking, callback request or transfer), how often callers ask for a person, how often they repeat themselves, and how many follow-up calls staff still make. Read a sample of transcripts every week of the pilot; a call that looks complete in a dashboard can still contain a wrong date.',
        'If one call reason keeps going wrong, narrow the agent’s scope for that reason and route it to a person, rather than adding paragraph after paragraph to its instructions. The [buyer’s checklist for choosing an IVR service provider](/resources/blog/how-to-choose-an-ivr-service-provider-india) lists the questions to ask before you commit to any platform.',
      ] },
    ],
  },
  {
    slug: 'ivr-in-banking-and-finance',
    title: 'IVR in banking and finance: replacing menus with conversation',
    excerpt: 'What banks, NBFCs and lenders use IVR for, which calls suit a conversational voice agent, and the guardrails a finance team should set before any caller hears it.',
    category: CATEGORY,
    publishedAt: PUBLISHED,
    readTime: '',
    sections: [
      { heading: 'Why finance runs on IVR', paragraphs: [
        'Banks, card issuers and lenders have relied on IVR for a long time. Phone banking menus handle balance enquiries, card blocking, PIN-related requests and statement requests at a scale no team could answer by hand, and keypad entry suits the long account and card numbers those tasks need.',
        'The same menus are also where callers get stuck. A borrower who wants to ask “why did my EMI amount change?” or “can I pay part of it next week?” does not fit an option list, so the call ends in a queue for a person who starts from zero. That gap, between what the menu can sort and what the caller needs to explain, is where conversational voice agents are being tried.',
      ] },
      { heading: 'Which banking calls suit a conversation', paragraphs: [
        'Not every finance call should move off a menu. A useful split is between general questions, which can be answered from approved material, and account-specific actions, which touch money or identity and need strong controls.',
      ], points: [
        'General product questions: documents needed for a loan, eligibility basics, branch timings, how a process works.',
        'Application status enquiries, where your system can provide the status through a secure lookup.',
        'Payment reminder calls and the conversation that follows: the borrower’s response, a promised date, a request for a callback.',
        'Lead qualification for loan or card enquiries: product interest, city, approximate requirement, preferred callback time.',
        'Routing with context: understanding the problem first, then handing the caller to the right team with a summary.',
      ] },
      { heading: 'Calls that should stay with a menu or a person', paragraphs: [
        'Anything that moves money, changes account details, authenticates a customer or disputes a transaction needs your own verified systems and processes. Keep those on the secure flows you already have, such as keypad entry into a verified system, or with trained staff. An AI agent should not collect card numbers, PINs, OTPs or passwords in conversation.',
        'Hardship and complaint calls also deserve a person. A voice agent can respond calmly, record what the caller says and arrange a callback, but decisions about restructuring, waivers or disputes belong to authorised staff. This article is not legal or regulatory advice; your compliance team should review any customer-facing flow.',
      ] },
      { heading: 'Guardrails to set before launch', paragraphs: [
        'The controls that matter most in finance are the ones that limit what the agent says and when it calls. On Vistrow Voice these are dashboard settings rather than prompt wording.',
      ], points: [
        'Strict knowledge mode: the agent quotes your approved answers and says it will check with the team when something is not covered.',
        'Calling window: outbound dials outside your allowed hours and days are blocked automatically, in the callee’s timezone.',
        'Do-Not-Call list: every outbound dial is checked first, and the agent adds a caller who asks not to be called again.',
        'Spoken consent: the agent can ask at the start of the call whether recording and follow-up are acceptable, and the answer is saved.',
        'Retention: transcripts and recordings older than the number of days you set are deleted automatically.',
        'Transfer: on phone calls the agent can dial an authorised colleague into the call when the caller asks or the topic requires it.',
      ] },
      { heading: 'A sample payment reminder call', paragraphs: [
        'This is a written sample to show the shape of the call, not a recording or a real customer. Agent: “Namaste, this is a reminder from the lender about your EMI due on the 5th. Is this a good time for one minute?” Caller: “Haan, but salary 7 tareekh ko aayegi.” Agent: “Understood. Shall I note the 7th as the date you plan to pay?” Caller: “Yes, 7th.” Agent: “Thank you. I have noted the 7th. If you would like to discuss anything, I can arrange a callback from the team.”',
        'The agent did not threaten, negotiate or promise anything outside its instructions. It recorded a promised date as a field on the call, which can go to the lender’s CRM or a webhook, and it gave the caller a route to a person. The [finance and collections page](/solutions/finance) describes these calls in more detail.',
      ] },
      { heading: 'What to measure in a finance pilot', paragraphs: [
        'Choose measures that a compliance reviewer and an operations head would both accept. Count calls that reached a clear outcome: an answered question, a recorded promise-to-pay date, a callback request or a transfer. Count calls where the caller asked for a person, and read why. Track how often a recorded date or amount turned out to be wrong when staff followed up; that error rate matters more than speed.',
        'Keep a short log of every call where the agent said something it should not have, even if the outcome was fine. Each entry should lead to one change: an approved answer added, a topic moved to a person, or an instruction tightened. Re-run the same test calls after each change so you know it fixed the problem without creating another.',
      ] },
      { heading: 'Rolling it out in a finance team', paragraphs: [
        'Start with one call type where the information is already approved and the cost of a mistake is low, such as general loan document questions or reminder calls for upcoming dues. Write down the topics that must always go to a person, add them to the agent’s instructions, and test them in the browser before real traffic, including a caller who refuses, a caller who asks for a manager and a caller who switches to Hindi or another regional language halfway through.',
        'Keep the existing IVR in place for account actions during the pilot. Read transcripts weekly with someone from compliance, and widen the scope only when a call type is consistently handled correctly. When you compare platforms for this work, the [IVR service provider checklist](/resources/blog/how-to-choose-an-ivr-service-provider-india) includes the data-handling and calling-control questions finance teams usually need answered. For a broader view of where menus and agents each fit, see the guide on [choosing between IVR and an AI voice agent](/resources/blog/ivr-vs-ai-voice-agent-india).',
      ] },
    ],
  },
  {
    slug: 'how-to-choose-an-ivr-service-provider-india',
    title: 'How to choose an IVR service provider in India (checklist)',
    excerpt: 'A neutral checklist for comparing IVR solutions and IVR companies: numbers and telephony, call flows, languages, AI, integrations, data handling, pricing structure and support.',
    category: CATEGORY,
    publishedAt: PUBLISHED,
    readTime: '',
    sections: [
      { heading: 'Know what you are buying first', paragraphs: [
        'IVR service providers in India fall into a few broad groups. Telephony-first providers sell numbers, call routing, menu IVR and contact-centre features, sometimes with AI added. AI-first platforms focus on the conversational agent and connect to a telephony provider for the phone line. Some businesses use one of each. None of these is automatically right; what matters is which part of the call you need to improve.',
        'If the vocabulary is unfamiliar, [what IVR is and how it works](/resources/blog/what-is-ivr-interactive-voice-response) explains menus, DTMF, cloud IVR and call flows. Before speaking to any vendor, write a one-page brief: the numbers you have, the ten most common call reasons, the languages your callers use, your peak simultaneous calls, the systems a call must update, and who answers when the system cannot. Every question below gets easier with that page in hand.',
      ] },
      { heading: 'Numbers, telephony and capacity', paragraphs: [
        'The phone line is the part most likely to cause a slow or failed launch, so check it early. Ask exactly how calls reach the platform and what you need to change with your current carrier.',
      ], points: [
        'Can you keep your existing number, and what does the connection or porting process involve?',
        'Which number types are supported: mobile-style, landline, toll-free?',
        'How many simultaneous calls (channels) are included, and how is more capacity added?',
        'What happens to a call when all channels are busy?',
        'Can each number have its own hours, days and destination?',
      ] },
      { heading: 'Call flow, AI and languages', paragraphs: [
        'For a menu IVR, ask how a non-technical person changes a prompt or a branch, and how long that takes. For a conversational AI IVR, ask how the agent is given approved information, what it does when it does not know an answer, and how you test changes before callers hear them.',
        'Languages deserve a real test, not a list. Ask for a complete task in each language you need, with the names, numbers and mixed speech your callers use. Check whether the caller can switch language mid-call or must choose from a menu first.',
      ], points: [
        'Can the system answer from your own documents, and can you restrict it to them?',
        'Can it book appointments, take callback requests and capture fields you define?',
        'How does transfer to a person work, and on which channels?',
        'Is there a website or app voice option as well as the phone line?',
        'Can you run test calls and saved test scenarios before publishing a change?',
      ] },
      { heading: 'Integrations and records', paragraphs: [
        'An IVR or voice agent is only as useful as what reaches your team afterwards. Ask what is stored for each call (keys pressed, transcript, summary, recording, captured fields) and where it can be sent. Check the CRM you actually use, and whether a generic webhook is available for everything else.',
        'Ask to see a delivery failure: what happens if your CRM is down, how failed deliveries are shown, and whether they can be re-sent. A green “connected” badge is not the same as a lead arriving in the right place.',
      ] },
      { heading: 'Data, consent and compliance', paragraphs: [
        'Call recordings and transcripts contain personal data, so ask the same questions you would ask any data processor: where data is stored, who can access it, how long it is kept, and how it is deleted. Ask whether you can require spoken consent before recording, turn recording off, and set a retention period.',
        'For outbound calling, ask how the platform enforces calling hours and Do-Not-Call lists, and whether those controls block a dial or only warn about it. Your own legal and compliance review still applies; a vendor’s feature list does not replace it.',
      ] },
      { heading: 'Warning signs during evaluation', paragraphs: [
        'Most problems with an IVR or voice platform are visible before you sign, if you look for them. Treat these as reasons to ask more questions, not automatic disqualifications.',
      ], points: [
        'The demo only works in a quiet room, in one language, on a script the vendor wrote.',
        'Nobody can show you what a caller hears when the system does not know the answer.',
        'Transfer to a person is “on the roadmap” or only works on some channels without saying which.',
        'Pricing cannot be broken into carrier, number, platform and AI usage for your traffic.',
        'Call records cannot be exported or sent to your own systems.',
        'There is no way to test a change before callers hear it.',
      ] },
      { heading: 'Pricing structure and the pilot', paragraphs: [
        'IVR pricing is quoted in many ways: per minute, per channel, per number, per agent seat, or as a bundle. The headline figure only becomes comparable once you know what it includes. Ask for a written example for your expected monthly traffic that separates carrier usage, number rental, platform fees and any AI usage. The [guide to cost per useful call](/resources/blog/ai-voice-agent-pricing-india) has a worksheet for this.',
        'Then insist on a pilot on real calls: one line or one call reason, a fixed period, and measures agreed in advance. Read transcripts or call logs yourself during the pilot. Ask what support looks like when something breaks, who you contact, and how quickly they respond.',
      ] },
      { heading: 'How Vistrow Voice fits this checklist', paragraphs: [
        'Vistrow Voice is an AI-first platform: it replaces the menu with a conversational agent rather than selling a keypad IVR. Phone calls connect over SIP through EnableX, an Indian telecom provider, and an existing number from a compatible provider can be connected once the setup is confirmed. Each number is routed to an agent with its own hours, active days and concurrent-call limit.',
        'Agents speak Hindi, English and nine other Indian languages, answer from your knowledge base with an optional strict mode, book into the built-in Appointments calendar, and transfer to a person on phone calls. Each call keeps a transcript, summary and captured fields, with the recording if you turn it on, and leads can go to Zoho CRM, ArthaLeads, Slack, Google Sheets or any webhook. Spoken consent, retention, calling-window and Do-Not-Call controls are dashboard settings. Current plans are on the [Vistrow Voice pricing page](/pricing).',
      ] },
    ],
  },
]

export const IVR_IMAGE_ALTS: Record<string, string> = {
  'what-is-ivr-interactive-voice-response': 'Caller holding a mobile phone beside an office desk telephone with a keypad',
  'ivr-vs-ai-voice-agent-india': 'Support coordinator wearing a headset while listening to a caller at her desk',
  'ivr-in-banking-and-finance': 'Calculator, notebook and smartphone on a desk while someone works through figures',
  'how-to-choose-an-ivr-service-provider-india': 'Colleague wearing headphones and holding a pen while listening to a test call',
}

// Appended to the first section of each article (see voiceBlog.ts), where the
// reader first meets the related idea. Bracket syntax renders as real links.
export const IVR_CONTEXTUAL_LINKS: Record<string, string> = {
  'what-is-ivr-interactive-voice-response': 'If you already know you want callers to speak instead of pressing keys, the [AI IVR for Indian businesses](/ai-ivr) page shows the product side. For a side-by-side view of menus, voice agents and chatbots, see the [AI voice agent vs traditional IVR comparison](/vs-ivr). Finance teams can skip ahead to [IVR in banking and finance](/resources/blog/ivr-in-banking-and-finance).',
  'ivr-vs-ai-voice-agent-india': 'If the terms are new, begin with [what IVR is and how it works](/resources/blog/what-is-ivr-interactive-voice-response). This guide is about deciding from your own calls; the [AI voice agent vs traditional IVR comparison](/vs-ivr) covers definitions and a feature table, and the [AI IVR product page](/ai-ivr) shows the setup steps.',
  'ivr-in-banking-and-finance': 'For the basics of menus, keypad tones and call flows, read [what IVR is and how it works](/resources/blog/what-is-ivr-interactive-voice-response). The [AI IVR for Indian businesses](/ai-ivr) page explains how a conversational agent answers a business number, and the [voice agent vs IVR comparison](/vs-ivr) sets out where each one fits.',
  'how-to-choose-an-ivr-service-provider-india': 'If you are still deciding between a keypad menu and a conversational agent, read [IVR vs AI voice agent for Indian businesses](/resources/blog/ivr-vs-ai-voice-agent-india) first, and use the [AI voice agent vs traditional IVR comparison](/vs-ivr) for definitions. Finance teams should also read [IVR in banking and finance](/resources/blog/ivr-in-banking-and-finance), and the [AI IVR overview](/ai-ivr) shows what a conversational setup involves.',
}
