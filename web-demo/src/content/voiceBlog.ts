export interface VoiceBlogSection {
  heading: string
  paragraphs: string[]
  points?: string[]
}

export interface VoiceBlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readTime: string
  sections: VoiceBlogSection[]
  image: string
  imageAlt: string
  updatedAt: string
  sources: { title: string; url: string }[]
}

const ORIGINAL_POSTS: Omit<VoiceBlogPost, 'image' | 'imageAlt' | 'updatedAt' | 'sources'>[] = [
  {
    slug: 'what-is-an-ai-voice-agent',
    title: 'What is an AI voice agent? A practical guide for business teams',
    excerpt: 'Understand how a voice agent listens, responds, and completes useful work—and where it fits alongside your people, phone system, and existing workflows.',
    category: 'Voice AI basics',
    publishedAt: '2026-09-28',
    readTime: '6 min read',
    sections: [
      { heading: 'From phone menu to conversation', paragraphs: [
        'An AI voice agent is software that can take part in a spoken conversation. A caller speaks naturally; the system recognizes the words, works out what the caller needs, and replies out loud. Unlike a fixed keypad menu, the exchange can follow the caller’s intent and ask a relevant follow-up question.',
        'A business voice agent combines speech recognition, a language model, text-to-speech, and the rules and information supplied by the business. The experience is only as reliable as that complete system—not any single model in isolation.',
      ] },
      { heading: 'What should it handle?', paragraphs: ['Start with calls that are frequent, repeatable, and have a clear next step. An agent may answer approved questions, collect a few details, qualify an enquiry, request an appointment, or route a caller to a person.'], points: [
        'Inbound calls that arrive outside staffed hours or during busy periods.',
        'Outbound reminders and follow-ups where the purpose and permitted calling window are clear.',
        'Website conversations that let a visitor speak instead of filling in a long form.',
        'Structured handoffs where a human needs the caller’s context before taking over.',
      ] },
      { heading: 'Keep people in the loop', paragraphs: ['A voice agent should be transparent about what it is, avoid inventing answers, and provide a human path when a request is sensitive, uncertain, or outside its scope. Give it approved source material, define the actions it may take, and test difficult caller turns before launch.', 'The goal is not to automate every conversation. It is to make the first useful response more consistent while preserving human judgement for the situations that need it.'] },
    ],
  },
  {
    slug: 'how-to-choose-a-multilingual-voice-agent',
    title: 'How to choose a multilingual AI voice agent for callers in India',
    excerpt: 'Language support is more than a dropdown. Evaluate recognition, pronunciation, code-switching, caller choice, and the actual phone environment before you go live.',
    category: 'Languages & speech',
    publishedAt: '2026-09-24',
    readTime: '7 min read',
    sections: [
      { heading: 'Test the conversation, not the language count', paragraphs: ['A platform may list many languages, but your callers care whether it understands the words they actually use. Test common names, addresses, numbers, product terms, and the mix of regional language and English your customers speak.', 'Include ordinary speech and imperfect audio. A quiet browser demo is not the same as a mobile call with background noise, interruptions, and a caller speaking at their normal pace.'] },
      { heading: 'Check these five details', paragraphs: ['Ask vendors to demonstrate a complete task in each language you plan to support—not just a greeting. Compare the transcript with what the caller said and listen for awkward pronunciation or unnatural pauses.'], points: [
        'Recognition quality for local accents, names, and domain-specific vocabulary.',
        'Whether people can switch between a regional language, Hindi, and English mid-conversation.',
        'Voice quality and pronunciation of numbers, dates, addresses, and brand names.',
        'How the agent handles a misunderstood answer: clarify, confirm, or hand off.',
        'Whether language selection is explicit, automatic, or configurable per agent and campaign.',
      ] },
      { heading: 'Design for caller control', paragraphs: ['A good flow lets the caller correct the agent or ask to continue in another supported language. Keep the opening short, avoid assuming a caller’s language from their name, and confirm important details such as a phone number or appointment time.', 'Evaluate language quality and response time together. A natural-sounding voice is not useful if the caller waits too long for each turn; a fast system is not useful if it repeatedly misunderstands them.'] },
    ],
  },
  {
    slug: 'voice-ai-latency-how-to-measure-it',
    title: 'Voice AI latency: what to measure before you judge a call',
    excerpt: 'A low-latency demo is not proof of a responsive phone experience. Measure the caller’s pause to first audible reply, interruptions, and the full turn under real network conditions.',
    category: 'Performance & latency',
    publishedAt: '2026-09-20',
    readTime: '6 min read',
    sections: [
      { heading: 'The pause callers notice', paragraphs: ['For a caller, latency is the silence between finishing a thought and hearing the agent begin its response. That wait includes audio transport, speech recognition, language-model processing, text-to-speech generation, and playback buffering.', 'Provider benchmarks often measure only one part of that chain. For a fair comparison, measure from the end of the caller’s turn to the first audible agent audio in the same channel you plan to deploy.'] },
      { heading: 'Run a repeatable test', paragraphs: ['Use the same script, language, network, and question set for each configuration. Record several calls rather than relying on one best-case result. Test both short answers and longer responses, then review the audio alongside timestamps and logs.'], points: [
        'Track median and slower-turn latency, not only the fastest call.',
        'Separate greeting time from response time after the caller speaks.',
        'Test interruptions, silence detection, barge-in, and end-of-turn behavior.',
        'Repeat over browser audio and the actual phone route; their network paths differ.',
        'Log the selected speech, model, and fallback route so a test is attributable.',
      ] },
      { heading: 'Tune the whole pipeline', paragraphs: ['Shorter, well-structured answers can reduce perceived waiting and keep a conversation focused. Streaming recognition and speech generation can help when supported, but buffering, slow tool calls, or synchronous work on the audio event loop can erase those gains.', 'Optimize from observed traces, one component at a time. A useful target is a conversation that feels responsive and remains accurate—not the smallest number in a provider’s marketing table.'] },
    ],
  },
  {
    slug: 'website-voice-widget-for-lead-generation',
    title: 'Using a website voice widget to respond to high-intent visitors',
    excerpt: 'A voice widget can give a ready-to-talk visitor a direct route to answers. Here is how to make that conversation useful without turning it into a sales script.',
    category: 'Website voice',
    publishedAt: '2026-09-16',
    readTime: '5 min read',
    sections: [
      { heading: 'Give visitors a reason to speak', paragraphs: ['A website voice widget works best when it offers a clear benefit: ask about a service, check whether a product fits, understand a project, or request a next step. A generic “talk to us” button is less helpful than explaining what the agent can answer.', 'Keep the choice optional. Visitors should be able to close the widget and use the site normally, and the page should explain whether the conversation may be recorded or transcribed.'] },
      { heading: 'Ground the agent in the page and your approved facts', paragraphs: ['Give the agent reliable product or service information and make the page context available only when appropriate. It should distinguish confirmed facts from details that need a human follow-up. If pricing or availability changes frequently, do not rely on an old static document as the source of truth.'] },
      { heading: 'Measure outcomes beyond widget opens', paragraphs: ['Count completed conversations, qualified enquiries, useful handoffs, and booked next steps—not just clicks on the microphone. Review transcripts and caller feedback to find questions the agent cannot answer or moments when visitors abandon the exchange.', 'Start with one page and a narrow purpose. Once you understand the quality of the conversations, expand to other high-intent pages and compare outcomes against the existing enquiry path.'] },
    ],
  },
  {
    slug: 'connecting-voice-calls-to-your-crm',
    title: 'Connecting voice calls to your CRM without losing the conversation',
    excerpt: 'A useful CRM handoff needs more than a caller’s phone number. Map the call identity, transcript, outcome, consent, and retry behavior before connecting production traffic.',
    category: 'CRM & integrations',
    publishedAt: '2026-09-12',
    readTime: '7 min read',
    sections: [
      { heading: 'Decide what the team needs after a call', paragraphs: ['Before building an integration, agree on the fields the receiving team will actually use: caller identity, intent, qualification answers, next action, owner, and a concise summary. Keep the complete transcript and recording link available when the workflow requires them, but avoid copying sensitive data into fields that do not need it.'] },
      { heading: 'Make delivery reliable', paragraphs: ['A webhook can fail because of a timeout, an unavailable CRM, an expired credential, or an invalid field. Design the sender and receiver to make retries safe: include a stable call identifier, record delivery status, and make repeated delivery update the same call record rather than create duplicates.'], points: [
        'Authenticate requests and validate the organization or tenant receiving the event.',
        'Treat the call ID as an idempotency key for retries.',
        'Store attempt time, response status, and a useful error without exposing secrets.',
        'Set a clear retention policy for recordings, transcripts, and webhook logs.',
        'Test both success and failure paths with a non-production CRM record.',
      ] },
      { heading: 'Verify the destination, not just the send button', paragraphs: ['A successful HTTP response does not always mean the record appeared in the intended workspace or that the recording is playable there. Confirm the field mapping, tenant, permissions, and media URL from the receiving CRM account. Give operators a way to inspect delivery status and safely retry a failed event.', 'For recording links, check access control and expiration. A public URL may be convenient, but it can expose a customer conversation to anyone who obtains the link.'] },
    ],
  },
  {
    slug: 'when-to-use-voice-ai-instead-of-ivr',
    title: 'AI voice agent or IVR? How to choose the right call experience',
    excerpt: 'IVR menus remain useful for predictable routing. Conversational voice AI is a better fit when callers need to explain their intent or complete a short, flexible task.',
    category: 'Voice AI basics',
    publishedAt: '2026-09-08',
    readTime: '5 min read',
    sections: [
      { heading: 'IVR is still useful for simple routing', paragraphs: ['A keypad menu is predictable, easy to audit, and often effective when callers need only choose a department, language, or known option. If the tree is short and callers understand it, replacing it may add complexity without improving the experience.'] },
      { heading: 'Use conversation when callers need to explain', paragraphs: ['A voice agent may fit when the caller’s intent is varied, the next question depends on the answer, or the system needs to collect context before routing. For example, it can ask what the caller needs help with and pass a short summary to a human—provided it is connected to trustworthy information and a clear handoff.'] },
      { heading: 'Choose from the call, not the trend', paragraphs: ['Map the top call reasons, how often each repeats, the cost of a wrong answer, and what happens when the system is uncertain. Then test both approaches with real scripts and accessibility needs in mind.'], points: [
        'Keep IVR for stable, high-confidence routing choices.',
        'Consider voice AI for natural-language questions and structured qualification.',
        'Use a hybrid flow when a short menu can route callers to the right agent.',
        'Always provide a human escape path for high-risk or unresolved requests.',
      ] },
    ],
  },
]

