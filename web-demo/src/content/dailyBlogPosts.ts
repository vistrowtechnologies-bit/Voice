import type { VoiceBlogPost, VoiceBlogSection } from './voiceBlog'

// Daily posts (from 21 Oct 2026), one buyer-intent keyword each. Plan,
// evidence and calendar: docs/SEO-BLOG-PLAN-2026-10-21.md.
// Rules: no prices, no named competitors, no invented statistics (every
// number is in SOURCES). Product statements must match the product: more
// than 130 languages (owner decision 21 Oct 2026; Studio voices), 10 Indian; phone numbers connect through the customer's
// telephony provider and overseas calling depends on that provider; the
// website voice widget works from any browser.

export type DailyBlogPost = Omit<VoiceBlogPost, 'image' | 'imageAlt' | 'updatedAt' | 'sources' | 'sections'> & {
  sections: VoiceBlogSection[]
}

export const DAILY_POSTS: DailyBlogPost[] = [
  {
    slug: 'multilingual-ai-receptionist-hindi-punjabi-english',
    title: 'Multilingual AI receptionist: answering Hindi, Punjabi and English callers with one agent',
    seoTitle: 'Multilingual AI Receptionist for Hindi & Punjabi Callers',
    metaDescription: 'How one AI receptionist can answer Hindi, Punjabi and English callers in the UK, Canada, the US and UAE, and what to test before you trust it.',
    shortAnswer: 'A multilingual AI receptionist answers every call, understands callers who speak Hindi, Punjabi, English or a mix of them, and replies in the same language. It suits businesses in the UK, Canada, the US and the Gulf with South Asian customers. Test it with native speakers, mixed-language calls and real names before going live.',
    excerpt: 'Many businesses in the UK, Canada, the US and the Gulf serve customers who are more comfortable in Hindi or Punjabi. Here is how to run one AI receptionist for all of them, and what to test before you trust it.',
    category: 'Languages & speech',
    publishedAt: '2026-10-21',
    readTime: '',
    related: ['how-to-choose-a-multilingual-voice-agent', 'website-voice-widget-for-lead-generation', 'what-is-an-ai-voice-agent'],
    sections: [
      { heading: 'Who needs a multilingual AI receptionist?', paragraphs: [
        'A clinic in Brampton, an immigration consultancy in Southall, a property developer selling to buyers in Dubai and a travel agency in New Jersey have the same problem. A large share of their callers would rather speak Hindi or Punjabi, often mixed with English, and the person who can do that is not always free when the phone rings.',
        'This is not a niche. In England and Wales, Panjabi is the main language of about 291,000 people, according to the 2021 Census. Canada counted 942,000 people who speak Punjabi and 761,000 who speak Hindi in 2021. A receptionist who answers only in English, or a phone menu that asks callers to press 1 for English, quietly loses part of that audience.',
        'A multilingual AI receptionist answers every call, greets the caller, and continues in the language the caller uses. The aim is simple: the caller should never have to adapt to the business.',
      ] },
      { heading: 'Which languages can a Hindi and Punjabi AI receptionist speak?', paragraphs: [
        'Vistrow Voice is an AI voice agent platform that answers phone calls and website conversations in more than 130 languages, including Hindi, English and nine other Indian languages: Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia. One agent can follow a caller from English into Hindi or Punjabi and back within the same call. Each language has its own page, for example the [Hindi AI voice agent overview](/languages/hindi) and the [Punjabi AI voice agent overview](/languages/punjabi).',
        'Test the languages your callers actually use rather than trusting a number. If many of your callers mix Punjabi, Hindi and English, or switch to a regional language when they get comfortable, make those mixes part of your pilot and listen to how the agent handles names, numbers and dates in each.',
      ] },
      { heading: 'What should "multilingual" mean on a real call?', paragraphs: [
        'A list of supported languages tells you very little. What matters is whether the agent can hold a useful conversation the way your callers actually speak. Our [multilingual voice agent evaluation checklist](/resources/blog/how-to-choose-a-multilingual-voice-agent) covers vendor testing in detail; on a receptionist line, four things matter most.',
      ], points: [
        'Mid-sentence switching. Callers say things like "mujhe Tuesday ka appointment chahiye" without thinking about it. The agent should understand mixed Hindi and English, and reply in the same style rather than forcing a formal register.',
        'Following the caller, not the caller ID. A Canadian mobile number tells you nothing about which language someone prefers. The agent should follow what the caller says, and let them ask to switch at any point.',
        'Names, places and numbers. Listen to how the agent says your business name, street names, dates, times and phone numbers in each language. These are the details that make a caller trust or doubt the call.',
        'Correct grammar for the voice. Hindi and Punjabi verbs change with the speaker’s gender. A male voice saying "main aa rahi hoon" sounds wrong to every native listener, so the agent’s phrasing must match the voice you choose.',
      ] },
      { heading: 'Phone number or website: where should callers reach the AI receptionist?', paragraphs: [
        'There are two ways callers reach the agent. The first is your phone number. The number stays with your telephony provider and is routed to the agent, as described on the [inbound AI call answering page](/product/inbound), so whether overseas callers can reach it, and at what rate, depends on that provider and the number you use. Check international calling support with your provider before you promise it to customers abroad.',
        'The second is a voice button on your website. A visitor taps it and talks from the browser, with no phone call at all. The [website voice widget](/product/widget) is often the simplest way to offer a conversation in Hindi or Punjabi to anyone, anywhere, without arranging numbers in every market.',
        'Many teams use both: the phone line for existing customers who already have the number, and the website button for new enquiries from search and social media.',
      ] },
      { heading: 'How do you test a multilingual AI receptionist before launch?', paragraphs: [
        'Pick one high-volume call type, such as new enquiries or appointment requests. Write the facts the agent may use, the questions it should ask, and the point at which it hands over to a person. Then run a one-week pilot the way your callers will use it, and measure response time as well as accuracy using our [voice AI latency testing guide](/resources/blog/voice-ai-latency-how-to-measure-it).',
      ], points: [
        'Ask three native speakers to call in Hindi, in Punjabi and in mixed Hindi and English, using ordinary speech and a normal mobile connection.',
        'Read the transcripts next to the recordings. Mark every name, number or date the agent got wrong.',
        'Check the handoff: does the person who takes over receive the caller’s name, need and language, so the caller does not repeat themselves? The [CRM handoff checklist](/resources/blog/connecting-voice-calls-to-your-crm) lists what that record should contain.',
        'Try the awkward cases: a caller who changes language halfway, background noise, a wrong number, and a request the agent should refuse.',
        'Decide what the agent must never do, such as quoting prices it was not given, and confirm it holds that line in every language.',
      ] },
      { heading: 'Which businesses benefit most?', paragraphs: [
        'The pattern is the same across industries: a high share of first calls are routine, and callers are more relaxed in their own language. Clinics use a receptionist to take appointment requests and answer opening-hours questions; the [healthcare voice AI overview](/solutions/healthcare) shows how that works with a human on hand for anything clinical. Property sellers use it to qualify buyers and book site visits, as described on the [real estate voice AI page](/solutions/real-estate).',
        'Immigration consultants, travel agencies, insurance brokers and restaurants serving South Asian communities see the same benefit: callers explain themselves fully the first time, and staff spend their time on the conversations that need them.',
      ] },
      { heading: 'Should callers be told they are speaking to an AI?', paragraphs: [
        'Yes. Tell callers they are speaking with an AI assistant and that the call may be recorded, in the language they are using. It costs one sentence and avoids the moment a caller realises it on their own. Keep a clear route to a person for complaints, sensitive questions and anything the agent is not sure about. Our guide to [AI call recordings and transcripts](/resources/blog/ai-call-recordings-and-transcripts) covers what to check once calls are recorded.',
        'Recording and disclosure rules differ between countries and regions. Agree your wording and retention period with whoever handles compliance for each market you serve; this article is practical guidance, not legal advice.',
      ] },
      { heading: 'What does good look like after launch?', paragraphs: [
        'Within a few weeks you should be able to answer three questions from the call history: how many calls each language received, how many ended with the caller’s need met or a clear next step, and where callers dropped off or asked for a person. If one language has noticeably more handoffs, listen to those calls first; the cause is usually a missing fact or a phrase the agent handles poorly, and both are quick to fix.',
        'A good multilingual receptionist does not replace the people who know your customers. It makes sure that every caller, in whatever language they are comfortable with, gets a prompt and useful first answer. When you are ready to size a pilot, compare plans on the [Vistrow Voice pricing page](/pricing).',
      ] },
    ],
    faqs: [
      { q: 'Can one AI receptionist speak Hindi, Punjabi and English on the same call?', a: 'Yes. A multilingual agent follows the language the caller uses and can switch mid-call, including mixed Hindi and English. Test it with native speakers before launch, because recognition of names and numbers varies between systems.' },
      { q: 'Which languages does Vistrow Voice speak?', a: 'More than 130, including Hindi, English, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia. Test the exact languages and mixes your callers use before launch.' },
      { q: 'Can callers outside India reach the AI receptionist?', a: 'By phone, that depends on the number and telephony provider you connect, so check international calling with your provider. From a website, anyone can talk to the agent in their browser through the [website voice widget](/product/widget).' },
      { q: 'Will the AI receptionist tell callers it is an AI?', a: 'It should. Open each call with a short disclosure in the caller’s language that they are speaking with an AI assistant and that the call may be recorded, and offer a person on request.' },
      { q: 'How long does it take to test a multilingual receptionist?', a: 'A focused one-week pilot on a single call type is usually enough to see where the agent mishears names or numbers, how handoffs work, and whether callers in each language reach a clear next step.' },
    ],
  },
  {
    "slug": "ai-receptionist-vs-answering-service-vs-ivr",
    "title": "AI receptionist vs answering service vs IVR: how to compare them on your own calls",
    "seoTitle": "AI Receptionist vs Answering Service vs IVR: How to Compare",
    "metaDescription": "AI receptionist, human answering service or IVR menu? Compare what each does on a real call, where each fails, and how to test them side by side.",
    "shortAnswer": "An IVR routes callers through a keypad menu, a human answering service takes messages and handles judgment calls, and an AI receptionist holds a conversation that can answer questions, book appointments and hand over to staff. Compare them on your most common call types, after-hours coverage, languages, what gets recorded, and how each handles the calls that go wrong.",
    "excerpt": "Three ways to answer a business phone, three very different caller experiences. Here is how to compare an AI receptionist, a human answering service and an IVR using the calls you actually receive.",
    "category": "Voice AI basics",
    "publishedAt": "2026-10-22",
    "readTime": "",
    "related": [
      "when-to-use-voice-ai-instead-of-ivr",
      "what-is-an-ai-voice-agent",
      "multilingual-ai-receptionist-hindi-punjabi-english"
    ],
    "sections": [
      {
        "heading": "What is the difference between an AI receptionist, an answering service and an IVR?",
        "paragraphs": [
          "All three answer the phone when your own staff cannot, but they do very different work once the call is connected. An IVR (interactive voice response) plays recorded prompts and acts on the keys a caller presses. A human answering service is a team of people, usually off-site, who pick up in your business name, take messages and follow a script you agree with them. An AI receptionist is a voice agent that listens to what the caller says in their own words and replies out loud, as described on our [AI receptionist overview](/ai-receptionist).",
          "The useful comparison is not which one sounds most modern. It is which one finishes your most common calls properly. A press-1 menu is cheap to run and predictable, but it only sorts callers. The [AI IVR overview page](/ai-ivr) shows what happens when the menu is replaced by a conversation on the same number. A human answering service brings judgment, but it is limited by staffing and usually ends in a message rather than a booking."
        ]
      },
      {
        "heading": "What does each option actually do on a call?",
        "paragraphs": [
          "Write down what your front desk does today before you compare anything. The US Bureau of Labor Statistics lists answering the phone, taking messages or forwarding calls, and scheduling and confirming appointments among a receptionist’s core duties. Map each option against those jobs, and use the [AI agent vs IVR comparison](/vs-ivr) for the detailed menu-versus-conversation differences."
        ],
        "points": [
          "IVR: greets the caller, offers numbered options, collects digits, plays recorded information and transfers to a queue or voicemail. It cannot understand a request that does not match an option.",
          "Human answering service: answers in your business name, takes a message, may book from a shared calendar, and passes urgent calls on according to your instructions. Quality depends on who picks up and how well they were briefed.",
          "AI receptionist: asks how it can help, answers from approved information, asks a follow-up question, books a slot or takes a callback request, and on phone calls can transfer to a colleague. Every call leaves a transcript and summary."
        ]
      },
      {
        "heading": "How do the three compare on the things callers notice?",
        "paragraphs": [
          "Callers judge a business line on a few simple things: how quickly someone answers, whether they are understood, and whether the call ends with something done. Score each option on the criteria below for your own call types, not for an average business.",
          "Language is the criterion buyers most often skip. If a large share of your callers prefer Hindi, Tamil or Punjabi, an English-only service or a language menu adds friction before the caller has said a word. Our [multilingual voice agent buying guide](/resources/blog/how-to-choose-a-multilingual-voice-agent) explains how to test this properly."
        ],
        "points": [
          "Availability: an IVR and an AI receptionist can answer at any hour the line is open; an answering service depends on its shifts and how many calls arrive at once.",
          "Understanding: an IVR understands keys and a few words; people understand almost anything; an AI receptionist understands natural speech within the scope and facts you give it.",
          "Outcome: an IVR routes, an answering service usually takes a message, and an AI receptionist can complete simple tasks such as a booking during the call.",
          "Consistency: an IVR and an AI agent say the same approved thing every time; human answers vary from person to person.",
          "Record: an AI receptionist keeps a transcript of every call; with the other two you usually get a message note or a log of key presses."
        ]
      },
      {
        "heading": "Where does a human answering service still win?",
        "paragraphs": [
          "People are better at calls that need judgment, empathy or authority. A caller who is upset about a bill, a request that falls between your policies, or a conversation where tone matters more than facts should reach a person. An AI receptionist should be configured to recognise these calls and hand them over rather than improvise.",
          "That handover is the part to inspect closely. On Vistrow Voice, a phone call can be transferred: the agent dials the colleague you set and stays on the line until they answer, as the [inbound call answering page](/product/inbound) describes. A call started from the website widget runs in the browser, so the agent takes a callback number instead. Many businesses end up with an AI receptionist for the routine calls and their own staff, or an answering service, for the rest."
        ]
      },
      {
        "heading": "When is an IVR still the right choice?",
        "paragraphs": [
          "Keep a menu when callers already know exactly what they want and can name it in one word, when a caller must enter a long account number by keypad, or when policy requires a fixed script. Some callers also prefer keys to speech, and a keypad route helps them.",
          "If most of your calls split cleanly into two or three departments, a short menu may be all you need. Problems appear when the tree grows deep or callers keep choosing the wrong option. Our guide on [when to use voice AI instead of IVR](/resources/blog/when-to-use-voice-ai-instead-of-ivr) walks through that decision call reason by call reason."
        ]
      },
      {
        "heading": "How should you compare the cost of each option?",
        "paragraphs": [
          "Price lists are hard to compare because each option charges differently: an IVR by number and usage, an answering service by plan, minutes or calls, and an AI receptionist usually by minutes of conversation. Compare instead on the cost of a useful call, meaning a call that ended with the caller’s need met or a clear next step.",
          "Count what each option leaves your team to do afterwards. A message that someone must return, a caller who pressed the wrong key and called again, or a lead with no details all cost staff time. Our article on [the cost per useful call](/resources/blog/ai-voice-agent-pricing-india) lists what to include. For current Vistrow Voice plans, see the [Vistrow Voice pricing page](/pricing)."
        ]
      },
      {
        "heading": "How do you run a fair side-by-side test?",
        "paragraphs": [
          "Pick one high-volume call type, such as appointment requests or new enquiries, and write down what a good outcome is before you test. Then put the same scripted calls through each option, played by colleagues who act like real callers: one in a hurry, one who changes their mind, one who speaks a second language, one who asks for a manager.",
          "Vistrow Voice lets you test an agent in the browser and in a Testing Lab before any real caller reaches it, then route one number to it while the others stay as they are. Read the results from records, not impressions, and time how long callers wait using the [voice AI latency testing guide](/resources/blog/voice-ai-latency-how-to-measure-it)."
        ],
        "points": [
          "Did the caller reach a clear outcome: an answer, a booking, a callback request or a person?",
          "Did they have to repeat themselves after a handover?",
          "Was the right information captured and sent to your team?",
          "Which calls went wrong, and would the fix be a fact, an instruction or a human route?"
        ]
      }
    ],
    "faqs": [
      {
        "q": "Is an AI receptionist the same as an answering service?",
        "a": "No. An answering service is a team of people who answer on your behalf. An AI receptionist is software that holds the conversation itself, answers from your approved information and hands over to a person when needed."
      },
      {
        "q": "Can an AI receptionist replace my IVR menu?",
        "a": "Often, yes. Callers say what they need instead of pressing keys, and the agent answers, books or transfers. Keep a keypad option where callers must enter long numbers or prefer keys."
      },
      {
        "q": "Which option is best for after-hours calls?",
        "a": "An AI receptionist suits after-hours calls well because it can answer, book a slot or take a callback request at any hour the line allows. Urgent issues still need a human or emergency route you define."
      },
      {
        "q": "Can I use an AI receptionist and a human team together?",
        "a": "Yes, and most businesses do. Let the agent handle routine calls and transfer phone calls to your staff for complaints, sensitive topics or anything it is not sure about."
      },
      {
        "q": "What should I test before choosing?",
        "a": "Run the same set of real call types through each option, including difficult callers and a second language, and judge them on outcomes, handovers and what reaches your team afterwards."
      }
    ]
  },
  {
    "slug": "what-is-an-ai-receptionist",
    "title": "What is an AI receptionist, and what should it handle?",
    "seoTitle": "AI Receptionist: What It Is and What It Should Handle",
    "metaDescription": "What an AI receptionist is, how it answers calls, which calls it should handle, which belong with a person, and how to tell if it is working.",
    "shortAnswer": "An AI receptionist is a voice agent that answers your business calls, greets callers, answers common questions from approved information, books appointments, takes messages and hands the caller to a person when needed. It should handle frequent, repeatable calls with a clear next step, and pass complaints, sensitive topics and anything uncertain to your team.",
    "excerpt": "A plain explanation of what an AI receptionist does on a call, which front-desk calls it should take on, and which it should always pass to a person.",
    "category": "Voice AI basics",
    "publishedAt": "2026-10-23",
    "readTime": "",
    "related": [
      "ai-receptionist-vs-answering-service-vs-ivr",
      "what-is-an-ai-voice-agent",
      "write-ai-voice-agent-prompts"
    ],
    "sections": [
      {
        "heading": "What is an AI receptionist?",
        "paragraphs": [
          "An AI receptionist is software that answers a business phone line, or a voice button on a website, and holds a spoken conversation with the caller. It greets them, works out what they need from what they say, and replies out loud. It is a specific use of an [AI voice agent](/resources/blog/what-is-an-ai-voice-agent): one set up to do the front-desk part of a receptionist’s job.",
          "That front-desk job is well defined. The US Bureau of Labor Statistics lists answering the telephone, taking messages or forwarding calls, scheduling and confirming appointments, and greeting visitors among a receptionist’s typical duties. An AI receptionist covers the phone part of that list. It does not greet people at the counter, file documents or use judgment the way an experienced colleague does. Our [AI receptionist overview](/ai-receptionist) shows what the role looks like on a real business line."
        ]
      },
      {
        "heading": "How does an AI receptionist work on a call?",
        "paragraphs": [
          "The call arrives on your number, which stays with your telephony provider and is routed to the agent. The agent picks up with the welcome line you wrote, listens, and turns the caller’s speech into text. A language model decides what to say or do next, using your instructions and approved facts, and a synthetic voice speaks the reply. This loop repeats for each turn until the call ends. The [inbound call answering page](/product/inbound) shows each step on Vistrow Voice."
        ],
        "points": [
          "Greet: a short welcome in your business name, ideally saying the caller is speaking with an AI assistant.",
          "Understand: work out the request from free speech, including mixed languages such as Hindi and English.",
          "Act: answer, book a slot, take a callback request, capture details or transfer the call.",
          "Record: save a transcript, a summary and the details your team asked for."
        ]
      },
      {
        "heading": "Which calls should an AI receptionist handle?",
        "paragraphs": [
          "Start with calls that are frequent, repeatable and have a clear end. If a new colleague could handle the call after a day of training and a printed FAQ sheet, an AI receptionist probably can too. The answers should come from material you approve, kept in a [knowledge base of approved answers](/product/knowledge-base), not from the agent’s general knowledge.",
          "A useful test is to list last week’s calls by reason and mark each one as answer, book, capture or person. The first three are the AI receptionist’s job; the last column tells you which transfer rules to write. Most small businesses find that a handful of reasons make up most of their calls, and those are where to start. Leave the rest with your team until the first set runs smoothly."
        ],
        "points": [
          "Opening hours, location, parking, documents to bring and other standing facts.",
          "Appointment requests, rescheduling and cancellations within the hours and slot length you set.",
          "New enquiries where a few questions, such as budget, location or timeline, qualify the lead before your team calls back.",
          "Messages and callback requests with the caller’s name, number and reason.",
          "After-hours calls that would otherwise reach voicemail."
        ]
      },
      {
        "heading": "Which calls should always go to a person?",
        "paragraphs": [
          "Decide this before launch and write it into the agent’s instructions as a fixed rule. A good AI receptionist knows the edge of its job and says so plainly, rather than guessing. On phone calls, Vistrow Voice can dial the colleague you set and stay on the line until they answer; the [functions and transfer guide](/help/agents/agent-functions-and-transfer) explains how that is set up."
        ],
        "points": [
          "Complaints, disputes, refunds and anything that needs authority to decide.",
          "Medical, legal or financial advice, and any possible emergency.",
          "Questions the approved material does not cover.",
          "Any caller who asks for a person."
        ]
      },
      {
        "heading": "Where does an AI receptionist get its answers?",
        "paragraphs": [
          "From you. Upload your FAQs, service list, policies or brochure, review the question-and-answer pairs extracted from them, and attach that knowledge base to the agent. With strict mode on, Vistrow Voice quotes your approved answers and says it will check with the team when something is not covered, instead of filling the gap with a plausible guess. The [guide to adding knowledge](/help/knowledge-base/add-knowledge) walks through the steps.",
          "The agent’s instructions matter as much as its facts. They set its tone, the questions it asks, what it must never say and when it hands over. Our article on [writing a voice agent prompt](/resources/blog/write-ai-voice-agent-prompts) covers how to write instructions that hold up on real calls."
        ]
      },
      {
        "heading": "Can callers reach an AI receptionist from a website as well as a phone?",
        "paragraphs": [
          "Yes. Besides your phone number, the same agent can sit behind a voice button on your site, so a visitor taps it and talks from the browser without dialling. The [website voice widget](/product/widget) works in any modern browser, in any country, because no phone call is involved.",
          "There is one difference to plan for. A conversation started in the browser cannot be transferred to a phone, so for those calls the agent takes a callback number instead. For phone callers abroad, whether they can reach your number depends on your telephony provider and the number you use, so check that with your provider first.",
          "Many businesses use the phone line for existing customers who already know the number, and the website button for new visitors who arrive from search or social media and would rather talk than fill in a form."
        ]
      },
      {
        "heading": "How do you know an AI receptionist is working?",
        "paragraphs": [
          "Read the calls. Every call should leave a transcript, a short summary and the details captured, plus the recording if recording is on. In the first weeks, listen to a sample every day, starting with calls that ended in a transfer, a dropped caller or a repeated question. Our checklist for [AI call recordings and transcripts](/resources/blog/ai-call-recordings-and-transcripts) covers what to check.",
          "Track a few simple measures: the share of calls that reach a clear outcome, how often callers ask for a person, and how many calls your team still has to return. If you are still choosing between options, compare them using our guide to [AI receptionist vs answering service vs IVR](/resources/blog/ai-receptionist-vs-answering-service-vs-ivr)."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What does an AI receptionist do?",
        "a": "It answers calls, greets callers, answers common questions from approved information, books appointments, takes messages and callback requests, and hands the call to a person when needed. Every call is saved with a transcript."
      },
      {
        "q": "Does an AI receptionist replace a human receptionist?",
        "a": "It covers the phone part of the job, especially busy periods and after hours. People are still needed for visitors at the counter, complaints, judgment calls and anything the agent hands over."
      },
      {
        "q": "Can an AI receptionist book appointments?",
        "a": "Yes. On Vistrow Voice the agent books into the built-in Appointments calendar, offering only slots inside the business hours, slot length and blackout dates you set, and confirms once the booking has saved."
      },
      {
        "q": "Which languages can an AI receptionist speak?",
        "a": "Vistrow Voice speaks more than 130 languages, including Hindi, English and nine other Indian languages (Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, Odia), and follows the caller if they switch language mid-call. Test each language you need with native speakers before launch."
      },
      {
        "q": "Should callers be told they are speaking to an AI?",
        "a": "Yes. A short disclosure in the greeting, plus a clear route to a person, builds trust. Check recording and disclosure rules for each market you serve."
      }
    ]
  },
  {
    "slug": "ai-ivr-replacing-phone-menus-with-conversation",
    "title": "AI IVR: replacing phone menus with a conversation",
    "seoTitle": "AI IVR: Replacing Phone Menus With a Conversation",
    "metaDescription": "How an AI IVR replaces press-1 menus with one open question: designing the opening, turning your IVR tree into instructions, and switching safely.",
    "shortAnswer": "An AI IVR answers your business number with a question such as “How can I help?” instead of a keypad menu. It understands the caller’s sentence, then answers from approved information, books a slot, takes a callback request or transfers the call. Replacing a menu well means rewriting each menu branch as an intent, an answer source and an owner.",
    "excerpt": "Removing a phone menu is easy. Replacing what it did is the real work. Here is how to design the opening question, convert your IVR tree and move one line at a time.",
    "category": "IVR & phone systems",
    "publishedAt": "2026-10-24",
    "readTime": "",
    "related": [
      "what-is-ivr-interactive-voice-response",
      "ivr-vs-ai-voice-agent-india",
      "ai-receptionist-vs-answering-service-vs-ivr"
    ],
    "sections": [
      {
        "heading": "What is an AI IVR?",
        "paragraphs": [
          "A traditional IVR answers a call with recorded prompts and waits for keypad tones or a few expected words. The technology is mature: the W3C published VoiceXML 2.0, a standard language for these menu dialogs, as a Recommendation in 2004. Our [guide to how IVR works](/resources/blog/what-is-ivr-interactive-voice-response) explains menus, DTMF and IVR trees in detail.",
          "An AI IVR keeps the job of the IVR, which is to answer, understand and resolve or route, but drops the menu. The caller says what they need in their own words and an AI voice agent works out the intent. The [AI IVR overview](/ai-ivr) shows how this runs on a business number. This article is about the practical part: what you put in place of the menu so callers are never worse off than before."
        ]
      },
      {
        "heading": "What replaces the menu when you remove it?",
        "paragraphs": [
          "One open question replaces the whole first level of the tree. The greeting should name the business, say briefly that the caller is speaking with an AI assistant, and ask what they need. Keep it short: callers who are used to menus wait for options, and a long introduction feels like one.",
          "The agent then does what a good menu designer tried to do with branches, but in conversation. If the request is clear, it acts. If it is vague, it asks one follow-up question. If it is outside scope, it routes. On Vistrow Voice that opening line is the welcome message you write for inbound calls, set per agent on the [inbound call answering page](/product/inbound)."
        ],
        "points": [
          "Good opening: “Namaste, Sharma Diagnostics. You are speaking with our AI assistant. How can I help?”",
          "Too long: a paragraph about the company, its services and opening hours before the caller can speak.",
          "Too vague: “Please state your query,” which sounds like a menu without options."
        ]
      },
      {
        "heading": "How do you turn an IVR tree into instructions for the agent?",
        "paragraphs": [
          "Take your current menu and rewrite every option as four things: the intent in plain words, how callers usually phrase it, where the answer comes from and who owns it if the agent cannot finish. Answers go into a [knowledge base of approved answers](/product/knowledge-base); actions such as booking or transfer go into the agent’s functions; everything else becomes a rule in its instructions."
        ],
        "points": [
          "Press 1 for timings becomes: answer opening hours and location from the knowledge base.",
          "Press 2 for appointments becomes: offer free slots inside business hours and book, or take a callback request if nothing fits.",
          "Press 3 for an existing order becomes: capture the order number and transfer, or take a callback, unless the agent has an approved way to look it up.",
          "Press 9 for an executive becomes: transfer on request, at any point in the call."
        ]
      },
      {
        "heading": "What happens to the language menu?",
        "paragraphs": [
          "It goes. “Press 1 for English, press 2 for Hindi” is often the first thing callers hear, and it delays every call. An AI IVR can open in your default language and switch when the caller does. Vistrow Voice speaks more than 130 languages, including Hindi, English and nine other Indian languages (Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, Odia), and follows mixed speech such as Hinglish; the [supported languages page](/languages) has a page for each Indian language.",
          "Choose the opening language by who calls most. A Bengaluru clinic might open in English, a Pune property line in Marathi or Hindi. Test with native speakers before launch, because names, numbers and addresses are where recognition slips first."
        ]
      },
      {
        "heading": "How should an AI IVR handle callers it does not understand?",
        "paragraphs": [
          "A menu has a simple fallback: repeat the options. A conversation needs a designed one. Decide what the agent does after a short silence, after a second unclear answer, and when a caller is in a noisy place. The usual pattern is to rephrase once, offer a narrower question, and then route the caller to a person or take a callback request rather than loop. The [AI agent vs IVR comparison](/vs-ivr) covers where each approach is stronger."
        ],
        "points": [
          "Silence: prompt once, then ask a yes or no question the caller can answer briefly.",
          "Unclear twice: offer a person or a callback instead of asking a third time.",
          "Caller asks for a person: transfer straight away on phone calls, without arguing.",
          "Caller prefers keys or has difficulty speaking: keep an alternative route, such as a separate line or a short keypad option on your existing system."
        ]
      },
      {
        "heading": "What should an AI IVR send to your team after the call?",
        "paragraphs": [
          "A menu IVR tells you which keys were pressed. An AI IVR can tell you what the caller wanted. Every Vistrow Voice call is saved with a transcript, a summary and the fields you chose to extract, plus the recording if recording is on. Those details can go to Zoho CRM, Google Sheets, Slack, ArthaLeads or a webhook as the call ends, through the [CRM and app integrations](/product/integrations).",
          "Agree the fields with the people who pick up transferred calls. Name, number, call reason and preferred callback time are a common minimum, so nobody asks the caller to start again."
        ]
      },
      {
        "heading": "How do you switch from a menu to an AI IVR safely?",
        "paragraphs": [
          "Move one line at a time. Pick a number with predictable calls, such as an after-hours line or a single enquiry number, route it to the agent and leave the others on the existing IVR. Vistrow Voice lets you set the hours, active days and how many calls the line takes at once for each number. Read a sample of transcripts every day for the first week and fix the cause of each failed call: a missing fact, a vague instruction or a topic that belongs with a person.",
          "Keep the old flow ready until the new one has run on real traffic, so switching back is a routing change rather than a rebuild. Our [IVR vs AI voice agent decision guide](/resources/blog/ivr-vs-ai-voice-agent-india) explains how to choose which call reasons move first, and the [Vistrow Voice pricing page](/pricing) lists current plans."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is an AI IVR?",
        "a": "An AI IVR answers a phone line with a conversation instead of a keypad menu. It understands what the caller says and answers, books, takes a callback request or transfers the call."
      },
      {
        "q": "Do I need a new phone number for an AI IVR?",
        "a": "Not necessarily. The number stays with your telephony provider and is routed to the agent. Check the connection setup with your provider, or use a new number."
      },
      {
        "q": "Can an AI IVR transfer calls to a person?",
        "a": "Yes. On Vistrow Voice, set a transfer number and the agent dials your colleague into the call and stays on until they answer."
      },
      {
        "q": "Does an AI IVR still need a language menu?",
        "a": "No. The agent opens in your default language and follows the caller if they switch, including Hindi, English and nine other Indian languages."
      },
      {
        "q": "Should I replace every IVR line at once?",
        "a": "No. Move one line with predictable calls first, read the transcripts for a week, and keep the old flow until the new one has proved itself on real traffic."
      }
    ]
  },
]

export const DAILY_IMAGE_ALTS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'Large Hindi and Punjabi greetings and Hello beside a Sikh caller at a front desk, with an Artha AI badge',
  'ai-receptionist-vs-answering-service-vs-ivr': 'Comparison cover: Artha, the AI receptionist, wearing a headset beside three cards for an IVR menu, an answering service and an AI receptionist',
  'what-is-an-ai-receptionist': 'Artha, the AI receptionist, at a bright front desk wearing a headset, with a white card asking what an AI receptionist is',
  'ai-ivr-replacing-phone-menus-with-conversation': 'Before and after: a frustrated caller stuck in a press-1 phone menu, beside Artha, the AI agent, asking how she can help',
}

export const DAILY_SOURCES: Record<string, VoiceBlogPost['sources']> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': [
    { title: 'Office for National Statistics: Language, England and Wales, Census 2021', url: 'https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/language/bulletins/languageenglandandwales/census2021' },
    { title: 'Statistics Canada: Asian History Month, let’s talk languages (2021 Census)', url: 'https://www.statcan.gc.ca/o1/en/plus/9158-asian-history-month-lets-talk-languages' },
  ],
  'ai-receptionist-vs-answering-service-vs-ivr': [{"title":"US Bureau of Labor Statistics: Occupational Outlook Handbook, Receptionists","url":"https://www.bls.gov/ooh/office-and-administrative-support/receptionists.htm"}],
  'what-is-an-ai-receptionist': [{"title":"US Bureau of Labor Statistics: Occupational Outlook Handbook, Receptionists","url":"https://www.bls.gov/ooh/office-and-administrative-support/receptionists.htm"}],
  'ai-ivr-replacing-phone-menus-with-conversation': [{"title":"W3C: Voice Extensible Markup Language (VoiceXML) Version 2.0, Recommendation 16 March 2004","url":"https://www.w3.org/TR/voicexml20/"}],
}

export const DAILY_CONTEXTUAL_LINKS: Record<string, string> = {
  'multilingual-ai-receptionist-hindi-punjabi-english': 'To see how this works for a small team, read how an [AI receptionist answers and routes calls](/ai-receptionist), or browse every [language the voice agent supports](/languages).',
  'ai-receptionist-vs-answering-service-vs-ivr': 'To go deeper on the options, read [how an AI voice agent works on a call](/resources/blog/what-is-an-ai-voice-agent) or see [how an AI receptionist answers and routes calls](/ai-receptionist).',
  'what-is-an-ai-receptionist': 'To see this in practice, explore the [Vistrow Voice AI receptionist](/ai-receptionist) or browse every [language the voice agent supports](/languages).',
  'ai-ivr-replacing-phone-menus-with-conversation': 'To plan the change, see how an [AI IVR answers your business number](/ai-ivr) or compare the [AI agent and IVR side by side](/vs-ivr).',
}
