// SEO upgrades for the blog posts published before the daily series (owner request, 21 Oct 2026):
// a keyword-first SEO title, meta description, short answer, FAQs, extra sections and sources.
// voiceBlog.ts merges these into VOICE_BLOG_POSTS.
import type { VoiceBlogPost, VoiceBlogSection } from './voiceBlog'

export interface OlderPostUpgrade {
  seoTitle: string
  metaDescription: string
  shortAnswer: string
  extraSections: VoiceBlogSection[]
  faqs: NonNullable<VoiceBlogPost['faqs']>
  sources: VoiceBlogPost['sources']
  updatedAt: string
}

export const OLDER_POST_UPGRADES: Record<string, OlderPostUpgrade> = {
  "ai-call-recordings-and-transcripts": {
    "seoTitle": "AI Call Recordings and Transcripts: A Practical Checklist",
    "metaDescription": "AI call recordings and transcripts: what India's data protection law expects, how teams should use recordings after a call, and how to test the setup.",
    "shortAnswer": "AI call recordings are the audio of each AI-handled call, usually saved with a transcript, the details the caller gave and the outcome. Treat them as personal data: tell callers the call is recorded, ask for consent, limit who can listen, delete them when no longer needed, and check they reach your CRM.",
    "extraSections": [
      {
        "heading": "What does India's data protection law say about call recordings?",
        "paragraphs": [
          "A call recording and its transcript contain personal data: a voice, a name, a number and whatever the caller chose to share. The Digital Personal Data Protection Act, 2023 says a request for consent must come with a notice describing the personal data and the purpose it will be used for. The Act also lets the person ask to read that notice in English or in any language in the Eighth Schedule to the Constitution.",
          "Under the Act, consent must be free, specific, informed, unconditional and unambiguous, given by a clear affirmative action, and it can be withdrawn at any time. Personal data must be erased when consent is withdrawn or once the purpose is no longer being served, unless another law requires it to be kept. This is a summary, not legal advice. Vistrow Voice helps here with a [spoken consent and recording setting](/help/compliance/consent-recording-retention) that saves the caller's answer on the call."
        ]
      },
      {
        "heading": "How should your team use recordings after the call?",
        "paragraphs": [
          "Recordings are most useful as evidence for improving the agent. Each week, pick a sample of calls, including ones that looked successful, and listen for wrong answers, missed details and moments where callers gave up. Fix the cause in the right place: a missing fact goes into the [knowledge base for approved answers](/product/knowledge-base), and a conversation problem goes into the prompt, as explained in the [guide to writing voice agent prompts](/resources/blog/write-ai-voice-agent-prompts).",
          "Limit listening to people who need it, and do not paste transcripts into group chats or personal email. When a caller disputes what was said, the recording settles it faster than anyone's memory."
        ]
      },
      {
        "heading": "Which recording mistakes should you avoid?",
        "paragraphs": [
          "Teams often switch recording on without changing the greeting, so callers are never told. Others keep recordings forever because nobody set a retention period, or delete the call in one system while the copy in the CRM stays. Some rely on the transcript alone, which can mishear a name or a number that the audio would have settled.",
          "Check each of these on a test call before launch, then again after any change to the agent or the integration. The [data protection overview on our security page](/security) explains how call data is stored and protected."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Is it legal to record AI calls in India?",
        "a": "Recording is not banned, but recordings and transcripts are personal data. The Digital Personal Data Protection Act, 2023 expects a clear notice of what is collected and why, and consent that the caller can withdraw. Sector rules may add their own requirements, so confirm your wording and retention with your legal adviser."
      },
      {
        "q": "Do callers need to be told they are speaking to an AI and being recorded?",
        "a": "It is good practice to tell them both at the start. In Vistrow Voice, while recording is on, the agent's opening line says the call is recorded and that the caller is speaking with an AI assistant, unless you turn it off or your welcome message already covers it."
      },
      {
        "q": "How long should AI call recordings be kept?",
        "a": "Only as long as you need them for the purpose you told callers about, unless a law requires longer. Pick a retention period in days, write down why, and let the system delete older recordings and transcripts automatically. Remember that copies sent to your CRM may need their own deletion step."
      },
      {
        "q": "Can a caller ask for their recording to be deleted?",
        "a": "Yes. Under the Digital Personal Data Protection Act, 2023, a person can ask for erasure of personal data they consented to, and it must be erased unless it is needed for the stated purpose or required by law. Decide in advance who handles such requests and how the CRM copy is removed."
      },
      {
        "q": "How accurate are AI call transcripts?",
        "a": "Usually good enough to read the flow of a call, but names, numbers, addresses and mixed-language phrases are where errors appear. That is why the recording matters: play the audio when a detail is important, and ask the agent to confirm critical details aloud during the call."
      }
    ],
    "sources": [
      {
        "title": "Government of India: The Digital Personal Data Protection Act, 2023 (Gazette text hosted by TRAI)",
        "url": "https://www.trai.gov.in/sites/default/files/2024-09/DPDT_11082024.pdf"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "ai-voice-agent-pricing-india": {
    "seoTitle": "AI Voice Agent Pricing in India: What a Useful Call Costs",
    "metaDescription": "AI voice agent pricing in India explained: the cost parts behind every call, what pushes a call's cost up or down, and the mistakes that break a budget.",
    "shortAnswer": "AI voice agent pricing in India is usually quoted per minute or in credits, but the real cost of a call combines speech recognition, the language model, the voice, telephony, phone numbers, storage and your team's follow-up time. Compare vendors on the cost of one useful call, using your own call length and outcomes.",
    "extraSections": [
      {
        "heading": "Which parts of a voice agent cost money?",
        "paragraphs": [
          "Every turn of a call uses three services: speech recognition to hear the caller, a language model to decide the reply, and speech synthesis to speak it. A vendor may bundle all three into one rate or bill them separately. Phone calls also need a telephony connection, often a SIP trunk from a telephony provider. SIP is the IETF standard protocol for setting up and ending internet calls, and the trunk may be billed apart from the agent itself.",
          "Around the call sit smaller costs that are easy to miss: phone number rental, recording storage, CRM integrations, setup or support fees, and taxes. Then there is your own team's time to review transcripts and follow up leads. The [voice AI platform overview](/voice-ai-platform) shows which of these parts come with a finished product and which you would otherwise assemble yourself."
        ]
      },
      {
        "heading": "What makes one call cost more than another?",
        "paragraphs": [
          "Length is the biggest driver, and length is partly in your control. A prompt that produces long answers, repeats the company introduction or asks one question too many adds billed seconds to every call. So does an agent that waits a long time on a silent line before ending the call.",
          "Vistrow Voice lets you set a maximum call duration and choose what the agent does when a caller goes silent, as described in [call settings and functions](/help/agents/agent-functions-and-transfer). Voice and model choice also change the rate: a more expressive voice or a larger model can cost more per minute, so use it where callers clearly benefit and keep a standard option for simple calls."
        ],
        "points": [
          "Average connected call length.",
          "Reply length and number of questions.",
          "Silence handling and maximum call duration.",
          "Voice tier and model tier.",
          "Unanswered attempts and retries on outbound."
        ]
      },
      {
        "heading": "Which budgeting mistakes should you avoid?",
        "paragraphs": [
          "The first mistake is comparing per-minute rates alone, without checking what each one includes. The second is ignoring outbound attempts that never connect, and the retries they trigger. The third is choosing the premium voice by default before testing whether callers understand the standard one just as well.",
          "The fourth is forgetting people. If every lead still needs a manual callback because the agent saved the wrong details, the cost has moved rather than fallen. The [AI voice bot pricing checklist](/ai-voice-bot-pricing-india) gives you a list to run against any quote."
        ]
      }
    ],
    "faqs": [
      {
        "q": "How is AI voice agent pricing calculated in India?",
        "a": "Most vendors charge for call minutes, either as a per-minute rate or as credits drawn from a monthly plan. The rate often depends on the voice and model you choose and on the channel. Telephony, phone numbers, setup and taxes may be billed separately, so ask for a written example based on your own traffic."
      },
      {
        "q": "Are telephony charges included in a voice agent price?",
        "a": "Not always. Some vendors include the phone connection, while others expect you to bring your own telephony provider and number, which is billed separately. Ask which side pays for the phone minutes, number rental and any channel or concurrency add-ons before comparing quotes."
      },
      {
        "q": "Do unanswered or failed calls cost money?",
        "a": "It depends on the contract. Some vendors bill only connected minutes, while others bill ring time, setup or each attempt. On outbound campaigns, unanswered calls and retries can be a large share of attempts, so ask how they are billed and include them in your estimate."
      },
      {
        "q": "Is an AI voice agent cheaper than a human telecaller?",
        "a": "It can be for frequent, repeatable calls such as first responses and follow-ups, but the honest comparison is cost per useful outcome, not cost per minute. Include the review and correction work your team still does. Run a short pilot and compare verified outcomes before you decide."
      },
      {
        "q": "Where can I see current Vistrow Voice plans?",
        "a": "Current plans are on the [Vistrow Voice pricing page](/pricing). Credits per minute depend on the channel, voice tier and model tier, and each call's details show the credits it used, so you can check a pilot's real cost against your estimate."
      }
    ],
    "sources": [
      {
        "title": "IETF RFC 3261: SIP, Session Initiation Protocol",
        "url": "https://www.rfc-editor.org/rfc/rfc3261"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "ai-voice-agents-for-real-estate-leads": {
    "seoTitle": "AI Voice Agent for Real Estate: Qualify Leads, Book Visits",
    "metaDescription": "How an AI voice agent for real estate answers property enquiries, qualifies buyers, requests site visits and hands clean leads to your sales team.",
    "shortAnswer": "An AI voice agent for real estate answers property enquiries and calls new leads back, in the buyer's language. It answers approved project questions first, then collects budget, location, configuration, purpose and timeline. It can request or book a site visit and send the advisor a clear summary with the recording and transcript.",
    "extraSections": [
      {
        "heading": "What should a real estate voice agent never say?",
        "paragraphs": [
          "Property calls carry claims that a buyer may later rely on: possession dates, approvals, carpet area, payment plans and the project's registration. Give the agent each of these only from an approved fact sheet, and tell it to defer anything else to the sales team. Under the RERA Act, promoters must mention the project's registration number on their website and in advertisements, so the number the agent reads out should be the one in your approved material, never a guess.",
          "Strict mode on the knowledge base makes the agent quote your approved answers and say it will check with the team when something is not covered. For listings that change often, a [live catalog of listings](/help/knowledge-base/live-catalog) lets the agent look up current details instead of reading an old brochure."
        ],
        "points": [
          "No guaranteed returns or price rises.",
          "No invented discounts, scarcity or approval status.",
          "No possession date that is not in the approved sheet.",
          "No confirmed visit unless the booking succeeded."
        ]
      },
      {
        "heading": "How fast should the agent call back a new property lead?",
        "paragraphs": [
          "A lead from an ad or a portal is most useful while the buyer still remembers the enquiry. If your CRM or lead form can post the lead to a webhook, [instant lead follow-up for new enquiries](/help/integrations/instant-lead-follow-up) queues a call as soon as the lead arrives. Vistrow Voice can check every outbound dial against your Do-Not-Call list and calling window before it goes out, so a fast callback does not become an unwanted one.",
          "Open the callback with the context the buyer gave: the project name and what they asked about. A buyer who hears their own enquiry repeated back is far more likely to keep talking than one who hears a generic sales pitch."
        ]
      },
      {
        "heading": "How do you judge whether the pilot is working?",
        "paragraphs": [
          "Count outcomes your sales team trusts, not completed calls. Each week, compare site visits requested by the agent with visits that actually happened, and ask advisors which leads arrived with the wrong budget, locality or configuration. Listen to a few calls where the buyer hung up early; the cause is usually a missing fact or one question too many.",
          "A [Hindi real estate lead qualification transcript](/demo-calls/hindi-real-estate-lead-qualification) shows what a clean record looks like. Open your own calls in [Calls history with filters](/help/calls/find-a-call) and check the saved fields against what the buyer actually said."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can an AI voice agent book site visits for a property project?",
        "a": "Yes, if it is connected to a calendar with your bookable hours. The agent offers real free slots, confirms the date and contact number, and the visit appears in your appointments list. Without a working calendar, it should describe the visit as a request and tell the buyer who will confirm it."
      },
      {
        "q": "Can an AI agent call leads from ads and property portals?",
        "a": "Yes, if your CRM or lead form can send each new lead to a webhook. The lead is queued for a call within moments of arriving, and the agent opens with the project and question the buyer submitted. Outbound calls should still follow your Do-Not-Call list and permitted calling hours."
      },
      {
        "q": "Which languages can a real estate voice agent speak?",
        "a": "Vistrow Voice agents speak more than 130 languages, including Hindi, English and 9 other Indian languages, and can follow a buyer who switches between them mid-call. Test the language your buyers actually use, with real locality names, budgets in lakhs and crores, and project names, before you go live."
      },
      {
        "q": "Can the agent answer price questions?",
        "a": "It can share an approved price range or starting figure if you give it one, and explain what changes the final price. It should not invent a quote or a discount. If pricing changes often, keep it in a live catalog or tell the agent to pass price questions to the sales team."
      },
      {
        "q": "Will an AI voice agent replace my sales team?",
        "a": "No. It handles the first conversation: answering, qualifying and requesting the visit. Advisors still do the negotiation, the site visit and the relationship. The benefit is that every enquiry gets a prompt answer, and advisors start their callback with the buyer's requirement already written down."
      }
    ],
    "sources": [
      {
        "title": "Andhra Pradesh Real Estate Regulatory Authority: provisions of the RERA Act on advertisements",
        "url": "https://rera.ap.gov.in/RERA/Views/AdvertisementGuidelines.aspx"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "connecting-voice-calls-to-your-crm": {
    "seoTitle": "Voice Call CRM Integration: Send Every Call to Your CRM",
    "metaDescription": "A voice call CRM integration should deliver the summary, fields, recording and next step once per call. How to map it, test it and fix missing leads.",
    "shortAnswer": "A voice call CRM integration sends each finished call to your CRM as one record: who called, what they wanted, the answers they gave, a summary, the recording and the next step. Map fields before launch, use the call ID to prevent duplicates, and test failed deliveries as well as successful ones from the account your team uses.",
    "extraSections": [
      {
        "heading": "How do you map call details to CRM fields?",
        "paragraphs": [
          "Start from the CRM form your team already fills in. Each field the salesperson needs should come from one named value captured on the call, such as budget, location or preferred callback time. Define those values as [post-call data extraction fields](/help/agents/agent-functions-and-transfer) with the same names your CRM uses.",
          "Keep the format consistent. Store phone numbers in full international format, as explained in [how phone numbers are read](/help/contacts/phone-number-format), dates in one format, and yes or no answers as yes or no rather than free text. Leave a field empty when the caller did not give the detail; a guessed value looks real in a CRM and is hard to spot later."
        ]
      },
      {
        "heading": "Why do duplicate or missing leads happen, and how do you fix them?",
        "paragraphs": [
          "Duplicates usually come from retries. The HTTP standard, RFC 9110, notes that a POST request is not idempotent: sending it twice can create two records, so a client should not retry it automatically unless it knows the repeat is safe. That is why the receiver should check the call ID before creating anything. Also check for a second route, such as an automation tool that copies records.",
          "Missing leads usually trace to routing or rejection. Vistrow Voice lets you limit each agent to chosen integrations under CRM routing, so an agent restricted to one CRM will not send leads to another; [webhook, CRM routing and memory](/help/agents/agent-webhook-crm-memory) explains the setting. If routing is right, open the call and read its delivery status: an expired credential or a required CRM field left empty will show there, and the call can be re-sent once fixed."
        ]
      },
      {
        "heading": "What should happen to call data after it reaches the CRM?",
        "paragraphs": [
          "Once a lead is copied, the CRM becomes a second home for the caller's personal data. Section 8(7) of India's Digital Personal Data Protection Act, 2023 asks the business to erase personal data when consent is withdrawn or the purpose is no longer served, unless a law requires it to be kept, and to make its processors erase their copies too.",
          "In practice, set the retention period on the calling side, described in [consent, recording and data retention](/help/compliance/consent-recording-retention), and write down how a deletion request reaches the CRM record and any sheet or alert channel the lead was sent to. This is practical guidance, not legal advice; confirm your obligations with whoever handles compliance."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is voice call CRM integration?",
        "a": "It is the link that turns a phone or website call into a CRM record without anyone typing notes. When the call ends, the caller's details, the answers they gave, a summary, the outcome and a link to the recording are sent to the CRM, so the person following up has the full context."
      },
      {
        "q": "Do I need a developer to connect voice calls to a CRM?",
        "a": "Not for a supported CRM: you connect it from the integrations page and send a test. For any other system, a webhook posts each lead as JSON to a URL you provide, which an automation tool can map into your CRM without code. A developer helps when you need custom matching or deduplication rules."
      },
      {
        "q": "Can the call recording be saved in the CRM?",
        "a": "Usually the CRM stores a reference to the recording rather than the audio file. Check that the link plays from an ordinary user account, that it respects access control, and what happens when it expires. The recording can be ready a little after the call record, so the CRM should accept it as a later update."
      },
      {
        "q": "How quickly does a call reach the CRM?",
        "a": "Connected integrations receive each qualified lead as the call finishes, so it normally appears within moments. If it does not, open the call in Calls history and check its delivery status before retrying. A failed delivery shows its error there and can be re-sent once the cause is fixed."
      },
      {
        "q": "What if my CRM is not in the integrations list?",
        "a": "Use the webhook. Every lead is posted as JSON to the URL you choose, either for the whole workspace or for a single agent, and your CRM, a small script or an automation tool can create the record from it. See the [integrations directory](/integrations) for the systems that connect directly."
      }
    ],
    "sources": [
      {
        "title": "RFC Editor: RFC 9110, HTTP Semantics, section 9.2.2 Idempotent Methods",
        "url": "https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2"
      },
      {
        "title": "Ministry of Electronics and Information Technology: The Digital Personal Data Protection Act, 2023",
        "url": "https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "how-to-choose-a-multilingual-voice-agent": {
    "seoTitle": "Multilingual AI Voice Agent: How to Choose One for India",
    "metaDescription": "How to choose a multilingual AI voice agent for Indian callers: test Hindi, English and regional languages, code-switching, names and numbers first.",
    "shortAnswer": "Choose a multilingual AI voice agent by testing complete calls in the languages your callers really use, not by counting the languages on a list. Check recognition of local names and numbers, mid-call switching between a regional language, Hindi and English, natural pronunciation, and how the agent recovers from a misunderstanding. Then pilot on one call type.",
    "extraSections": [
      {
        "heading": "Which languages should you pilot first?",
        "paragraphs": [
          "India's Constitution lists 22 languages in its Eighth Schedule, according to a Ministry of Home Affairs statement to the Lok Sabha, and many callers mix one of them with English. You do not need all of them on day one. Ask your front-line staff which languages callers actually use, and start with the top two or three.",
          "Vistrow Voice can answer callers in more than 130 languages, including Hindi, English and 9 other Indian languages. Each Indian language has its own page, and pages such as the [Tamil AI voice agent overview](/languages/tamil) and the [Marathi AI voice agent overview](/languages/marathi) include a sample call in which the caller switches language. Use them to brief the native speakers testing your pilot."
        ]
      },
      {
        "heading": "How do you set up languages on each agent?",
        "paragraphs": [
          "Every agent has a default language, the one it opens in, and it follows the caller if they switch. Keep the welcome message short, so a caller who prefers another language can say so quickly. Settings live on the agent page, described in [creating and editing an agent](/help/agents/create-and-edit-agent).",
          "Decide whether one agent should serve every caller or whether separate agents per language make more sense. One agent is simpler to maintain; separate agents help when the facts, greeting or follow-up team differ by language. On a website, [page rules for the widget](/help/website-widget/page-rules) can send visitors on a Hindi or Tamil page to an agent that opens in that language. Also check the recording and AI announcement: by default it plays in Hindi for Hindi agents and in English for every other language, so write your own wording if your callers expect another one."
        ]
      },
      {
        "heading": "How do you judge a multilingual pilot after launch?",
        "paragraphs": [
          "Review results per language, not as one total: compare how many calls ended with a clear next step, how many were handed to a person, and how often callers had to correct a name, number or date. A language with noticeably more corrections or handoffs needs attention first.",
          "Ask a native speaker to read a sample of transcripts and listen to a few recordings in each language every week. Turn the failures into repeatable scenarios in the [Testing Lab for agent scenarios](/help/testing-lab/run-a-test), which includes a Hindi-English switching situation, and re-run them after every change to the prompt or knowledge base."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is a multilingual AI voice agent?",
        "a": "It is an AI agent that can hold a phone or website conversation in more than one language, understand the caller, and reply in the language they use. A good one also follows a caller who switches language mid-call and handles mixed speech such as Hindi with English words, without restarting the conversation."
      },
      {
        "q": "Can an AI voice agent understand Hinglish?",
        "a": "Yes, a well-tuned agent can understand mixed Hindi and English and reply in the same natural style. Accuracy still varies with accents, names, numbers and background noise, so test it with real phrases your callers use, such as amounts, dates and place names, and check the saved fields as well as the transcript."
      },
      {
        "q": "Which Indian languages does Vistrow Voice support?",
        "a": "Agents speak more than 130 languages, including Hindi, English and 9 other Indian languages: Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia, on phone and website calls. Browse every option on the [languages for voice agents](/languages) page, and test the exact mixes your callers use."
      },
      {
        "q": "Does a multilingual voice agent detect the caller's language automatically?",
        "a": "The agent opens in its default language and follows the caller if they switch, so a caller who answers in Tamil gets a reply in Tamil. Do not guess a caller's language from their name or number, and let them ask to change at any point."
      },
      {
        "q": "Should I use one multilingual agent or separate agents for each language?",
        "a": "Start with one agent if the facts and follow-up team are the same for every caller; it is easier to keep up to date. Use separate agents when the greeting, information or team differs by language or region, or when a website page in one language should open the conversation in that language."
      }
    ],
    "sources": [
      {
        "title": "Press Information Bureau, Ministry of Home Affairs: Languages in the Eighth Schedule",
        "url": "https://www.pib.gov.in/newsite/erelcontent.aspx?relid=5928"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "how-to-choose-an-ivr-service-provider-india": {
    "seoTitle": "IVR Service Provider in India: How to Choose (Checklist)",
    "metaDescription": "Choosing an IVR service provider in India? Use this checklist on numbers, languages, AI, integrations, data handling and pilots, plus setup steps.",
    "shortAnswer": "To choose an IVR service provider in India, start from your own calls: list your numbers, top call reasons, languages and peak simultaneous calls. Then check how calls reach the platform, how callers in each language are handled, what reaches your CRM, how recordings are controlled, and insist on a pilot with real calls before signing.",
    "extraSections": [
      {
        "heading": "What are the setup steps once you have chosen a provider?",
        "paragraphs": [
          "Agree the order of work on day one, because each step depends on the one before it. Vistrow Voice helps teams follow the same sequence for a conversational line, and each step can be checked before the next one starts."
        ],
        "points": [
          "Connect the number first and confirm a test call reaches the platform; [connecting a phone number](/help/phone-numbers/connect-a-number) lists what your telephony provider needs to set.",
          "Set the hours, active days and concurrent-call limit for that number, and decide what callers hear outside them.",
          "Load approved answers, then run the [Testing Lab caller scenarios](/help/testing-lab/run-a-test) such as silence, noise and language switching.",
          "Send one test lead to your CRM or webhook and confirm it arrives with the right fields.",
          "Go live on one line, read transcripts daily for a week, and widen only when results hold."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What does an IVR service provider do?",
        "a": "An IVR service provider supplies the system that answers your business number, plays prompts or runs a conversational agent, and routes or resolves the call. Some also supply the phone numbers and contact-centre features; others connect to a telephony provider you already use."
      },
      {
        "q": "Can I keep my current number when I change IVR provider?",
        "a": "Usually, but check early. Ask whether the number can be connected or ported, what your current carrier must change, and how long that takes. On Vistrow Voice, an existing number from a compatible provider can be connected once the setup is confirmed."
      },
      {
        "q": "Is cloud IVR better than on-premise IVR for a small business?",
        "a": "For most small businesses, yes. Cloud IVR needs no hardware, prompts and call flows change from a web dashboard, and capacity can usually change with the plan. On-premise suits organisations that need full control and already have a telephony team to run it."
      },
      {
        "q": "What should finance companies ask an IVR provider about numbers?",
        "a": "Ask whether the provider can work with the numbers your telecom provider allocates for service calls. A Reserve Bank of India circular of January 2025 tells regulated entities to make transactional and service calls from the 1600xx series and promotional calls from the 140xx series."
      }
    ],
    "sources": [
      {
        "title": "Reserve Bank of India: Prevention of financial frauds perpetrated using voice calls and SMS (RBI/2024-25/105, 17 January 2025)",
        "url": "https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12770"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "ivr-in-banking-and-finance": {
    "seoTitle": "IVR in Banking and Finance: From Menus to Conversation",
    "metaDescription": "IVR in banking: which calls banks, NBFCs and lenders can move to a voice agent, the number series RBI requires, and the guardrails to set first.",
    "shortAnswer": "IVR in banking is the automated phone system that handles balance enquiries, card blocking and statement requests through keypad menus. Conversational voice agents now handle general questions, application status, payment reminders and loan enquiries, while anything that moves money, authenticates a customer or touches OTPs and PINs stays on secure flows or with staff.",
    "extraSections": [
      {
        "heading": "Which phone numbers should banks and lenders call customers from?",
        "paragraphs": [
          "For outbound calls such as payment reminders, the number matters as much as the script. The Reserve Bank of India's circular of 17 January 2025 on preventing frauds through voice calls and SMS tells regulated entities to make transactional and service calls only from the 1600xx numbering series, and promotional calls only from the 140xx series.",
          "Settle the number with your telecom provider and compliance team before you plan a reminder campaign. Vistrow Voice can place outbound calls from a number you connect to the platform, as described in [connecting a phone number](/help/phone-numbers/connect-a-number). Ask your telecom provider to set up the service-call number for outbound use, then connect that number so the agent calls from it. The [outbound calling campaigns overview](/product/outbound) explains retries, pacing and calling windows. Check the circular itself for which entities it covers; this is not legal advice."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is IVR in banking used for?",
        "a": "Banks use IVR for balance and transaction enquiries, card blocking, PIN and statement requests, and for routing callers to phone banking staff. Keypad entry suits these tasks because they need long account or card numbers typed into the bank's own verified systems."
      },
      {
        "q": "Should a caller ever share an OTP or PIN with a bank's voice agent?",
        "a": "No. An AI voice agent should never ask for an OTP, PIN, password or full card number in conversation, and its instructions should say so. Any step that needs those details belongs on the bank's own secure keypad flow or with trained staff."
      },
      {
        "q": "Can an AI voice agent make EMI reminder calls?",
        "a": "Yes. It can remind a borrower of an upcoming due date, record a promised payment date, take a callback request and add the borrower to the Do-Not-Call list if asked. It should not negotiate, threaten or promise waivers; those decisions belong to authorised staff."
      },
      {
        "q": "Can a banking voice agent speak Hindi and regional languages?",
        "a": "Yes. Vistrow Voice agents speak more than 130 languages, including Hindi, English and 9 other Indian languages, and can switch when the borrower does. Test reminder and enquiry calls in each language your customers use, with real names, dates and amounts."
      }
    ],
    "sources": [
      {
        "title": "Reserve Bank of India: Prevention of financial frauds perpetrated using voice calls and SMS (RBI/2024-25/105, 17 January 2025)",
        "url": "https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12770"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "ivr-vs-ai-voice-agent-india": {
    "seoTitle": "IVR vs AI Voice Agent: Which Should Indian Businesses Use?",
    "metaDescription": "IVR vs AI voice agent for Indian businesses: when a keypad menu is enough, when a conversation pays off, and the mistakes to avoid when switching.",
    "shortAnswer": "Use an IVR when callers can name what they want in one or two words and a short menu sorts them quickly. Use an AI voice agent when callers need to explain, ask follow-up questions or switch language. Many Indian businesses run both: a conversational agent for most calls, with a keypad path and a person available.",
    "extraSections": [
      {
        "heading": "What mistakes do businesses make when moving from IVR to an AI voice agent?",
        "paragraphs": [
          "The most common mistake is copying the old menu into the agent's instructions. \"Ask whether the caller wants sales, support or accounts\" just rebuilds the menu with a voice. Describe the outcome you want for each call reason instead.",
          "The second is launching on every line at once. Move one number first; [routing inbound calls to an agent](/help/inbound/route-inbound-calls) shows how to set its hours, days and call limit. The third is thin approved material. Vistrow Voice can answer only from your documents when strict knowledge mode is on, so the [knowledge base for voice agents](/product/knowledge-base) needs your real timings and policies before launch. The fourth is hiding the route to a person."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can an AI voice agent replace an IVR completely?",
        "a": "It can, but most businesses keep a short keypad path for callers who know exactly what they want, and leave account actions in verified flows or with staff. The agent answers most calls, with a person always available."
      },
      {
        "q": "Is an AI voice agent more expensive than an IVR?",
        "a": "Per minute it can be, because the agent listens and replies on every turn. The fairer measure is cost per call that reaches a useful outcome, including staff time a menu still uses. The [guide to cost per useful call](/resources/blog/ai-voice-agent-pricing-india) shows the method."
      },
      {
        "q": "Do callers prefer an AI voice agent or a phone menu?",
        "a": "It depends on the caller and the task. Regular callers who know their option may like a quick keypad choice, while callers whose question does not fit a menu want to explain it once. A pilot's transcripts show how your own callers respond."
      },
      {
        "q": "Can I keep my existing business number when switching to an AI voice agent?",
        "a": "Often, yes. A number from a compatible telephony provider can be connected and routed to the agent once the setup is confirmed, so callers keep dialling the number they know. Ask your provider early, because the phone line often slows a launch."
      }
    ],
    "sources": [],
    "updatedAt": "2026-10-21"
  },
  "voice-ai-latency-how-to-measure-it": {
    "seoTitle": "Voice AI Latency: How to Measure the Pause Callers Hear",
    "metaDescription": "Voice AI latency is the pause between a caller finishing and hearing the reply. How to measure it on real calls, what causes it, and what to fix first.",
    "shortAnswer": "Voice AI latency is the silence between a caller finishing a sentence and hearing the agent start to reply. Measure it from the end of the caller's speech to the first audible word, on the same phone route or browser your callers use, across many turns. Report the median and the slow turns, not the single fastest call.",
    "extraSections": [
      {
        "heading": "How much of the delay comes from the phone network?",
        "paragraphs": [
          "Some of the pause is not the agent at all. ITU-T Recommendation G.114, the telecom standard for one-way transmission time, says most applications are essentially unaffected when mouth-to-ear delay stays below 150 ms, and sets 400 ms as the upper limit for general network planning. That budget covers the network path in one direction only.",
          "An agent's thinking time sits on top of that path in both directions: the caller's audio has to reach the agent, and the reply has to travel back. So a phone call and a browser call to the same agent can feel different even with identical settings. Measure each route separately, including calls answered through your [inbound phone setup](/product/inbound), and do not expect a tuning change in the agent to remove delay that belongs to the network."
        ]
      },
      {
        "heading": "Which agent settings change the pause a caller hears?",
        "paragraphs": [
          "Several ordinary settings affect timing as much as the choice of provider. Vistrow Voice lets you adjust interruption sensitivity and what the agent does when the caller goes silent under Speech settings, which changes how readily the agent stops for a caller and how it handles a pause; [functions, transfer and call limits](/help/agents/agent-functions-and-transfer) describes both. A very sensitive setting can make the agent stop for background noise, and a low one can make it talk over a caller who interrupts, so test both with real speakers.",
          "The voice matters too. Different voices can take different amounts of time to start speaking, so preview and test the one you will really use; the [guide to choosing voices](/help/voices/choose-voices) explains how voices are added. Any tool the agent calls during a turn, such as a web search or a booking check, adds a step before it can answer. Switch off tools the agent does not need, and time tool-backed turns separately."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is a good latency for a voice AI agent?",
        "a": "There is no formal standard for an AI agent's reply time. Judge it by the caller: if people talk over the agent, repeat themselves or ask whether it is still there, the pause is too long for that call. Measure the median and the slower turns on your real channel, and compare configurations with the same script."
      },
      {
        "q": "Why is my voice agent slower on phone calls than in the browser?",
        "a": "The two channels take different network paths. A phone call passes through the telephony network and a connection to the agent, which adds transmission delay that a browser test may not have. Measure both routes separately, keep the same agent settings, and look at the timestamps to see which part of the turn grew."
      },
      {
        "q": "Does the language of the call affect voice AI latency?",
        "a": "It can. Speech recognition and voice generation may take different times in different languages, and a caller switching language mid-call can change the path for that turn. Test each language you plan to support with the same script, and compare the slow turns as well as the median."
      },
      {
        "q": "Does a longer prompt or knowledge base slow the agent down?",
        "a": "It can add time, because the model has more text to read before it answers, and a knowledge lookup is an extra step. The effect depends on the model and setup, so measure it. Keep instructions focused, move facts into the [knowledge base for approved answers](/product/knowledge-base), and re-run your timing test after each change."
      },
      {
        "q": "How many test calls do I need to measure latency fairly?",
        "a": "Enough to see the slow turns, not just the fast ones. Repeat the same script several times on each channel and configuration, keep the failed and interrupted calls in the results, and record which voice, model and tools were active. A single best-case call tells you very little about what callers will hear."
      }
    ],
    "sources": [
      {
        "title": "ITU-T: Recommendation G.114, One-way transmission time",
        "url": "https://www.itu.int/rec/T-REC-G.114"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "website-voice-widget-for-lead-generation": {
    "seoTitle": "Website Voice Widget: Turn Visitors into Qualified Leads",
    "metaDescription": "A website voice widget lets visitors ask questions out loud and leave as qualified leads. How to place it, keep pages fast and judge the results.",
    "shortAnswer": "A website voice widget is a button that lets a visitor talk to an AI agent in the browser, with no phone or app. It answers their questions, collects the details your team needs and saves the conversation as a lead. Start on one high-intent page, keep a typing option, and judge it on qualified enquiries rather than clicks.",
    "extraSections": [
      {
        "heading": "Will a voice widget slow down your website?",
        "paragraphs": [
          "Any third-party script can add work to a page. The web.dev guidance on loading third-party JavaScript explains that scripts can delay a page through extra network requests and heavy main-thread work, and recommends loading non-critical scripts with async or defer and measuring their effect rather than assuming it.",
          "Test your own page with and without the widget. Run a page-speed report on a mobile profile, then use the network panel in your browser's developer tools to block the widget's script and compare. Run each test at least three times, because results vary between loads. Check the [script-tag and WordPress install steps](/help/website-widget/add-widget) and add the widget only to the pages where you want conversations."
        ]
      },
      {
        "heading": "Which placement mistakes stop a widget producing leads?",
        "paragraphs": [
          "The most common problem is a button nobody sees or nobody understands. A launcher hidden behind a cookie banner, a full-screen popup or a chat bubble gets no conversations, so check every page on a real phone. A label such as \"Ask about this project\" tells visitors what they will get; \"Talk to us\" does not. Keep the button large enough to tap: WCAG 2.2 sets a minimum target size of 24 by 24 CSS pixels for its AA level.",
          "Asking for too much before the conversation starts is the other mistake. Vistrow Voice lets you choose, for name, phone number and email, whether the widget asks before starting and whether each one is optional or required; with all three off, the call starts on a single tap. Compare both settings on [property project pages](/solutions/real-estate) or other high-intent pages before deciding."
        ]
      },
      {
        "heading": "Should the widget offer chat as well as voice?",
        "paragraphs": [
          "Often, yes. A visitor in an open office, on a train or without a working microphone may still have a real question. The [website widget product page](/product/widget) describes three modes: a voice call the visitor can also type into, a choice between voice and chat, or text chat only.",
          "Treat typed and spoken conversations as the same funnel. Both should reach the same agent, answer from the same approved facts and save the same lead fields, so your team does not need a second process. Review a week of each in Calls history, filtered by site, and note which questions visitors prefer to type."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is a website voice widget?",
        "a": "It is a button on your website that starts a live voice conversation with an AI agent in the visitor's browser. The agent answers questions about your product or service, collects details such as a name and phone number when appropriate, and saves the transcript and lead for your team to follow up."
      },
      {
        "q": "Do visitors need an app or a phone number to use it?",
        "a": "No. The call runs in the browser using the visitor's microphone, so there is nothing to install and no number to dial. The browser asks for microphone permission first. Visitors who decline or prefer not to speak can type instead if you enable chat."
      },
      {
        "q": "Does a website voice widget work on mobile phones?",
        "a": "Yes, it works in mobile and desktop browsers. Test it on the phones your visitors use, though, because mobile layouts expose problems a desktop check misses: a button covered by a banner, a denied microphone prompt, or a Bluetooth headset that changes the audio route mid-call."
      },
      {
        "q": "Can the widget talk to visitors in Hindi and other Indian languages?",
        "a": "Yes. The agent behind the widget speaks more than 130 languages, including Hindi, English and 9 other Indian languages, and follows a visitor who switches mid-conversation. See the [Hindi AI voice agent overview](/languages/hindi) for an example, and test the languages your visitors actually use."
      },
      {
        "q": "Is a voice widget better than a contact form?",
        "a": "It does a different job. A form suits visitors who want to leave details and wait. A voice widget suits visitors with a question they want answered now. Keep both, and compare qualified enquiries and follow-up quality from each over the same weeks before moving traffic from one to the other."
      }
    ],
    "sources": [
      {
        "title": "web.dev: Load third-party JavaScript",
        "url": "https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript"
      },
      {
        "title": "W3C: Understanding WCAG 2.2 Success Criterion 2.5.8, Target Size (Minimum)",
        "url": "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "what-is-an-ai-voice-agent": {
    "seoTitle": "What Is an AI Voice Agent? A Practical Business Guide",
    "metaDescription": "What is an AI voice agent? How it listens, replies and completes tasks on phone and website calls, what it needs before launch, and how to judge a pilot.",
    "shortAnswer": "An AI voice agent is software that holds a spoken conversation with a caller. It turns speech into text, decides what the caller needs using your approved information, and replies in a natural voice. It can answer questions, collect details, book appointments and hand the call to a person when it should.",
    "extraSections": [
      {
        "heading": "What happens between the caller's words and the agent's reply?",
        "paragraphs": [
          "Each turn runs through the same loop. Speech recognition turns the caller's words into text, a language model decides on the reply, and speech synthesis speaks it. Around that loop sits turn detection: the part that decides when the caller has finished speaking. If it fires too early, the agent talks over people. If it waits too long, the caller hears an awkward silence.",
          "Interruptions matter just as much. When a caller cuts in, a well-built agent stops talking, listens, and keeps only the part of its answer the caller actually heard. Judge an agent on live calls, not a scripted demo. The [voice AI latency testing guide](/resources/blog/voice-ai-latency-how-to-measure-it) explains how to time those pauses yourself."
        ]
      },
      {
        "heading": "What do you need ready before you set one up?",
        "paragraphs": [
          "Most of the work is deciding what the agent should know and do. Vistrow Voice lets you describe your business in plain words, get a draft agent, attach approved answers, and talk to it in the browser before any caller hears it. The [step-by-step get started guide](/help/getting-started/get-started) shows the order of setup."
        ],
        "points": [
          "Approved facts: services, hours, locations and policies, kept in a [knowledge base for approved answers](/product/knowledge-base).",
          "Allowed actions: what the agent may book, collect or promise, and what it must pass to a person.",
          "A channel: a phone number routed to the agent over SIP, the IETF standard for setting up and ending internet calls, or a call button on your website.",
          "An owner: one person who reads transcripts each week and decides what to change."
        ]
      },
      {
        "heading": "Which mistakes make a first voice agent disappoint?",
        "paragraphs": [
          "The most common is scope: asking a new agent to handle every call type at once, so nobody can tell which part is failing. Others are hiding facts inside a long prompt, where they go out of date, and judging the agent in a quiet office instead of on a noisy mobile line.",
          "Start with one call reason, keep facts in one approved source, and test on the channel callers will really use. If you are still choosing a platform, the [AI voice agent buying guide for India](/best-ai-voice-calling-software-india) lists the questions to ask before you sign."
        ]
      }
    ],
    "faqs": [
      {
        "q": "How does an AI voice agent work?",
        "a": "It listens to the caller, converts speech to text, decides on a reply using its instructions and your approved information, and speaks the answer in a synthetic voice. Turn detection decides when the caller has finished, and tools let it book an appointment, save lead details or transfer the call."
      },
      {
        "q": "What is the difference between an AI voice agent and a chatbot?",
        "a": "A chatbot works with typed text in a chat window. A voice agent works with speech, on a phone call or a website call button, so it also has to recognise accents, handle interruptions and know when a caller has stopped talking. Both can use the same approved answers, but a voice agent needs shorter, more spoken replies."
      },
      {
        "q": "Can an AI voice agent make outbound calls?",
        "a": "Yes. Besides answering inbound calls, an agent can call people back, for example a new enquiry from a website form, or run a campaign through a contact list. Outbound calling should respect your Do-Not-Call list and calling hours. The [outbound calling overview](/product/outbound) explains how campaigns and compliance checks work."
      },
      {
        "q": "Will callers know they are talking to an AI?",
        "a": "They should. Open each call with a short sentence saying the caller is speaking with an AI assistant and, if calls are recorded, that the call is recorded. Always offer a person when the caller asks for one."
      },
      {
        "q": "Can an AI voice agent transfer a call to a person?",
        "a": "Yes, when a transfer number is set. The agent can dial a colleague into the call and stay on until they answer, so the caller is not left in silence. Decide in advance which requests always go to a person, such as complaints, sensitive questions or anything the agent cannot verify."
      }
    ],
    "sources": [
      {
        "title": "IETF RFC 3261: SIP, Session Initiation Protocol",
        "url": "https://www.rfc-editor.org/rfc/rfc3261"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "what-is-ivr-interactive-voice-response": {
    "seoTitle": "What is IVR? Interactive Voice Response Explained",
    "metaDescription": "What is IVR? Interactive voice response explained: how keypad menus route calls, the types of IVR system, and where an AI voice agent fits.",
    "shortAnswer": "IVR, or interactive voice response, is a phone system that answers calls with recorded prompts and lets callers press keys or say short words to get information or reach the right team. A conversational AI IVR keeps the same job but lets callers explain their need in their own words instead of choosing from a menu.",
    "extraSections": [
      {
        "heading": "How do you check whether your IVR is working for callers?",
        "paragraphs": [
          "Most IVR systems record the keys each caller pressed. Read one normal week of those records and look for three patterns: callers who hang up in the main menu, callers who press the person option straight away, and calls transferred again after reaching a team. Each points to a menu option that does not match how people describe their problem.",
          "Then call your own number from an ordinary mobile and time how long a useful answer takes. Vistrow Voice lets you rehearse difficult callers, such as a silent caller or someone switching between Hindi and English, with the [Testing Lab caller scenarios](/help/testing-lab/run-a-test) before any real caller hears the agent."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is an example of IVR?",
        "a": "A bank line that says \"press 1 for card services, press 2 for loans\" is a typical IVR. So is a courier line that asks for a tracking number and reads out the delivery status without a person joining the call."
      },
      {
        "q": "What is the difference between IVR and a call centre?",
        "a": "An IVR is software that answers and sorts calls automatically. A call centre is the team of people who speak to callers. Usually they work together: the IVR greets the caller, collects a choice and passes the call to a free person in the right team."
      },
      {
        "q": "Why does IVR use keypad tones?",
        "a": "Each key on a phone sends a pair of tones, known as DTMF, that the IVR can recognise reliably, even on a noisy line. The tones follow an international standard, ITU-T Recommendation Q.23, which is why the same menu works from almost any phone."
      },
      {
        "q": "Is an AI IVR the same as an AI voice agent?",
        "a": "Mostly, yes. An AI IVR is an AI voice agent placed where the phone menu used to be. It answers the business number, understands what the caller says, and then answers, books, takes a callback request or transfers the call, instead of asking the caller to press a key."
      }
    ],
    "sources": [
      {
        "title": "ITU-T: Recommendation Q.23, Technical features of push-button telephone sets",
        "url": "https://www.itu.int/rec/T-REC-Q.23/en"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "when-to-use-voice-ai-instead-of-ivr": {
    "seoTitle": "AI Voice Agent or IVR? How to Choose for Your Calls",
    "metaDescription": "AI voice agent or IVR? See which calls suit a keypad menu, which need a conversation, and how to test a hybrid flow on the number you already have.",
    "shortAnswer": "Choose IVR when callers only need to pick from a few stable options, such as a department or a language. Choose an AI voice agent when callers need to explain their request in their own words, or when you need details before routing. Many businesses use both: a short menu, then a focused agent with a human fallback.",
    "extraSections": [
      {
        "heading": "What does a hybrid IVR and voice agent flow look like?",
        "paragraphs": [
          "Menus and speech are not new rivals. The W3C VoiceXML 2.0 Recommendation, published in 2004, already described phone dialogs that accept both spoken words and keypad tones. The real change is that an agent can now hold an open conversation instead of matching a few expected phrases.",
          "A practical hybrid keeps the menu for the one or two choices callers make without thinking, such as language or existing customer versus new enquiry, and sends each branch to an agent with its own greeting. The agent then asks what the caller needs, answers from approved facts, and passes a summary to a person when the request is outside its scope. The [inbound calls product page](/product/inbound) shows how a number is answered by an agent with hours and call limits."
        ]
      },
      {
        "heading": "Which mistakes make a voice agent worse than the menu it replaced?",
        "paragraphs": [
          "Most failed switches share a few causes. None of them is about the technology being too weak; they come from treating the agent as a menu with a nicer voice. Vistrow Voice lets you set a transfer number on each agent, so it can dial a colleague into the call and stay on until they answer, as described in [functions, transfer and call limits](/help/agents/agent-functions-and-transfer)."
        ],
        "points": [
          "A long opening speech before the caller can say anything.",
          "No route to a person, or one that only appears after several failed turns.",
          "Letting the agent change accounts or take payment details it cannot verify.",
          "Removing the keypad option for callers who prefer it or find speech input hard.",
          "Hiding from callers that they are speaking with an AI assistant."
        ]
      },
      {
        "heading": "How do you know the switch from IVR actually worked?",
        "paragraphs": [
          "Compare the same weeks of traffic before and after, on the same number. Look at how many callers reached a useful destination, how many hung up early, how many called back about the same thing within a few days, and how many transfers arrived with a summary the person could use.",
          "Then read the calls themselves. Open a sample of short calls and transfers in [Calls history with transcripts and recordings](/help/calls/find-a-call), and note where callers repeated themselves or asked for a person. Replay the difficult moments as scenarios in the [Testing Lab for agent scenarios](/help/testing-lab/run-a-test) before changing the live flow."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Is an AI voice agent better than IVR?",
        "a": "Not for every call. IVR is faster and more predictable when callers only need to choose a department or language. An AI voice agent is better when callers need to explain a problem, ask a question or give details before being routed. Decide from your own call reasons, and test both on real scripts before replacing a working menu."
      },
      {
        "q": "Can an AI voice agent replace IVR completely?",
        "a": "It can, but it does not have to. Many teams keep a short keypad step for language or caller type and put an agent behind each branch. A full replacement makes sense when most calls need a conversation and the agent has a clear transfer route for complaints and requests it cannot verify."
      },
      {
        "q": "Can IVR and an AI voice agent work together on one number?",
        "a": "Yes. A common pattern is a short menu followed by a focused voice agent for each option, or an agent that answers only the after-hours window while the menu handles the rest of the day. Keep the existing route available during the pilot so you can compare results on the same traffic."
      },
      {
        "q": "Should callers be told they are speaking to an AI voice agent?",
        "a": "Yes. Say it in the first line, in the caller's language, along with whether the call is recorded. It costs one sentence and avoids the moment a caller realises it alone. Offer a person on request, and agree the exact wording with whoever handles compliance for your business."
      },
      {
        "q": "Is a voice agent harder to set up than an IVR?",
        "a": "The setup is different rather than harder. An IVR needs a menu tree and recorded prompts. A voice agent needs approved facts, instructions on what it may do, a transfer number and test calls covering silence, corrections and requests for a person. The ongoing work is reading transcripts and fixing gaps as they appear."
      }
    ],
    "sources": [
      {
        "title": "W3C: Voice Extensible Markup Language (VoiceXML) Version 2.0",
        "url": "https://www.w3.org/TR/voicexml20/"
      }
    ],
    "updatedAt": "2026-10-21"
  },
  "write-ai-voice-agent-prompts": {
    "seoTitle": "AI Voice Agent Prompt: How to Write One That Works",
    "metaDescription": "How to write an AI voice agent prompt for real calls: the sections to include, how to handle names and numbers, common mistakes and how to test changes.",
    "shortAnswer": "A good AI voice agent prompt sets the agent's role and goal, its tone, the actions it may take, how the conversation should flow and when to hand over to a person. Keep facts in a knowledge base, keep replies short and speakable, and test every change on the same set of difficult calls.",
    "extraSections": [
      {
        "heading": "How should a prompt handle names, numbers and pronunciation?",
        "paragraphs": [
          "Callers judge an agent by the small details: their own name, your brand, a street, a date or a phone number. Add a short pronunciation section for words the voice gets wrong, written the way they sound. The W3C speech synthesis standard, SSML, has a phoneme element for the same job, but not every voice supports it, so a plain spelling in the prompt is the safer start. Ask the agent to read phone numbers and booking codes back in small groups of digits and to confirm them before saving.",
          "If the agent should stay in one language unless the caller switches, say so plainly. In Hindi and several other Indian languages, verbs change with the speaker's gender, so the phrasing in your sample lines must match the voice you chose. The [Hindi AI voice agent overview](/languages/hindi) covers what to listen for in Hindi and Hinglish calls."
        ]
      },
      {
        "heading": "Which prompt mistakes cause the most bad calls?",
        "paragraphs": [
          "One example greeting in the prompt often becomes the exact greeting on every call. Give two or three variations, or ask the agent to vary its wording. Contradictory rules are the next problem: \"always collect the budget\" and \"never push the caller\" need an order of priority.",
          "Write escalation rules as plain sentences, such as \"if the caller asks twice for a person, offer a transfer\", rather than code-like logic. And never ask the prompt to do what the agent has no tool for. Vistrow Voice can book appointments, request callbacks, capture lead details and transfer calls, as listed on the [voice agents product page](/product/agents); anything else should be described as a request for the team."
        ],
        "points": [
          "One sample line copied into every call.",
          "Rules that conflict with no priority.",
          "Prices or timings typed into the prompt.",
          "Promises the agent cannot carry out."
        ]
      },
      {
        "heading": "How do you know a prompt change made things better?",
        "paragraphs": [
          "Change one thing at a time and keep a short change log with the date and the reason. Re-run the same saved scenarios after every edit, then read a week of real transcripts before declaring the change a success. Changes apply from the next call, so a bad edit reaches callers fast.",
          "Judge results by outcomes: fewer repeated questions, correct saved fields, fewer callers asking for a person, and shorter calls for the same task. Start with a [quick browser test of the agent](/help/testing-lab/quick-browser-test) and then find the matching calls in [Calls history with filters](/help/calls/find-a-call)."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is a system prompt for a voice agent?",
        "a": "It is the written instruction set the agent follows on every call: who it represents, what it is trying to achieve, how it should speak, what it may do and when it must hand over. Facts such as prices and timings work better in a knowledge base, which the agent reads alongside the prompt."
      },
      {
        "q": "How long should an AI voice agent prompt be?",
        "a": "As short as it can be while covering role, tone, actions, flow and escalation. Every extra paragraph is another rule the model has to weigh on each turn, and long prompts often hide contradictions. Move facts to the knowledge base and delete any rule that no test call ever needed."
      },
      {
        "q": "How do I make a voice agent sound less robotic?",
        "a": "Ask for short replies with one question at a time, give a few varied sample phrases instead of one fixed line, and avoid spoken lists. Let the agent acknowledge what the caller said before moving on. Then listen to real calls, because a reply that reads well can still sound stiff aloud."
      },
      {
        "q": "How do I stop the agent from making things up?",
        "a": "Give it approved facts in a knowledge base, turn on strict mode so it quotes those answers, and add a clear rule for what to say when something is not covered, such as offering a callback. Test with questions you know are missing and check that it admits it does not know."
      },
      {
        "q": "Should the prompt be in English or in the caller's language?",
        "a": "Instructions can usually be written in English even when the agent speaks Hindi or another language, but write sample phrases and the greeting in the language callers will hear. Test each language separately, listening for grammar, gender agreement and how names and numbers are spoken."
      }
    ],
    "sources": [
      {
        "title": "W3C: Speech Synthesis Markup Language (SSML) Version 1.1",
        "url": "https://www.w3.org/TR/speech-synthesis11/"
      }
    ],
    "updatedAt": "2026-10-21"
  }
}
