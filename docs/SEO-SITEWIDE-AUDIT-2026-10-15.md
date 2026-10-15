# Site-wide SEO content audit — 2026-10-15

**Scope:** every indexable route in `web-demo/dist/sitemap.xml` (124 routes, built from the SEO registry `web-demo/src/lib/seoPages.ts`). Branch `claude/seo-p8-sitewide`, started from `claude/seo-p7` and rebased onto `main` after PR #106 and PR #109 merged. The "after" numbers were measured on the rebased build.

**Owner request:** every page should have good, correct information, a good amount of words and internal linking.

## How it was measured

`web-demo/scripts/audit-seo-content.py` (new, Python + lxml) reads the prerendered `dist/**/index.html` after `npm run build`:

- **Words:** text inside `<main>` only. Header, footer and the "Explore related" box are outside `<main>` and excluded. Any `<main>` block whose exact text appears on 4+ pages (CTA bands, shared FAQ, shared product strips) is removed as boilerplate before counting.
- **Contextual inbound/outbound:** distinct registered routes linked from a page's main content, plus the page-specific "Explore related / Set-up guides" box (`SeoRelatedLinks`). Site navigation and footer are never counted. The table shows body/related split for inbound.
- **Fact flags:** regex over the main text, title, description and JSON-LD for language counts, WhatsApp/Facebook Lead Ads, Google Calendar, prices/credits, "best/#1", stale model names and scale claims. Every hit was then checked by hand. Source files were also grepped directly, because accordions and alternate states are not always in the prerendered text.
- **Targets:** landing, product, solution, language and compare pages at least ~700 words; blog articles at least ~900. Help, legal, contact, careers, changelog and demo transcripts are lighter, so they have no word floor. Every page needs at least 3 contextual inbound and 3 contextual outbound links.

Re-run it with `npm --prefix web-demo run build && python3 web-demo/scripts/audit-seo-content.py`.

## Facts checked against the code

| Claim | What the code says | Source |
|---|---|---|
| Languages | Customer agents support 11: Hindi, English, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, Odia. The larger Gemini lists (99 Live, 132/103 TTS) are owner-only: `gemini-live*` models are in `ADMIN_ONLY_MODELS`, and the server refuses them for tenants. | `web-demo/src/lib/agentOptions.ts` `LANGUAGES`, `MODEL_OPTIONS`, `ADMIN_ONLY_MODELS` |
| Model | The tenant picker offers only Vistrow Bharat (`sarvam/sarvam-105b-conversations`). No public page names GPT-4 or another retired model. | `agentOptions.ts` |
| Pricing | Starter / Growth / Scale cost ₹2,999 / ₹5,999 / ₹12,999 and include 300 / 1,000 / 2,500 credits. Bharat with a Standard or HD voice uses 2 credits/min, and a Native ("lite") voice 1 credit/min. Plan concurrency limits are 5 / 15 / 30 and are enforced by `calls_db.concurrent_call_limit`. | `web-demo/src/lib/plans.ts`, `server/voice_catalog.py` `TIER_META`, `server/calls_db.py` |
| Transfer | Phone calls only. `transfer_call` refuses web calls, and the widget takes a callback request instead. | help article "Functions, transfer and call limits"; existing page comments citing `agent/tools.py` |
| WhatsApp / Facebook Lead Ads | Not offered for new connections. | `web-demo/src/components/IntegrationBits.tsx` |
| Google Calendar | Not an integration; bookings use the built-in Appointments calendar. | `marketingContent.ts` integrations FAQ, Privacy page |
| Order status (e-commerce) | No built-in order-system connector. A store needs an operator-defined custom function (`agent/tools.py build_custom_function_tools`). | `agent/tools.py`, `AgentDetail.tsx` CustomFunctionsEditor |
| Demo call cap | 5 free browser demo calls. | `web-demo/src/lib/demoCallCap.ts` |

## Fact corrections made

1. **"99 languages" and "88 more worldwide" removed site-wide.** Each was replaced with the customer-facing claim: Hindi, English and 9 more Indian languages, 11 in total. Places fixed:
   - Home: hero text, two FAQ answers, the language card heading, the `+88 more` and global-greeting chips, and the "99 languages, one agent" card.
   - Hero stats: `HERO_STATS` 99 → 11.
   - The demo CTA chip in `MarketingBits`.
   - The Voice Agents feature card in `marketingContent.ts`.
   - The home meta description and image alt (`seoPages.ts`).
   - `/languages`: title, description, hero and the "And 87 more, on the same agent" chip section. That section is now "How language works on an agent", with a one-line note that the live demo's extra languages are in testing and not available on customer agents.
   - The demo language picker group, renamed "Other languages (demo only, in testing)".
   - The `/compare/knowlarity` row that claimed "global-language voice options".
   - The `/languages` OG image alt ("global language scripts").
