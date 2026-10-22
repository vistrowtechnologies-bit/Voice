# Blog cover (featured image) guide

Every blog post's cover is also its og:image (link previews on WhatsApp, LinkedIn, X, Slack), its Google Discover image and its blog-grid thumbnail. Its job is to say the topic in about one second, even when shrunk to 400 px wide.

Owner review, 21 Oct 2026: the first photo-only covers scored about 3.5/10. They were good photos, but did not show the topic (no IVR, no "vs", no headline). This guide replaces them.

Approved sample: `web-demo/scripts/blog-covers/02-ai-receptionist-vs-answering-service-vs-ivr.html` with `people/artha-headset.jpg`, rendered to 1200x675.


## Layouts (owner, 21 Oct: covers must not all look like one template)

The first five covers used one skeleton (dark shade on the left, pill, headline, chips) and looked alike in the blog grid. Use these **distinct layouts** instead. Only the logo and a touch of brand purple are shared. **Never use the same layout on two posts in a row**, and vary the mood (dark, light, photo, graphic) across each week.

| Layout | Look | Mood | Good for | Example |
|---|---|---|---|---|
| **1. Studio comparison** | Dark brand gradient, a person cut out on the right, option cards over their shoulder, the AI option highlighted | Dark, bold | "X vs Y" posts | `02-...html` |
| **2. Light editorial** | Full bright photo with no dark shade; a white rounded headline card in a bottom corner; a small "on a call" tag on the photo | Light, airy | Definitions and guides | `03-...html` |
| **3. Before / after split** | Left half greyscale photo of the old way (frustrated caller, keypad menu) with a dark caption card; right half full-colour Artha on purple with a white speech bubble; arrow badge in the middle; headline across the top | Contrast story | Replacing IVR, missed calls, speed to lead, migrations | `04-...html` |
| **4. Checklist board** | Light lavender background with a faint grid, big headline left, a tilted white checklist card right, the person in a round framed photo | Light, graphic | Checklists, how-tos, compliance | `05-...html` |
| **5. Phone mock-up** | Warm full-bleed scene photo, a smartphone screen showing Artha on a call and an outcome card ("Appointment booked"), headline bottom-left over a bottom gradient | Product in action | Industry posts, bookings, reminders | `06-...html` |
| **6. Language greeting** | The greeting in its own script, very large, over a local scene photo; small Artha badge | Local, cultural | Language posts | `examples/layout-6-language-greeting.html` |
| **7. Quote / stat card** | One short, sourced fact or customer-style question in very large type on a solid colour, with a small photo | Typographic | Data-led and myth-busting posts | `examples/layout-7-quote-card.html` |

Each cover HTML carries its own CSS (fonts from `web-demo/public/fonts`). `cover.css` holds the shared studio and scene pieces.


## Layout plan, posts 2 to 30

| # | Layout | | # | Layout | | # | Layout |
|---|---|---|---|---|---|---|---|
| 2 | 1 Studio | | 12 | 2 Light editorial | | 22 | 2 Light editorial |
| 3 | 2 Light editorial | | 13 | 1 Studio | | 23 | 3 Before/after |
| 4 | 3 Before/after | | 14 | 5 Phone mock-up | | 24 | 4 Checklist board |
| 5 | 4 Checklist board | | 15 | 2 Light editorial | | 25 | 6 Language greeting |
| 6 | 5 Phone mock-up | | 16 | 1 Studio | | 26 | 5 Phone mock-up |
| 7 | 6 Language greeting | | 17 | 5 Phone mock-up | | 27 | 2 Light editorial |
| 8 | 4 Checklist board | | 18 | 3 Before/after | | 28 | 6 Language greeting |
| 9 | 5 Phone mock-up | | 19 | 7 Quote card | | 29 | 1 Studio |
| 10 | 3 Before/after | | 20 | 6 Language greeting | | 30 | 3 Before/after |
| 11 | 7 Quote card | | 21 | 4 Checklist board | | | |

## Rules