const EXTRA_SECTIONS: Record<string, VoiceBlogSection[]> = {
  'what-is-an-ai-voice-agent': [
    { heading: 'A small example: an appointment enquiry', paragraphs: [
      'A caller asks, “Can I come in on Saturday?” A useful agent does not launch into the company introduction again. It checks which service the caller needs, asks for a preferred time, and explains whether it can confirm a booking or only pass along a request. That distinction matters: a polite conversation is not the same as a completed appointment.',
      'Behind the voice, four things need to agree: the spoken answer, the booking system, the confirmation message, and the record your team sees. If the booking action fails, the agent should say so and offer a follow-up. It should not announce success because its sentence sounded convincing.',
    ] },
    { heading: 'Your first pilot should have a stopping rule', paragraphs: [
      'Pick one call reason and write down what a successful call leaves behind. For appointment enquiries, that might be a verified service, a requested slot, and a reachable contact. Decide which situations go straight to a person, including a complaint or a request the agent cannot verify.',
      'Review a sample of successful calls as well as failed ones. An enquiry can look complete in a dashboard while containing the wrong date. Keep a short issue log, change one part of the flow at a time, and repeat the same test calls after each change. Expand the scope only when the first task is dependable.',
    ], points: ['Can the caller correct a name or date without starting over?', 'Does an unavailable service produce an honest answer?', 'Can your team find the call and act on its next step?', 'Does the agent stop or hand off when asked?'] },
  ],
  'how-to-choose-a-multilingual-voice-agent': [
    { heading: 'Start with a primary language and one real fallback', paragraphs: [
      'If most callers speak English and a smaller group prefers Marathi, an English-first agent with Marathi available on request is a sensible pilot. You do not need to turn on every language simply because the platform supports them. Set the initial language explicitly and define how the caller can change it.',
      'A smaller language scope can simplify testing and avoid unnecessary language-detection decisions. It is not a guaranteed latency reduction: end-of-turn timing, the speech providers, model response time, and the phone route still matter. Compare both configurations on the same call script before attributing a speed improvement to language settings.',
    ] },
    { heading: 'Build a test pack your sales team would recognise', paragraphs: [
      'Include the phrases customers actually use: “budget seventy-five tak hai,” a building name, a village address, and a callback time. Use fictional contact details. Ask colleagues to read the examples naturally rather than pronounce every syllable as if recording a training course.',
      'Score the important fields separately from the transcript. A transcript can be mostly correct while the agent confuses fifteen with fifty or a requested date with an available date. Confirm critical details aloud, then inspect the saved record. For code-switching, test whether the reply follows the caller without changing voice identity unexpectedly.',
    ], points: ['Same twenty enquiries in each required language.', 'Quiet room and ordinary background-noise samples.', 'Names, currency amounts, dates, and regional place names.', 'Language-change request halfway through a task.', 'A misunderstanding followed by a correction.'] },
  ],
  'voice-ai-latency-how-to-measure-it': [
    { heading: 'Make a timing sheet before changing providers', paragraphs: [
      'For each turn, note when the caller finishes speaking, when the system commits the turn, when the first model text arrives, when the first synthesized audio arrives, and when that audio becomes audible. These timestamps are not interchangeable. A fast text response can still sit behind a slow audio buffer.',
      'If most of the delay appears before the model starts, changing the language model may do very little. Inspect end-of-turn detection and speech recognition first. If the model responds quickly but speech starts late, look at text chunking, synthesis startup, transport, and playback. Use server traces and a call recording together; either one alone misses part of the experience.',
    ] },
    { heading: 'Use a comparison that cannot hide the slow turns', paragraphs: [
      'Run at least a few repeated conversations per configuration and keep the failures in the results. Report a median and a slower percentile, along with sample size and the channel. Do not mix browser and phone observations into one number or compare a cached greeting with a fresh answer.',
      'Include a short question, a longer explanation, an interrupted answer, and a tool-backed request. A system can feel fast until it checks availability. Also listen for premature replies: cutting a caller off may shorten the measured pause while making the conversation worse. Choose the fastest configuration that still lets people finish and gets the task right.',
    ], points: ['Record exact provider, model, voice, region, and fallback.', 'Keep the same prompt and response-length instructions.', 'Measure the actual phone route as well as the browser.', 'Separate tool time from model and synthesis time.', 'Track misunderstood answers alongside latency.'] },
  ],
  'website-voice-widget-for-lead-generation': [
    { heading: 'The microphone permission step is part of the funnel', paragraphs: [
      'Browser audio needs microphone permission and a secure context. Explain the purpose before asking for access. If someone declines, do not trap them behind a retry button; offer a contact form, chat, or callback request. A voice-only funnel excludes visitors who are in a noisy place or simply do not want to speak.',
      'Test on an actual mobile browser, not only a desktop development tab. Check denied permission, missing microphone, a Bluetooth headset, and a lost connection. Start recording or transcription only according to the notice and consent flow you have agreed with your legal and operations teams.',
    ] },
    { heading: 'Ask one useful question before asking for a number', paragraphs: [
      'On a property page, “Are you exploring this for yourself or as an investment?” can be a useful opening after a visitor asks about the project. But the agent should answer that question first. Demanding a phone number before offering any help makes the widget feel like a form wearing a microphone.',
      'When a next step is appropriate, explain why the detail is needed: “If you want the sales team to confirm availability, what number should they use?” Confirm the number and save the page context with the enquiry. Compare qualified enquiries and staff follow-up quality, not just the total number of conversations. A smaller number of relevant leads can be more useful than many empty opens.',
    ] },
  ],
  'connecting-voice-calls-to-your-crm': [
    { heading: 'Treat the handoff as a contract', paragraphs: [
      'Write down which fields are required, which can be absent, and which arrive later. A call may finish before its recording is ready. The receiver should be able to create the call record first, then attach the media when processing completes. A missing recording URL should mean “pending” or “unavailable,” not silently disappear into a blank field.',
      'Use the organization and stable call ID together when checking for duplicates. A phone number identifies a contact, not a conversation: the same person can call twice. Keep the raw outcome separate from any CRM stage mapping so a change in stage names does not rewrite what happened on the call.',
    ], points: ['Call ID, tenant identity, start time, end time, and channel.', 'Contact details with explicit missing values rather than guessed defaults.', 'Summary, qualification answers, outcome, and requested next action.', 'Recording status, protected media reference, and transcript.', 'Delivery attempt history with credentials removed.'] },
    { heading: 'Three failure tests worth doing before launch', paragraphs: [
      'Send the same event twice and confirm there is still one call. Make the receiver temporarily unavailable and verify that delivery can recover. Finally, sign in to a different tenant and confirm that the recording and transcript cannot be accessed there.',
      'The last test is easy to skip because the integration looks correct in the administrator account. Check it from the ordinary user account that will actually handle the lead. Verify playback, contact association, and the next-action field—not just a green “sent” badge.',
    ] },
  ],
  'when-to-use-voice-ai-instead-of-ivr': [
    { heading: 'Listen to the requests that do not fit a button', paragraphs: [
      'A caller who wants billing can press a billing option. A caller who says, “I changed my number and never got the payment link,” has provided two pieces of context that may not fit your menu. Conversation is valuable when it helps the team understand that context before deciding where the call belongs.',
      'That does not mean the agent should solve every billing problem. Define what it can verify, what it can collect, and when it must route the request. Avoid letting a model improvise account changes or payment instructions. A short natural-language intake followed by a person can be a better first version than full automation.',
    ] },
    { heading: 'Compare complete tasks, including the escape route', paragraphs: [
      'Test a known department request, an ambiguous request, a wrong selection, a caller who stays silent, and a caller who asks for a person. Measure whether they reach a useful destination and how often they must repeat themselves. Include people who prefer keypad controls or have difficulty using speech input.',
      'Keep the existing route available during a pilot. If the conversational path repeatedly misunderstands a particular task, narrow its scope rather than hiding the problem behind a longer prompt. The best choice may be a short language menu followed by a focused voice agent, with a clear human fallback.',
    ] },
  ],
}