2. **`/languages` title changed** from "Multilingual AI Voice Agents in 99 Languages" to "AI Voice Agents in Hindi, English + 9 Indian Languages". The rule is to keep the titles of ranking pages, but this title was factually wrong. The H1 is unchanged.
3. **Pricing FAQ** said "an Economy voice uses 0.5×". It now says a Vistrow Native voice uses 1 credit a minute, matching the owner's 2026-10-14 pricing. The pricing page also has a new "How far a month of credits goes" table, computed from `PLANS` (credits ÷ 2 and ÷ 1), so it cannot drift from `plans.ts`.
4. **`/ai-voice-bot-pricing-india` title** promised a "Calculator" that the page does not have. It now reads "Cost Factors and Estimates".
5. **E-commerce solution** claimed Artha answers order status "from your order data" and handles returns "without a human agent". It now says order status needs your order system connected through a custom function, that refunds and replacements stay with the team, and that follow-up goes out by webhook. The old copy implied a messaging channel.
6. **Human handoff** without a channel qualifier on the `/product/agents` feature card, the `/resources/docs` "Hand off to a human" card and the `/voice-bot` "It acts" card. All three now say phone calls only, with a callback on web calls.
7. **Overclaims softened:**
   - "the agent never makes things up" → "says it does not know instead of improvising"
   - "Artha learns your business logic instantly"
   - "Artha picks up every time" (real estate pain card) → "within the call limits you set"
   - About: "No hallucinations", "100% calls logged", "11 Indian languages" (English is one of the 11), "scales from a single clinic to an enterprise call centre", "no enquiry ... is ever missed again"
   - Home FAQ: "Most teams are live in under an hour" (an unmeasured stat)
   - Real estate solution card: "in any language"

Checked and left as they are: the `₹1 crore` sample budgets (labelled samples), the blog's `₹4/min` hypothetical (labelled "arithmetic, not a Vistrow quote"), "the best time to call" and "the best choice may be" (not self-claims), the plan concurrency figures on `/pricing` (enforced in code), and the Google Calendar mentions (all state that there is no such integration).

## Thin pages fixed

All content added is page-specific. Nothing was padded with templated filler.

- **Five local real-estate pages** (Hindi, Marathi, Kannada, Telugu, Gujarati): each gets three new blocks.
  - A market paragraph on how buyers in that region call: language mix, localities, and local terms such as khata, square-yard plots, tenement and row house.
  - Three market-specific set-up notes.
  - A labelled written sample exchange in the native script, with a gloss.

  The template also gained a four-step "From brochure to live calls" section, links to the matching demo transcript, and links to the sibling city pages.
- **`/solutions`:** an industry-by-industry "first call to hand to an agent" section and a "one platform underneath" section.
- **`/solutions/ecommerce`:** a "Connect it to your store" guide section (knowledge base, live catalog, custom function, helpdesk webhook, widget, languages).
- **`/pricing`:** the credit table plus three estimating notes.
- **`/ai-voice-bot-pricing-india`:**
  - two new sections (phone vs widget costs; voice and model tiers)
  - a 10-point cost checklist
  - a five-step budget estimate
  - related links and two new FAQs
- **`/languages`:** six cards on how language works on an agent, plus next-step links.
- **10 blog articles:** one new practical section each, tied to the product with links to the relevant help guides, compare pages and demo transcripts. Five also gained short checklists.
- **`/about`** (company page, not a target, but it was 140 words with weak claims): a "Who we are" section.

## Internal linking

- **`SeoRelatedLinks`:**
  - company and legal pages now link to each other and to the product;
  - compare pages link to their next two sibling comparisons;
  - demo transcripts link to the next transcript;
  - language pages link to the same-language demo transcript and local real-estate guide;
  - a new "Set-up guides" row links product, landing and company pages to the help articles a reader would open next.

  The Privacy page file was not touched; its related links come from the shared layout.
- **Body links added:** `/vs-ivr` "Further reading" (4 IVR articles, inbound routing, AI receptionist); careers → about and changelog; about → product, languages, vs-ivr, security, changelog, privacy, terms. The new blog sections link to the compare pages, help articles, demo transcripts, the new landing pages (`/ai-receptionist`, `/voice-bot`, `/ai-call-center`, `/ai-telecaller`, `/ai-ivr`) and the local real-estate pages.
- **Anchor text:** every new link uses descriptive anchor text and points to a registered route; `check-seo-pages` and `check-blog-seo` both pass.

## Before / after

### Summary

| Measure | Before | After |
|---|---:|---:|
| Indexable routes audited | 124 | 124 |
| Thin pages (marketing/landing < 700 words, blog < 900) | 20 | 0 |
| Pages with < 3 contextual inbound links | 32 | 0 |
| Pages with < 3 contextual outbound links | 7 | 0 |
| Orphans (no contextual inbound link at all) | 2 | 0 |
| Orphans counting body links only (excl. related-links box) | 4 | 0 |
| Total main-content words, all routes | 80,464 | 87,217 |

### Thin pages before → after (words)

- /solutions (298 → 767)
- /solutions/ecommerce (602 → 981)
- /languages (620 → 903)
- /pricing (634 → 855)
- /ai-voice-bot-pricing-india (405 → 1125)
- /solutions/real-estate/hindi-ai-calling-agent-real-estate (371 → 784)
- /solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate (357 → 740)
- /solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate (355 → 751)
- /solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate (362 → 752)
- /solutions/real-estate/gujarati-ai-calling-agent-ahmedabad-real-estate (361 → 749)
- /resources/blog/what-is-an-ai-voice-agent (806 → 998)
- /resources/blog/how-to-choose-a-multilingual-voice-agent (753 → 921)
- /resources/blog/voice-ai-latency-how-to-measure-it (786 → 942)
- /resources/blog/website-voice-widget-for-lead-generation (753 → 919)
- /resources/blog/connecting-voice-calls-to-your-crm (749 → 921)
- /resources/blog/when-to-use-voice-ai-instead-of-ivr (709 → 915)
- /resources/blog/ai-voice-agents-for-real-estate-leads (692 → 909)
- /resources/blog/ai-voice-agent-pricing-india (669 → 917)
- /resources/blog/write-ai-voice-agent-prompts (682 → 914)
- /resources/blog/ai-call-recordings-and-transcripts (663 → 910)