1. **Show the topic, not a mood.** The visual must contain the subject itself: keypad, headset, voice waveform, appointment card, language script, calendar, chat bubble. A person on a phone is not enough.
2. **Text is set in HTML, never by the image model.** Image models garble letters. AI artwork (if used) never contains text.
3. **Headline:** 3 to 8 words, the post's primary keyword or its "vs" pair. Sora 800, 52 to 64 px, white on the dark brand gradient. It must stay readable at 400 px wide (about 20 px minimum on a phone).
4. **One sub-line:** 4 to 9 words, the buyer's question ("Which one should answer your business calls?"). Manrope 500, 22 to 26 px.
5. **Category pill**, one of: COMPARISON, GUIDE, CHECKLIST, INDUSTRY, LANGUAGE, HOW-TO.
6. **Brand frame:** Vistrow mark and "Vistrow Voice" top left; dark purple gradient background (#12061f to #2a0f52, with #a855f7 and #d946ef glows); the highlighted element in the brand gradient. Every cover uses this frame so the series is recognisable.
7. **Safe area:** keep everything inside the central 1200x600 (no text within 40 px of the top or bottom edge), because some platforms crop 1200x675 to 1.91:1.
8. **No prices, no competitor or vendor names or logos, no invented numbers, no em dash.** Product claims follow docs/SEO-BLOG-PLAN-2026-10-21.md (for languages: "130+ languages").
9. **A person on every cover (owner, 21 Oct).** A photoreal person makes the cover feel human and draws the eye in a feed. Put them on the right edge, fading into the gradient, with the topic visual overlapping their shoulder or torso, never their face. The face must stay visible at 400 px wide.
10. **Accessible alt text** describes what the cover shows (for example: "Comparison card: IVR menu, answering service and AI receptionist, with the AI receptionist highlighted"), more than 30 characters.

## The person (photo layer)

**Artha rule (owner, 21 Oct 2026): whenever a cover shows the AI agent answering or making a call, the person is Artha, our AI voice agent avatar, never a stock or random model.** Use `web-demo/scripts/blog-covers/people/artha-headset.jpg`, or generate a new Artha pose with the references below. Other people on covers (callers, clinic staff, business owners, customers) can be anyone who fits the post.

- Artha references: `server/static/widget-avatars/artha.png` (round avatar) and her character sheet (long dark wavy hair with brown highlights, centre parting, black tailored blazer over a beige ribbed top). Pass both to Codex with `--image` and tell it to keep her face, hair and outfit exactly the same.
- An AI-only visual (an orb, waveform or bot) is also allowed when no person fits; it should still use the brand purple.

- Generate with Codex, using an approved cover as the colour reference: one photorealistic studio portrait, 4:5, chest-up, a plain smooth dark purple background close to #1e0b3a, a purple-magenta rim light, a soft key light from the left, eyes or body turned slightly left (toward the headline), and absolutely no text or logos. Choose a role that fits the post: receptionist with headset, clinic front-desk staff, property adviser, shop owner on a phone, bank officer, older caller on a mobile. Use Indian or South Asian people unless the post's audience suggests otherwise.
- Resize to 900 px on the long side (`sips -Z 900`), save it in `web-demo/scripts/blog-covers/people/<role>.jpg`, and reuse a portrait across posts when the role fits. Not every post needs a new photo.
- In the HTML: `.person { position:absolute; right:-10px; bottom:0; height:675px; width:540px; background:url(people/<role>.jpg) center top / cover; }` with a left-to-right and bottom fade mask (see the post 2 sample). Cards go in the lower middle (left about 520 px), over the person's shoulder.
- Look at the result at full size and at 400 px. If the cards cover the face, or the face is unreadable, move the cards or pick another portrait.

## Layout

- Canvas 1200x675. Left column (about 500 px): brand, pill, headline, sub-line.
- Right side: the person (photo layer), with the concept visual overlapping the person's shoulder in the lower middle. Use one of the five types below.
- Highlight the option or outcome we recommend with the brand gradient and glow; keep the others muted.

## Cover types

| Type | Use for | Right-hand visual |
|---|---|---|
| **A. Comparison** | "X vs Y vs Z" posts | Stacked option cards, each with an icon and a 3 to 6 word description; the AI option is highlighted (see the post 2 sample) |
| **B. Flow** | How-it-works, migration and speed posts | 3 or 4 steps left to right or top to bottom with arrows (keypad, then speech bubble, then calendar tick) |
| **C. Checklist** | Buyer checklists, test plans, compliance | A card with 4 or 5 ticked items (short words only: Languages, Speed, Handoffs, Controls, Cost) |
| **D. Industry** | Clinics, real estate, restaurants, law, collections | One clear scene card: a big icon for the place (clinic cross, house key, plate, scales, rupee calendar) plus 2 or 3 short outcome chips ("Bookings", "Reminders", "Handoffs") |
| **E. Language** | Hindi, Kannada, Telugu and other language posts | The language's greeting in its own script, very large (for example "ನಮಸ್ಕಾರ"), a waveform, and chips with 2 or 3 sample intents in English. Use system fonts that cover the script and check the shaping visually. |

## Rendering

1. Copy the sample HTML to `web-demo/scripts/blog-covers/NN-<slug>.html` and change the pill, headline, sub-line and visual.
2. Render it at 1200x675:
   ```
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,675 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot=/tmp/cover.png "file://<abs path>/NN-<slug>.html"
   ```
3. Make the two site files: `sips -s format jpeg -s formatOptions 85 cover.png --out <slug>.jpg` (1200x675) and `sips -s format jpeg -s formatOptions 82 -z 360 640 cover.png --out <slug>-640.jpg`.
4. Check it: open the full size and a 400 px wide copy (`sips -Z 400`) and confirm the headline and the visual still read, nothing is clipped, and there is no text in the outer 40 px.

## Site changes that go with this

- `max-image-preview:large` is now in the robots meta tag of every indexable page (index.html, Seo.tsx, prerender.mjs; added 21 Oct). Google Discover shows large images only when it is set.
- Keep the caption "AI-generated editorial illustration; not a customer photograph." It stays accurate, because the people and artwork on covers are AI-generated.

## Cover briefs, posts 2 to 30

| # | Type | Pill | Headline | Sub-line | Visual |
|---|---|---|---|---|---|
| 2 | A | COMPARISON | AI receptionist vs answering service vs IVR | Which one should answer your business calls? | Cards: keypad "IVR menu", headset "Answering service", waveform "AI receptionist" (highlighted). **Approved sample.** |
| 3 | B | GUIDE | What is an AI receptionist? | What it answers, books and hands over | Flow: phone ringing, then waveform "Answers", calendar tick "Books", person icon "Hands over" |
| 4 | B | GUIDE | AI IVR: from "press 1" to "how can I help?" | Replace the phone menu with a conversation | Keypad grid crossed out, arrow, speech bubble with waveform (highlighted) |
| 5 | C | CHECKLIST | AI voice agent platform checklist | What to test before you buy | Card with ticks: Languages, Speed on real calls, Approved answers, Handoffs, Controls and cost |
| 6 | D | INDUSTRY | AI receptionist for clinics | Bookings, reminders and safe handoffs | Clinic cross icon, appointment card with a tick, chips "Bookings", "Reminders", "Handoffs to staff" |
| 7 | E | LANGUAGE | Hindi AI voice agent | Natural Hindi and Hinglish on every call | Large "नमस्ते", waveform, chips "Bookings", "Follow-ups", "Hinglish" |
| 8 | E | LANGUAGE | Kannada AI voice calling agent | What to test before launch | Large "ನಮಸ್ಕಾರ", waveform, chips "Site visits", "Callbacks", "Kannada + English" |
| 9 | E | LANGUAGE | Telugu AI voice agent | Calls that sound local in Telugu | Large "నమస్కారం", waveform, chips "Enquiries", "Reminders", "Telugu + English" |
| 10 | B | INDUSTRY | AI calling agent for real estate | From enquiry to site visit | Flow: lead form, phone call waveform, house key with calendar tick "Site visit booked" |
| 11 | D | INDUSTRY | AI voice agents for EMI reminders | Polite reminders, clear next steps | Calendar with rupee-free payment icon (no currency symbol), chips "Due-date reminder", "Promise to pay", "Talk to a person" |
| 12 | B | GUIDE | After-hours AI answering | What callers should get at 11 pm | Moon and clock, arrow, waveform card "Answered", calendar tick "Callback booked" |
| 13 | D | INDUSTRY | AI receptionist for estate agents | UK and Canada, Hindi and Punjabi callers | House icon, "नमस्ते" and "ਸਤ ਸ੍ਰੀ ਅਕਾਲ" chips, chip "Viewing booked" |
| 14 | B | HOW-TO | Fewer "where is my order?" calls | Let voice AI answer order status questions | Parcel icon, speech bubble "Where is my order?", waveform answer card |
| 15 | A | COMPARISON | Voice bot vs agent in a call centre | Where automation helps, where people win | Two cards: waveform "Voice bot: routine calls" (highlighted), headset "Agent: complex calls" |
| 16 | A | COMPARISON | AI voice agent vs chatbot vs IVR | The real differences | Cards: keypad "IVR", chat bubble "Chatbot", waveform "Voice agent" (highlighted) |
| 17 | D | INDUSTRY | AI receptionist for immigration and travel | Enquiries in Hindi, Punjabi and English | Passport-style book icon (no text), plane icon, chips "Enquiry taken", "Consultation booked" |
| 18 | A | COMPARISON | Voice widget vs chat widget | Which captures more website leads? | Two browser-window cards: chat bubbles vs a mic button with waveform (highlighted) |
| 19 | C | HOW-TO | Work out your AI receptionist ROI | A simple method with your own numbers | Card with 3 rows: "Missed calls", "Time saved", "Bookings won", and a rising bar icon (no figures) |
| 20 | E | LANGUAGE | Punjabi AI voice agent | For India, the UK and Canada | Large "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", waveform, chips "India", "UK", "Canada" |
| 21 | E | LANGUAGE | Tamil voice bot: testing guide | Names, numbers and real callers | Large "வணக்கம்", waveform, checklist chips "Names", "Numbers", "Dates" |
| 22 | D | INDUSTRY | AI phone ordering for restaurants | Orders and enquiries, even at peak hour | Plate and cutlery icon, speech bubble, chips "Table booked", "Order noted", "Timings" |
| 23 | B | GUIDE | What a missed call really costs | And how to stop missing them | Phone with a missed-call badge (icon, no number), arrow, waveform "Answered every time" |
| 24 | C | CHECKLIST | AI call recording and consent checklist | Disclosure, consent and retention | Card with ticks: "Tell callers it's AI", "Recording notice", "Consent", "Retention", "Access" |
| 25 | E | LANGUAGE | Marathi AI voice agent | Natural Marathi for Maharashtra | Large "नमस्कार", waveform, chips "Site visits", "Reminders", "Marathi + English" |
| 26 | B | HOW-TO | Speed to lead with AI calls | Call new leads back within minutes | Lead form icon, stopwatch, waveform call card, tick "Qualified" |
| 27 | D | INDUSTRY | AI receptionist for law firms | Intake without legal advice | Scales icon, chips "Enquiry taken", "Consultation booked", "No legal advice" |
| 28 | E | LANGUAGE | Gujarati AI voice agent | For India and the UK | Large "નમસ્તે", waveform, chips "India", "UK", "Gujarati + English" |
| 29 | E | LANGUAGE | Bengali AI voice agent | Calls in Bengali that feel local | Large "নমস্কার", waveform, chips "Enquiries", "Reminders", "Bengali + English" |
| 30 | B | INDUSTRY | Conversational AI IVR for banks | Faster answers, secure handoffs | Bank building icon, keypad to speech bubble, lock chip "Secure steps stay with the bank" |