const NEW_POSTS: typeof ORIGINAL_POSTS = [
  {
    slug: 'ai-voice-agents-for-real-estate-leads', title: 'AI voice agents for real estate leads: qualify without interrogating',
    excerpt: 'A practical call flow for property enquiries: answer the first question, confirm the requirement, and leave the sales team a clear next action.',
    category: 'Voice AI basics', publishedAt: '2026-10-07', readTime: '', sections: [
      { heading: 'Answer the question that brought the lead in', paragraphs: ['“What is the price?” is a reasonable first question. Do not respond with five qualification questions. Give the approved price range if you have one, explain what changes the final price, and distinguish a starting figure from a confirmed quote. If you cannot verify current pricing, say the sales team needs to confirm it.', 'For plots, size and use matter. A request for ten thousand square feet should not be saved as an interest in a standard apartment. Ask whether the buyer wants self-use, investment, or both; then follow the answer rather than marching through a generic BHK script.'] },
      { heading: 'Use a short qualification sequence', paragraphs: ['Collect only what helps the next conversation: property type, preferred location, approximate budget, intended use, and timeline. Some details may already be supplied by the enquiry. Confirm those briefly instead of asking the caller to repeat the form.', 'If the caller asks a new project question, answer it before returning to qualification. A useful agent holds the thread of the conversation. It should not keep asking for budget when the caller is trying to find out whether the requested plot size exists.'], points: ['Requirement: “What size are you considering?”', 'Purpose: “Is this for your own use or an investment?”', 'Budget: ask for a range; allow “not decided yet.”', 'Timing: distinguish exploring from a near-term purchase.', 'Next action: offer a visit or callback only when appropriate.'] },
      { heading: 'A visit request is not a confirmed visit', paragraphs: ['If the agent does not have a working calendar integration, describe the next step as a request. “I will pass your preferred Saturday slot to the team” is more honest than “Your visit is booked.” Confirm the date and contact number, and make it clear who will follow up.', 'Do not invent scarcity, discounts, approval status, or guaranteed returns to make the conversation sound persuasive. Give the agent a current, approved project fact sheet and instructions to defer uncertain claims. The cost of a confident wrong answer is borne by your sales team.'] },
      { heading: 'What the sales team should receive', paragraphs: ['A good handoff reads like a useful colleague’s note: requested size, purpose, budget if shared, questions still open, and the promised next step. Keep a protected transcript or recording available for context; do not make the team listen to the whole call just to find the requirement.', 'During the pilot, review enquiries that looked qualified but did not lead to a useful follow-up. Was the buyer requirement wrong? Was the callback late? Did the agent promise unavailable inventory? These checks are more revealing than counting every completed conversation as a qualified lead.'] },
    ],
  },
  {
    slug: 'ai-voice-agent-pricing-india', title: 'AI voice agent pricing in India: what to include in the cost per useful call',
    excerpt: 'Per-minute prices tell only part of the story. Compare telephony, speech, model usage, failed calls, recordings, and the work your team still needs to do.',
    category: 'Voice AI basics', publishedAt: '2026-10-07', readTime: '', sections: [
      { heading: 'Ask what a quoted minute actually includes', paragraphs: ['Two per-minute quotes are not comparable until you know the billing boundaries. Does the price include the phone connection, speech recognition, speech synthesis, language-model usage, storage, and platform fees? Are unanswered calls or setup time billed? Ask for a worked invoice example based on your expected traffic.', 'Check minimum commitments, concurrency limits, rounding, currency, taxes, and support separately. A low headline rate may still be a good deal, but it should not be compared with an all-in rate as if both cover the same service.'] },
      { heading: 'Use a simple cost worksheet', paragraphs: ['Estimate attempted calls, connected calls, average connected duration, and monthly fixed fees. Add the usage charges included in the contract and any provider charges billed separately. Keep retry traffic and testing traffic visible rather than hiding them inside an optimistic average.', 'For illustration only: if 1,000 connected calls average three minutes, that is 3,000 connected minutes before retries or other charges. At a hypothetical all-in rate of ₹4 per minute, the usage component is ₹12,000. This is arithmetic, not a Vistrow quote or a market price. Replace the assumptions with an actual proposal.'], points: ['Connected minutes × applicable usage rate.', 'Phone numbers, platform minimums, and other fixed fees.', 'Additional storage, model, or integration charges if excluded.', 'Retries, testing, and unsuccessful attempts where billable.', 'Staff review and follow-up time.'] },
      { heading: 'Cheap turns can produce expensive conversations', paragraphs: ['A cheaper model that needs repeated clarification may lengthen calls or collect the wrong details. A more expensive voice can still be worthwhile if callers understand it better, but that should be tested rather than assumed. Compare task completion and field accuracy alongside minutes and cost.', 'Define “useful” before calculating cost per outcome. For a callback flow, it might mean a valid contact, a clear reason, and an agreed next action. Do not label every connected call a success. Divide total operating cost by verified useful outcomes, and report the underlying sample size.'] },
      { heading: 'Run a limited pilot before committing volume', paragraphs: ['Use one campaign or inbound call reason. Track actual duration, abandoned calls, human escalations, and correction work. Ask the vendor to explain discrepancies between your records and the invoice.', 'Provider rates change, so use current written pricing and keep its date with the worksheet. Once the pilot shows reliable outcomes, project a conservative monthly range rather than a single best-case saving.'] },
    ],
  },
  {
    slug: 'write-ai-voice-agent-prompts', title: 'How to write an AI voice agent prompt that works on a real call',
    excerpt: 'Separate facts, conversation rules, and permitted actions. Keep replies speakable, make uncertainty explicit, and test corrections instead of only greetings.',
    category: 'Voice AI basics', publishedAt: '2026-10-07', readTime: '', sections: [
      { heading: 'Write for a listener, not a reader', paragraphs: ['A paragraph that works on a web page can be exhausting over the phone. Ask for short replies, one question at a time, and an answer to the caller’s question before another qualification step. Avoid spoken bullet lists, unexplained acronyms, and a repeated company introduction.', 'Do not confuse a warm voice with a verbose agent. A brief acknowledgement and a relevant question usually sound more attentive than a polished sales monologue. Voice style should support the task: calm for a complaint, clear for a date, and conversational for an exploratory enquiry.'] },
      { heading: 'Separate the prompt into four jobs', paragraphs: ['Give the agent a role and a clear boundary. Supply approved facts separately from instructions about how to talk. Define the information to collect and the actions it is actually able to perform. The prompt cannot create a booking integration that does not exist.', 'For example: “Answer using the approved project facts. If availability is not present, say it needs confirmation. Ask one requirement question at a time. A visit is only confirmed after the booking action succeeds; otherwise record it as a request.” This is an illustrative instruction, not a complete production prompt.'], points: ['Role and scope: who the agent represents and what it handles.', 'Facts: current approved information, with an uncertainty rule.', 'Conversation: concise replies, corrections, and language choice.', 'Actions: tool prerequisites, success checks, and failure wording.'] },
      { heading: 'Use expressive cues carefully', paragraphs: ['Emotion controls and nonverbal tags depend on the speech provider and model. Do not assume a tag supported by one voice works with every voice. If a provider does not support the format, the caller may hear the tag read aloud or the synthesis request may fail.', 'Keep provider-specific formatting outside the business facts. Use a tested adapter to translate supported delivery cues, preserve the selected voice, and strip unsupported markup. Test the actual call path as well as the preview button; a preview can use a different provider or settings from the live agent.'] },
      { heading: 'Test the moments that break a script', paragraphs: ['Try a correction, a question outside the knowledge base, a caller switching language, silence, and a direct request to stop. Include a failed tool action. Check whether the spoken answer matches what was saved.', 'Keep a small regression script and rerun it after changes. If an issue is caused by missing data or a broken tool, fix that system rather than adding another paragraph to the prompt. A longer instruction set can conceal the real fault without making the conversation dependable.'] },
    ],
  },
  {
    slug: 'ai-call-recordings-and-transcripts', title: 'AI call recordings and transcripts: a checklist from capture to CRM playback',
    excerpt: 'A completed transcript does not prove a recording was saved. Trace capture, processing, storage, tenant access, and CRM delivery as separate steps.',
    category: 'CRM & integrations', publishedAt: '2026-10-07', readTime: '', sections: [
      { heading: 'A transcript and a recording are different outputs', paragraphs: ['Speech recognition can produce text even when recording capture was never started. A completed call badge therefore does not prove that an audio file exists. Track recording state explicitly: not requested, starting, recording, processing, ready, or failed.', 'Keep that state attached to the stable call ID. If capture fails, show an actionable status rather than an empty play button. An administrator should be able to distinguish missing capture from a permission problem or a file that is still processing.'] },
      { heading: 'Follow the recording through five checks', paragraphs: ['Start with one affected call. Confirm that recording was requested and that the capture service returned an identifier. Then check its completion event, storage object, and the database association. Finally, test playback from the tenant account that owns the call.', 'Do not inspect only the public demo or your own administrator account. Calls can take different paths depending on their channel, agent, or tenant settings. Compare a working call with a failing call using the same checkpoints.'], points: ['Capture: was recording enabled on this specific session?', 'Processing: did it finish, fail, or remain pending?', 'Storage: does the object exist and contain playable audio?', 'Association: does the media belong to the correct tenant and call?', 'Access: can an authorised ordinary user play it?'] },
      { heading: 'Send media to the CRM when it is ready', paragraphs: ['The final call event and the ready recording event may arrive at different times. Let the CRM save the call and transcript first, then update the same call with its recording reference. Make that update safe to retry without creating another lead.', 'A media reference should respect access controls and retention. If links expire, the integration needs a supported way to obtain fresh access; copying a short-lived URL into a permanent note will eventually break. Do not fix playback by making private customer recordings publicly accessible.'] },
      { heading: 'Make the operational test small and repeatable', paragraphs: ['Use a consenting internal tester and a non-production contact. Complete a browser conversation and a phone conversation if both channels are in scope. Check the saved transcript, audio, duration, tenant ownership, and CRM association. Then repeat a delivery event and confirm there are no duplicates.', 'Agree on retention and deletion rules with the relevant legal and operations reviewers. Verify how deletion affects the call database, storage, and receiving CRM. This guide is an engineering checklist, not legal advice about recording consent.'] },
    ],
  },
]