### Per route (bold = changed)

| Route | Type | Words before → after | Inbound ctx before → after (body/related) | Outbound ctx before → after | Title len | Desc len | H1 | Schema | Fact flags (after; all reviewed) |
|---|---|---:|---|---|---:|---:|---|---|---|
| **/** | home | 997 → 1027 | 62 → 62 (62/0) | 19 → 19 | 60 | 173 | नमस्तेAnswer every customerin their own langu | FAQPage, Organization, SoftwareApplication, WebSite | - |
| **/product** | marketing | 976 → 974 | 39 → 40 (1/40) | 21 → 21 | 39 | 147 | One platform for every voice conversation. | BreadcrumbList, CollectionPage, FAQPage | - |
| **/product/agents** | marketing | 976 → 982 | 28 → 29 (14/19) | 15 → 16 | 38 | 138 | Build a voice agent in minutes. | BreadcrumbList, FAQPage, Service | - |
| **/product/inbound** | marketing | 935 → 935 | 20 → 21 (18/5) | 15 → 17 | 41 | 143 | Answer every call, day or night. | BreadcrumbList, FAQPage, Service | - |
| **/product/outbound** | marketing | 855 → 855 | 10 → 12 (12/2) | 13 → 15 | 47 | 137 | Reach every contact at scale. | BreadcrumbList, FAQPage, Service | - |
| **/product/knowledge-base** | marketing | 833 → 833 | 12 → 19 (19/0) | 10 → 10 | 43 | 142 | Answers grounded in your business. | BreadcrumbList, FAQPage, Service | - |
| **/product/widget** | marketing | 757 → 757 | 24 → 32 (26/12) | 10 → 11 | 39 | 138 | A call button for any website. | BreadcrumbList, FAQPage, Service | - |
| **/product/integrations** | marketing | 798 → 798 | 17 → 18 (17/1) | 10 → 12 | 51 | 151 | Every lead, in your stack. | BreadcrumbList, FAQPage, Service | - |
| **/solutions** | marketing | 298 → 767 | 14 → 14 (3/12) | 9 → 17 | 46 | 134 | Voice AI for your industry. | BreadcrumbList, CollectionPage, FAQPage | - |
| **/solutions/real-estate** | marketing | 1814 → 1821 | 33 → 33 (33/11) | 19 → 19 | 57 | 147 | AI calling agent for real estate enquiries an | BreadcrumbList, FAQPage, Service | price: ₹1 |
| **/solutions/healthcare** | marketing | 1510 → 1510 | 18 → 18 (18/1) | 14 → 15 | 49 | 151 | A front desk that never sleeps. | BreadcrumbList, FAQPage, Service | - |
| **/solutions/ecommerce** | marketing | 602 → 981 | 14 → 14 (14/0) | 4 → 10 | 47 | 133 | Support that scales with every sale. | BreadcrumbList, FAQPage, Service | - |
| /solutions/finance | marketing | 1840 → 1840 | 17 → 17 (17/0) | 11 → 11 | 57 | 148 | AI voice agent for loan collections and EMI r | BreadcrumbList, FAQPage, Service | - |
| /solutions/support | marketing | 1367 → 1367 | 20 → 20 (20/1) | 13 → 13 | 52 | 143 | Resolve tier-1 on the first ring. | BreadcrumbList, FAQPage, Service | - |
| **/languages** | marketing | 620 → 903 | 28 → 30 (18/15) | 11 → 17 | 70 | 153 | Your customer shouldn’t have to switch langua | BreadcrumbList, CollectionPage | - |
| **/languages/hindi** | marketing | 924 → 929 | 19 → 19 (19/1) | 20 → 20 | 58 | 151 | AI voice agents that speak Hindi. | BreadcrumbList, FAQPage, Service | - |
| **/languages/marathi** | marketing | 1304 → 1309 | 16 → 16 (16/1) | 24 → 24 | 62 | 152 | AI voice agents that speak Marathi. | BreadcrumbList, FAQPage, Service | - |
| **/languages/tamil** | marketing | 930 → 935 | 16 → 16 (16/1) | 18 → 18 | 59 | 154 | AI voice agents that speak Tamil. | BreadcrumbList, FAQPage, Service | - |
| **/languages/telugu** | marketing | 1543 → 1548 | 18 → 18 (18/2) | 23 → 23 | 61 | 147 | AI voice agents that speak Telugu. | BreadcrumbList, FAQPage, Service | - |
| **/languages/kannada** | marketing | 1509 → 1514 | 18 → 18 (18/1) | 23 → 23 | 60 | 151 | AI voice agents that speak Kannada. | BreadcrumbList, FAQPage, Service | - |
| **/languages/bengali** | marketing | 1195 → 1200 | 14 → 14 (14/0) | 21 → 21 | 57 | 158 | AI voice agents that speak Bengali. | BreadcrumbList, FAQPage, Service | - |
| **/languages/gujarati** | marketing | 1199 → 1204 | 15 → 15 (15/0) | 24 → 24 | 58 | 159 | AI voice agents that speak Gujarati. | BreadcrumbList, FAQPage, Service | - |
| **/languages/malayalam** | marketing | 1241 → 1246 | 14 → 14 (14/0) | 22 → 22 | 59 | 160 | AI voice agents that speak Malayalam. | BreadcrumbList, FAQPage, Service | - |
| **/languages/punjabi** | marketing | 931 → 936 | 15 → 15 (15/0) | 19 → 19 | 57 | 153 | AI voice agents that speak Punjabi. | BreadcrumbList, FAQPage, Service | - |
| **/languages/odia** | marketing | 1230 → 1235 | 14 → 14 (14/0) | 22 → 22 | 54 | 155 | AI voice agents that speak Odia. | BreadcrumbList, FAQPage, Service | - |
| **/pricing** | marketing | 634 → 855 | 28 → 30 (16/24) | 3 → 10 | 32 | 145 | Choose the plan for your business. | BreadcrumbList, FAQPage | price: ,000 credits, ,500 credits, 1 credit; scale: 15 concurrent, 30 concurrent, 5 concurrent |
| **/integrations** | marketing | 1432 → 1432 | 5 → 13 (12/1) | 12 → 12 | 37 | 126 | Every lead, in the tools you already use. | BreadcrumbList, CollectionPage, FAQPage | google-calendar: google calendar |
| **/ai-ivr** | marketing | 2086 → 2086 | 14 → 16 (16/3) | 30 → 30 | 55 | 151 | An AI IVR that lets callers speak instead of  | BreadcrumbList, FAQPage, Service | - |
| **/ai-receptionist** | marketing | 1908 → 1908 | 8 → 11 (7/6) | 24 → 26 | 53 | 154 | AI receptionist for Indian businesses. | BreadcrumbList, FAQPage, Service | - |
| **/vs-ivr** | marketing | 1355 → 1483 | 18 → 19 (14/10) | 6 → 12 | 60 | 152 | AI voice agent vs traditional IVR, chatbot an | BreadcrumbList, FAQPage | - |
| **/compare/exotel** | marketing | 1013 → 1013 | 3 → 7 (5/2) | 10 → 12 | 51 | 155 | Vistrow Voice vs Exotel | BreadcrumbList, FAQPage | - |
| **/compare/knowlarity** | marketing | 901 → 908 | 2 → 5 (3/2) | 10 → 12 | 57 | 149 | Vistrow Voice vs Knowlarity | BreadcrumbList, FAQPage | - |
| **/compare/ozonetel** | marketing | 863 → 863 | 2 → 5 (3/2) | 9 → 11 | 66 | 162 | Vistrow Voice vs Ozonetel | BreadcrumbList, FAQPage | - |
| **/compare/sarvam-ai** | marketing | 935 → 935 | 3 → 6 (3/5) | 11 → 13 | 54 | 157 | Vistrow Voice vs Sarvam AI | BreadcrumbList, FAQPage | - |
| **/compare/elevenlabs** | marketing | 920 → 920 | 2 → 5 (3/3) | 9 → 11 | 62 | 144 | Vistrow Voice vs ElevenLabs | BreadcrumbList, FAQPage | - |
| **/compare/retell-ai** | marketing | 876 → 876 | 1 → 4 (2/2) | 10 → 12 | 63 | 150 | Vistrow Voice vs Retell AI | BreadcrumbList, FAQPage | - |
| **/compare/bland-ai** | marketing | 898 → 898 | 1 → 4 (2/2) | 10 → 12 | 55 | 156 | Vistrow Voice vs Bland AI | BreadcrumbList, FAQPage | - |
| **/compare/synthflow** | marketing | 917 → 917 | 1 → 4 (2/2) | 11 → 13 | 54 | 163 | Vistrow Voice vs Synthflow | BreadcrumbList, FAQPage | - |
| **/best-ai-voice-calling-software-india** | marketing | 1382 → 1382 | 7 → 8 (7/2) | 17 → 17 | 64 | 175 | How to choose AI voice calling software in In | BreadcrumbList, FAQPage | - |
| **/ai-voice-bot-pricing-india** | marketing | 405 → 1125 | 4 → 5 (4/3) | 6 → 11 | 58 | 147 | What AI voice bot pricing really includes. | BreadcrumbList, FAQPage | - |
| **/solutions/real-estate/hindi-ai-calling-agent-real-estate** | marketing | 371 → 784 | 3 → 7 (7/1) | 6 → 18 | 54 | 155 | Hindi AI calling agent for real estate leads. | BreadcrumbList, FAQPage, Service | - |
| **/solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate** | marketing | 357 → 740 | 3 → 8 (8/1) | 6 → 18 | 54 | 155 | Marathi AI calling agent for real estate lead | BreadcrumbList, FAQPage, Service | - |
| **/solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate** | marketing | 355 → 751 | 3 → 8 (8/1) | 6 → 18 | 46 | 152 | Kannada AI calling agent for real estate lead | BreadcrumbList, FAQPage, Service | - |
| **/solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate** | marketing | 362 → 752 | 3 → 8 (8/1) | 6 → 18 | 49 | 146 | Telugu AI calling agent for real estate leads | BreadcrumbList, FAQPage, Service | - |
| **/solutions/real-estate/gujarati-ai-calling-agent-ahmedabad-real-estate** | marketing | 361 → 749 | 2 → 7 (7/1) | 6 → 17 | 51 | 147 | Gujarati AI calling agent for real estate lea | BreadcrumbList, FAQPage, Service | - |
| **/demo-calls/hindi-real-estate-lead-qualification** | demo | 910 → 910 | 3 → 5 (4/2) | 7 → 8 | 62 | 138 | Hindi Real Estate Lead Qualification Demo Cal | BreadcrumbList, FAQPage | - |
| **/demo-calls/marathi-site-visit-booking** | demo | 862 → 862 | 1 → 5 (4/2) | 7 → 8 | 52 | 129 | Marathi Site Visit Booking Demo Call | BreadcrumbList, FAQPage | - |
| **/demo-calls/kannada-inbound-property-enquiry** | demo | 799 → 799 | 1 → 4 (3/2) | 8 → 9 | 58 | 109 | Kannada Inbound Property Enquiry Demo Call | BreadcrumbList, FAQPage | price: ₹1 |
| **/demo-calls/telugu-website-widget-call** | demo | 768 → 768 | 1 → 6 (5/2) | 9 → 10 | 53 | 124 | Telugu Website Widget Voice Call Demo | BreadcrumbList, FAQPage | - |
| **/security** | company | 519 → 519 | 2 → 5 (4/4) | 2 → 5 | 51 | 147 | Phone calls are sensitive. We treat them that | BreadcrumbList | - |
| **/help** | help | 188 → 188 | 48 → 49 (47/49) | 18 → 18 | 27 | 159 | Vistrow Voice Help Center | BreadcrumbList, CollectionPage | - |
| **/help/getting-started** | help | 73 → 73 | 3 → 4 (3/4) | 5 → 5 | 32 | 92 | rocket_launch Get started | BreadcrumbList, CollectionPage | - |
| /help/agents | help | 109 → 109 | 5 → 5 (5/5) | 6 → 6 | 27 | 155 | smart_toy Agents | BreadcrumbList, CollectionPage | - |
| /help/testing-lab | help | 76 → 76 | 3 → 3 (3/3) | 5 → 5 | 32 | 108 | science Testing Lab | BreadcrumbList, CollectionPage | - |
| **/help/voices** | help | 50 → 50 | 2 → 4 (2/4) | 4 → 4 | 27 | 58 | graphic_eq Voices | BreadcrumbList, CollectionPage | - |
| /help/knowledge-base | help | 68 → 68 | 3 → 3 (3/2) | 5 → 5 | 35 | 85 | menu_book Knowledge Base | BreadcrumbList, CollectionPage | - |
| **/help/inbound** | help | 60 → 60 | 2 → 4 (2/3) | 4 → 4 | 34 | 76 | phone_callback Inbound calls | BreadcrumbList, CollectionPage | - |
| **/help/outbound** | help | 53 → 53 | 2 → 4 (2/3) | 4 → 4 | 39 | 73 | campaign Outbound campaigns | BreadcrumbList, CollectionPage | - |
| **/help/calls** | help | 56 → 56 | 2 → 5 (2/4) | 4 → 4 | 34 | 80 | history Calls history | BreadcrumbList, CollectionPage | - |
| /help/contacts | help | 60 → 60 | 3 → 3 (3/2) | 5 → 5 | 29 | 82 | contacts Contacts | BreadcrumbList, CollectionPage | - |
| **/help/appointments** | help | 46 → 46 | 2 → 4 (2/3) | 4 → 4 | 33 | 68 | event Appointments | BreadcrumbList, CollectionPage | - |
| /help/integrations | help | 68 → 68 | 3 → 3 (3/2) | 5 → 5 | 33 | 106 | extension Integrations | BreadcrumbList, CollectionPage | - |
| /help/website-widget | help | 79 → 79 | 3 → 3 (3/2) | 5 → 5 | 35 | 117 | widgets Website Widget | BreadcrumbList, CollectionPage | - |
| **/help/phone-numbers** | help | 55 → 55 | 2 → 4 (2/3) | 4 → 4 | 34 | 66 | dialpad Phone numbers | BreadcrumbList, CollectionPage | - |
| /help/compliance | help | 65 → 65 | 3 → 3 (3/2) | 5 → 5 | 31 | 110 | verified_user Compliance | BreadcrumbList, CollectionPage | - |
| /help/billing | help | 65 → 65 | 3 → 3 (3/2) | 5 → 5 | 38 | 78 | credit_card Billing & credits | BreadcrumbList, CollectionPage | - |
| /help/settings | help | 66 → 66 | 3 → 3 (3/2) | 5 → 5 | 29 | 111 | settings Settings | BreadcrumbList, CollectionPage | - |
| /help/help-and-support | help | 81 → 81 | 3 → 3 (3/2) | 5 → 5 | 35 | 102 | support_agent Help & Support | BreadcrumbList, CollectionPage | - |
| /help/getting-started/get-started | help | 244 → 244 | 3 → 3 (3/1) | 5 → 5 | 51 | 145 | Get started with Vistrow Voice | BreadcrumbList, TechArticle | - |
| /help/getting-started/dashboard-overview | help | 196 → 196 | 3 → 3 (3/1) | 5 → 5 | 39 | 148 | Read the Dashboard | BreadcrumbList, TechArticle | - |
| **/help/agents/build-with-ai** | help | 310 → 310 | 4 → 6 (5/2) | 7 → 7 | 43 | 155 | Build an agent with AI | BreadcrumbList, TechArticle | - |
| **/help/agents/create-and-edit-agent** | help | 250 → 250 | 5 → 6 (6/2) | 7 → 7 | 45 | 139 | Create and edit an agent | BreadcrumbList, TechArticle | price: 2 credits |
| **/help/agents/agent-functions-and-transfer** | help | 209 → 209 | 11 → 12 (12/1) | 7 → 7 | 56 | 147 | Functions, transfer and call limits | BreadcrumbList, TechArticle | - |
| **/help/agents/agent-webhook-crm-memory** | help | 179 → 179 | 7 → 8 (8/1) | 7 → 7 | 52 | 158 | Webhook, CRM routing and memory | BreadcrumbList, TechArticle | - |
| **/help/testing-lab/run-a-test** | help | 189 → 189 | 4 → 5 (5/1) | 5 → 5 | 54 | 143 | Test an agent before customers do | BreadcrumbList, TechArticle | - |
| **/help/testing-lab/quick-browser-test** | help | 160 → 160 | 2 → 6 (4/3) | 5 → 5 | 52 | 130 | Quick test from the Agents page | BreadcrumbList, TechArticle | - |
| **/help/voices/choose-voices** | help | 138 → 138 | 2 → 4 (4/3) | 4 → 4 | 42 | 149 | Choose and add voices | BreadcrumbList, TechArticle | - |
| **/help/knowledge-base/add-knowledge** | help | 193 → 193 | 4 → 5 (5/2) | 5 → 5 | 47 | 151 | Give your agent your facts | BreadcrumbList, TechArticle | - |
| **/help/knowledge-base/live-catalog** | help | 127 → 127 | 3 → 9 (9/2) | 5 → 5 | 33 | 156 | Live catalog | BreadcrumbList, TechArticle | - |
| **/help/inbound/route-inbound-calls** | help | 179 → 179 | 4 → 6 (6/1) | 4 → 4 | 53 | 148 | Route incoming calls to an agent | BreadcrumbList, TechArticle | - |
| /help/outbound/run-a-campaign | help | 163 → 163 | 4 → 4 (4/1) | 4 → 4 | 45 | 158 | Run an outbound campaign | BreadcrumbList, TechArticle | - |
| **/help/calls/find-a-call** | help | 163 → 163 | 6 → 10 (9/2) | 4 → 4 | 57 | 137 | Find a call, transcript or recording | BreadcrumbList, TechArticle | - |
| /help/contacts/manage-contacts | help | 122 → 122 | 3 → 3 (3/1) | 5 → 5 | 36 | 127 | Manage contacts | BreadcrumbList, TechArticle | - |
| **/help/contacts/phone-number-format** | help | 150 → 150 | 2 → 4 (2/3) | 5 → 5 | 47 | 143 | How phone numbers are read | BreadcrumbList, TechArticle | - |
| **/help/appointments/manage-appointments** | help | 137 → 137 | 7 → 13 (13/2) | 4 → 4 | 46 | 145 | Bookings and availability | BreadcrumbList, TechArticle | - |
| **/help/integrations/connect-integrations** | help | 204 → 204 | 4 → 5 (5/2) | 5 → 5 | 53 | 146 | Send leads to your CRM and tools | BreadcrumbList, TechArticle | - |
| **/help/integrations/instant-lead-follow-up** | help | 143 → 143 | 7 → 13 (13/1) | 5 → 5 | 50 | 132 | Call new leads within seconds | BreadcrumbList, TechArticle | - |
| **/help/website-widget/add-widget** | help | 182 → 182 | 4 → 5 (5/2) | 5 → 5 | 56 | 146 | Add the call button to your website | BreadcrumbList, TechArticle | - |
| **/help/website-widget/page-rules** | help | 155 → 155 | 4 → 5 (5/2) | 5 → 5 | 56 | 152 | Different agents on different pages | BreadcrumbList, TechArticle | - |
| **/help/phone-numbers/connect-a-number** | help | 155 → 155 | 4 → 5 (5/2) | 4 → 4 | 43 | 146 | Connect a phone number | BreadcrumbList, TechArticle | - |
| /help/compliance/calling-rules | help | 141 → 141 | 7 → 7 (7/2) | 5 → 5 | 51 | 145 | Calling window and Do-Not-Call | BreadcrumbList, TechArticle | - |
| **/help/compliance/consent-recording-retention** | help | 167 → 232 | 6 → 9 (7/4) | 5 → 5 | 58 | 148 | Consent, recording and data retention | BreadcrumbList, TechArticle | - |
| **/help/billing/how-credits-work** | help | 178 → 178 | 2 → 5 (5/2) | 5 → 5 | 44 | 151 | How credits are counted | BreadcrumbList, TechArticle | - |
| **/help/billing/plans** | help | 125 → 125 | 2 → 5 (4/2) | 5 → 5 | 26 | 137 | Plans | BreadcrumbList, TechArticle | price: 1,000 credits, 2,500 credits, 300 credits |
| /help/settings/workspace-and-team | help | 125 → 125 | 3 → 3 (3/1) | 5 → 5 | 48 | 148 | Workspace, country and team | BreadcrumbList, TechArticle | - |
| **/help/settings/notifications-and-privacy** | help | 165 → 165 | 2 → 5 (3/3) | 5 → 5 | 64 | 148 | Email notifications, security and your data | BreadcrumbList, TechArticle | - |
| **/help/help-and-support/copilot** | help | 234 → 234 | 2 → 4 (2/3) | 5 → 5 | 38 | 158 | Ask Artha Copilot | BreadcrumbList, TechArticle | price: , credits |
| **/help/help-and-support/contact-support** | help | 227 → 227 | 2 → 5 (3/3) | 5 → 5 | 59 | 151 | Contact support and track your request | BreadcrumbList, TechArticle | - |
| **/resources/docs** | index | 575 → 584 | 46 → 48 (1/47) | 6 → 9 | 41 | 144 | From zero to a live agent. | BreadcrumbList, TechArticle | - |
| **/about** | company | 140 → 360 | 0 → 4 (1/4) | 2 → 9 | 43 | 123 | Voice AI, built for Bharat. | AboutPage, BreadcrumbList | - |
| **/contact** | company | 90 → 90 | 102 → 105 (102/81) | 0 → 5 | 25 | 146 | See Vistrow Voice on a live call. | BreadcrumbList, ContactPage | - |
| **/careers** | company | 172 → 185 | 1 → 3 (1/3) | 0 → 4 | 33 | 117 | Build voice AI that speaks like people do. | BreadcrumbList | - |
| **/changelog** | company | 237 → 237 | 0 → 3 (2/3) | 2 → 5 | 31 | 140 | What’s shipped. | BreadcrumbList, CollectionPage | - |
| **/privacy** | company | 2732 → 2886 | 2 → 5 (5/2) | 2 → 4 | 30 | 131 | Privacy Policy | BreadcrumbList | google-calendar: google calendar |
| **/terms** | company | 736 → 736 | 2 → 3 (3/2) | 1 → 4 | 32 | 148 | Terms of Service | BreadcrumbList | - |
| /resources/blog | index | 858 → 858 | 16 → 16 (14/16) | 17 → 17 | 61 | 155 | Better conversations start with better system | BreadcrumbList, CollectionPage, ItemList | - |
| **/resources/blog/what-is-an-ai-voice-agent** | blog | 806 → 998 | 13 → 13 (5/13) | 9 → 13 | 79 | 152 | What is an AI voice agent? A practical guide  | BlogPosting, BreadcrumbList | - |
| **/resources/blog/how-to-choose-a-multilingual-voice-agent** | blog | 753 → 921 | 10 → 10 (2/10) | 10 → 14 | 80 | 162 | How to choose a multilingual AI voice agent f | BlogPosting, BreadcrumbList | - |
| **/resources/blog/voice-ai-latency-how-to-measure-it** | blog | 786 → 942 | 3 → 3 (3/1) | 9 → 13 | 73 | 180 | Voice AI latency: what to measure before you  | BlogPosting, BreadcrumbList | - |
| **/resources/blog/website-voice-widget-for-lead-generation** | blog | 753 → 919 | 3 → 3 (3/1) | 10 → 15 | 79 | 159 | Using a website voice widget to respond to hi | BlogPosting, BreadcrumbList | - |
| **/resources/blog/connecting-voice-calls-to-your-crm** | blog | 749 → 921 | 4 → 4 (4/1) | 9 → 14 | 82 | 171 | Connecting voice calls to your CRM without lo | BlogPosting, BreadcrumbList | - |
| **/resources/blog/when-to-use-voice-ai-instead-of-ivr** | blog | 709 → 915 | 2 → 4 (4/0) | 9 → 15 | 78 | 166 | AI voice agent or IVR? How to choose the righ | BlogPosting, BreadcrumbList | best-#1: the best |
| **/resources/blog/ai-voice-agents-for-real-estate-leads** | blog | 692 → 909 | 7 → 7 (5/3) | 9 → 17 | 84 | 143 | AI voice agents for real estate leads: qualif | BlogPosting, BreadcrumbList | - |
| **/resources/blog/ai-voice-agent-pricing-india** | blog | 669 → 917 | 7 → 9 (8/2) | 9 → 13 | 92 | 154 | AI voice agent pricing in India: what to incl | BlogPosting, BreadcrumbList | price: ₹12,000, ₹4 |
| **/resources/blog/write-ai-voice-agent-prompts** | blog | 682 → 914 | 5 → 5 (5/0) | 8 → 13 | 79 | 157 | How to write an AI voice agent prompt that wo | BlogPosting, BreadcrumbList | - |
| **/resources/blog/ai-call-recordings-and-transcripts** | blog | 663 → 910 | 2 → 4 (4/0) | 8 → 14 | 92 | 147 | AI call recordings and transcripts: a checkli | BlogPosting, BreadcrumbList | - |
| **/resources/blog/what-is-ivr-interactive-voice-response** | blog | 1336 → 1336 | 10 → 11 (11/0) | 10 → 10 | 88 | 164 | What is IVR (interactive voice response)? How | BlogPosting, BreadcrumbList | - |
| **/resources/blog/ivr-vs-ai-voice-agent-india** | blog | 1331 → 1347 | 11 → 11 (10/1) | 10 → 11 | 74 | 163 | IVR vs AI voice agent: which should Indian bu | BlogPosting, BreadcrumbList | - |
| **/resources/blog/ivr-in-banking-and-finance** | blog | 1267 → 1267 | 8 → 9 (9/0) | 11 → 11 | 77 | 162 | IVR in banking and finance: replacing menus w | BlogPosting, BreadcrumbList | - |
| **/resources/blog/how-to-choose-an-ivr-service-provider-india** | blog | 1257 → 1257 | 5 → 6 (6/0) | 11 → 11 | 74 | 176 | How to choose an IVR service provider in Indi | BlogPosting, BreadcrumbList | - |
| **/voice-ai-platform** | marketing | 1623 → 1623 | 5 → 5 (1/4) | 28 → 31 | 55 | 154 | A voice AI platform built for Indian business | BreadcrumbList, FAQPage, Service | - |
| **/ai-call-center** | marketing | 1614 → 1614 | 6 → 8 (4/5) | 12 → 15 | 49 | 152 | AI call center software for the first line, n | BreadcrumbList, FAQPage, Service | - |
| **/voice-bot** | marketing | 1437 → 1441 | 5 → 6 (3/4) | 9 → 9 | 56 | 156 | An AI voice bot that talks with your callers, | BreadcrumbList, FAQPage, Service | - |
| **/ai-telecaller** | marketing | 1796 → 1796 | 5 → 12 (11/2) | 22 → 25 | 51 | 160 | AI telecaller for Indian businesses. | BreadcrumbList, FAQPage, Service | best-#1: the best |

## Not verified / left for the owner

- **Native-script samples:** the new Hindi, Marathi, Kannada, Telugu and Gujarati sample lines on the local real-estate pages are my own writing and need a native-speaker review. They are labelled on the page as written samples.
- **Live demo languages:** whether the live demo actually opens in each "Other languages (demo only, in testing)" option was not tested. The picker predates this change, and I only relabelled it.
- **Help articles not edited:** `helpArticles.ts` was being changed by PR #109 at the time, so it was not edited here. Two gaps found there:
  - "How credits are counted" and "Choose and add voices" list Standard 1×, Premium 2× and Expressive 2×, but not the Native (lite) 0.5× tier. That does not contradict the pricing page, but it is incomplete.
  - Careers still says "10 Indian languages plus English", which is accurate, so it was kept.
- **Product headlines kept:** `/product/outbound` "Reach every contact at scale." and `/solutions/ecommerce` "Support that scales with every sale." are kept as existing H1s on ranking pages. Their body copy is accurate about limits.
- **Market observations:** the local real-estate market descriptions are general observations about language use and locality names, with no statistics. They are not sourced from customer data.
- **Search Console:** nothing here was measured in Search Console. Re-check indexing and queries 2–4 weeks after release.

## Verification

- `npm --prefix web-demo run build`: passed, including the SEO route audit (124 routes; unique title and description, canonical, one H1, prerendered, inbound link).
- `npm --prefix web-demo run test:seo`: passed (10 language pages).
- `(cd web-demo && npx tsx scripts/check-blog-seo.ts)`: passed (14 articles).
- `python3 web-demo/scripts/audit-seo-content.py`: 0 thin pages, 0 pages with fewer than 3 contextual inbound or outbound links, 0 orphans.
- **375 px check:** on a local build at 375 px, 13 changed templates showed no horizontal page scroll:
  - `/pricing`, `/languages`, `/solutions`, `/solutions/ecommerce`
  - a local real-estate page, `/about`, `/vs-ivr`, `/product/agents`
  - `/ai-voice-bot-pricing-india`, a blog article, `/careers`, a compare page, a language page

  The pricing credit table scrolls inside its own box.