const IMAGE_ALTS: Record<string, string> = {
  'what-is-an-ai-voice-agent': 'Business owner listening on a phone and taking notes beside a laptop',
  'how-to-choose-a-multilingual-voice-agent': 'Two colleagues testing a spoken conversation with a phone and headphones',
  'voice-ai-latency-how-to-measure-it': 'Engineer comparing audio waveforms with handwritten call timing notes',
  'website-voice-widget-for-lead-generation': 'Visitor viewing a property website with a voice conversation control on a laptop',
  'connecting-voice-calls-to-your-crm': 'Coordinator reviewing a customer pipeline while wearing a headset',
  'when-to-use-voice-ai-instead-of-ivr': 'Customer using a mobile phone beside a desk telephone',
  'ai-voice-agents-for-real-estate-leads': 'Property advisor taking a call beside an architectural housing model',
  'ai-voice-agent-pricing-india': 'Calculator, budget notebook, and phone on a desk for a call cost comparison',
  'write-ai-voice-agent-prompts': 'Operations manager drafting conversation instructions beside a laptop',
  'ai-call-recordings-and-transcripts': 'Laptop showing illustrative audio and transcript panels beside headphones and a padlock',
}

const SOURCES: Record<string, VoiceBlogPost['sources']> = {
  'what-is-an-ai-voice-agent': [{ title: 'LiveKit: voice agent architecture', url: 'https://docs.livekit.io/agents/' }],
  'voice-ai-latency-how-to-measure-it': [{ title: 'LiveKit: turn detection and interruptions', url: 'https://docs.livekit.io/agents/logic/turns/' }],
  'website-voice-widget-for-lead-generation': [{ title: 'MDN: microphone permissions and secure contexts', url: 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia' }],
}

export const VOICE_BLOG_POSTS: VoiceBlogPost[] = [...ORIGINAL_POSTS, ...NEW_POSTS].map((post) => {
  const sections = [...post.sections, ...(EXTRA_SECTIONS[post.slug] ?? [])]
  const words = sections.flatMap(section => [section.heading, ...section.paragraphs, ...(section.points ?? [])]).join(' ').trim().split(/\s+/).length
  return { ...post, sections, readTime: `${Math.max(1, Math.ceil(words / 200))} min read`, updatedAt: '2026-10-07', image: `/blog/${post.slug}.jpg`, imageAlt: IMAGE_ALTS[post.slug], sources: SOURCES[post.slug] ?? [] }
})