## Follow-up: em dashes and AI-style tone (owner request, same day)

**Em dashes**
- Built public pages went from 423 em dashes to 0, counting visible text, meta tags, alt text and JSON-LD.
  - Before the fix they appeared on 91 pages.
  - The coordinator's count, visible text only, was 226 dashes across 85 pages.
- Each dash was rewritten with a full stop, comma, colon or brackets:
  - help article labels change from `**Model** — ...` to `**Model**: ...`;
  - the demo language list now reads `Hindi (हिन्दी)`;
  - help page titles now end in `| Vistrow Voice help article`;
  - Hindi sample lines use a comma.
- Help articles were edited in `server/help_articles.py` and then regenerated with `export_help_articles.py`.
- Left unchanged: code comments and dashboard-only strings (support ticket UI, agent test call status, the noise-suppression option).

**New build check**
- `scripts/check-seo-pages.mts` now fails the build on any em dash in a prerendered public page. It checks visible text, meta tags and JSON-LD, and skips executable scripts and styles.
- Negative test: an em dash injected into a built page made the build fail, as intended.

**Tone pass**
- None of the listed buzzwords (seamless, leverage, unlock, robust and so on) appear in public copy.
- "Not just X" contrasts and stacked "no X, no Y, no Z" triads were rewritten as plain sentences in:
  - the BuyerGuide heading
  - the Home "reacts, not just replies" card and the triad on the Home language card
  - `/languages`
  - the pricing card heading
  - `/voice-ai-platform` and `/voice-bot`
  - "No shift, no hold music, no voicemail" on the language pages
  - two sentences on `/resources/docs`
  - the Hindi language FAQ
  - one comparison step
  - four blog sentences or headings
  - `LanguageDetail`: "not a translated chatbot, not an IVR recording, and not a human queue"
