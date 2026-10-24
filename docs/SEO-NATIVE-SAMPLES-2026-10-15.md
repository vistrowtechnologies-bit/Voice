# Native sample lines regenerated with Sarvam (2026-10-15)

The Indian-language sample conversation lines on the public marketing site were first written by an English-first model. This pass sent every one of them to Sarvam so they read the way people actually talk on the phone in each region.

## How it was done

- Model: `sarvam-105b-conversations` via Sarvam’s OpenAI-compatible chat completions API (`https://api.sarvam.ai/v1`), temperature 0.3, strict JSON output.
- Requests: 32 (one per page or line group, no retries needed). Tokens: about 21,939 prompt + 7,990 completion = 29,929 total.
- Each request carried the page, scenario, language, script, the speaker roles, the original line and its English gloss, and fixed facts to keep (names, numbers, booking flow, no prices added). Sarvam returned a rewritten line and a short English gloss for each.
- Every result was reviewed against the original meaning and the product flow before it went in. Lines Sarvam returned unchanged stay as they were. Changed lines replace the old ones, and where the page shows an English gloss it now describes the new line.
- Mechanical clean-up only: straight apostrophes became typographic ones (the strings are single-quoted in TypeScript), "lakhs" in glosses became "lakh" to match the site, and text was NFC-normalised so a line differing only in Unicode encoding counts as unchanged.
- English lines, titles, H1s and the "written example / sample" labels were not touched. Romanised lines (demo-call transcripts, /ai-receptionist, /voice-bot, homepage) stayed romanised.
- Not sent: the blog phrase fragment "budget seventy-five tak hai" in `src/content/voiceBlog.ts` (a quoted example inside an English instruction, not a dialogue line), and single-word English replies in demo transcripts ("Investment.", "Afternoon.", "Around one crore.") and the name-only line "Rohan Mehta.".

## Counts per language

| Language | Lines sent | Regenerated | Unchanged | Flagged (original kept) |
|---|---|---|---|---|
| Bengali | 3 | 2 | 1 | 0 |
| Gujarati | 7 | 4 | 3 | 0 |
| Hindi (incl. Hinglish) | 51 | 25 | 26 | 0 |
| Kannada | 13 | 8 | 4 | 1 |
| Malayalam | 4 | 0 | 4 | 0 |
| Marathi | 12 | 7 | 5 | 0 |
| Odia | 4 | 3 | 1 | 0 |
| Punjabi | 4 | 3 | 1 | 0 |
| Tamil | 5 | 1 | 4 | 0 |
| Telugu | 13 | 4 | 9 | 0 |
| **Total** | **116** | **57** | **58** | **1** |

## Flagged and post-edited lines

- `lang-gujarati-1` (/languages/gujarati): Sarvam transliterated the product name Artha into Gujarati script; restored "Artha" to match every other page.
- `demo-kannada-1` (/demo-calls/kannada-inbound-property-enquiry): Sarvam added a greeting ("ನಮಸ್ಕಾರ") and a stray "N", mixed Kannada script into a romanised line, and grew it well past +30%. Original kept.

## Per page: old line, new line, gloss

### /solutions/real-estate (Hindi (Hinglish, code-mixed))

Source: `web-demo/src/lib/marketingContent.ts`

- **New buyer enquiry**, unchanged (Sarvam judged it already natural)
  - Old: Baner में two BHK चाहिए, budget करीब one crore है.
- **Project comparison**, regenerated
  - Old: Aarohan Crest और nearby options में फर्क क्या है?
  - New: Aarohan Crest और आस-पास के options में क्या फर्क है?
  - Gloss: What is the difference between Aarohan Crest and the nearby options?
- **Book a site visit**, regenerated
  - Old: Saturday afternoon site visit हो सकती है?
  - New: Saturday afternoon site visit हो सकती है क्या?
  - Gloss: Can we do a site visit on Saturday afternoon?

### /solutions/real-estate (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: नमस्ते अमित जी, मैं Aarohan Homes से Artha बोल रही हूँ। आपने अभी Baner project के लिए enquiry की थी, दो मिनट बात कर सकते हैं?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: हाँ, बताइए। 2BHK चाहिए, budget around 1 crore है।
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ठीक है। आप खुद रहने के लिए देख रहे हैं या investment के लिए? और कब तक लेने का plan है?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: खुद के लिए, तीन-चार महीने में। Sunday को site visit हो सकती है?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: हाँ, Sunday सुबह 11 बजे का slot खाली है। book कर दूँ?

### /solutions/healthcare (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Patient with symptoms**, regenerated
  - Old: मेरे पेट में बहुत दर्द है, किस डॉक्टर को दिखाऊँ?
  - New: पेट में बहुत दर्द है, किस डॉक्टर को दिखाऊँ?
  - Gloss: Stomach hurts a lot, which doctor should I see?
- **Find a doctor**, unchanged (Sarvam judged it already natural)
  - Old: General physician कब available हैं?
- **Book or reschedule**, unchanged (Sarvam judged it already natural)
  - Old: कल दो बजे का appointment कर दीजिए.

### /solutions/ecommerce (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Track an order**, unchanged (Sarvam judged it already natural)
  - Old: Order NV-1042 अभी कहाँ है?
- **Damaged delivery**, unchanged (Sarvam judged it already natural)
  - Old: Package खुला था और product damaged है.
- **Return or exchange**, unchanged (Sarvam judged it already natural)
  - Old: Size गलत है, return कैसे होगा?

### /solutions/finance (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Payment reminder**, unchanged (Sarvam judged it already natural)
  - Old: मेरी due date और amount confirm कर दीजिए.
- **Payment difficulty**, unchanged (Sarvam judged it already natural)
  - Old: इस महीने payment करना मुश्किल है.
- **Request a callback**, unchanged (Sarvam judged it already natural)
  - Old: मुझे किसी person से बात करनी है.

### /solutions/finance (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Agent**, regenerated
  - Old: नमस्ते, क्या मेरी बात सुनीता शर्मा जी से हो रही है?
  - New: नमस्ते, सुनीता शर्मा जी बात कर रही हैं?
  - Gloss: Hello, is this Sunita Sharma ji speaking?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: हाँ, बोलिए।
- **Agent**, regenerated
  - Old: मैं Saarthi Finance की तरफ़ से Artha बोल रही हूँ। आपकी 5 तारीख़ वाली EMI अभी pending दिख रही है।
  - New: मैं Saarthi Finance से Artha बोल रही हूँ। आपकी 5 तारीख की EMI अभी pending दिख रही है।
  - Gloss: This is Artha calling from Saarthi Finance. Your EMI for the 5th is still showing as pending.
- **Caller**, regenerated
  - Old: हाँ, इस महीने थोड़ी problem है। 20 तारीख़ तक कर दूँगी, पर late fee के बारे में किसी से बात करनी है।
  - New: हाँ, इस महीने थोड़ी problem है। 20 तारीख तक कर दूँगी, पर late fee के बारे में किसी से बात करनी है।
  - Gloss: Yes, there is a slight issue this month. I will pay by the 20th, but I need to talk to someone about the late fee.
- **Agent**, regenerated
  - Old: ठीक है, मैंने 20 तारीख़ नोट कर ली है। late fee के लिए हमारी team आपको call करेगी, आपके लिए कौन सा समय ठीक रहेगा?
  - New: ठीक है, मैंने 20 तारीख नोट कर ली है। late fee के लिए हमारी team आपको call करेगी, आपके लिए कौन सा time ठीक रहेगा?
  - Gloss: Okay, I have noted the 20th. Our team will call you regarding the late fee, what time will work for you?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: शाम 5 से 6 के बीच।

### /solutions/support (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Reset email missing**, unchanged (Sarvam judged it already natural)
  - Old: Password reset email अभी तक नहीं आया.
- **Billing question**, unchanged (Sarvam judged it already natural)
  - Old: मेरे invoice में extra charge क्यों है?
- **Escalate an issue**, regenerated
  - Old: मैं ये तीन बार try कर चुका हूँ, person से connect करो.
  - New: मैंने तीन बार try किया है, मुझे person से connect कर दो.
  - Gloss: I have tried three times, connect me to a person.

### /languages/hindi (Hindi (Hinglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Agent**, regenerated
  - Old: नमस्ते राहुल जी, मैं Artha बोल रही हूँ। आपकी इस महीने की EMI 15 तारीख़ को due है, बस याद दिलाने के लिए कॉल किया।
  - New: नमस्ते राहुल जी, मैं Artha बोल रही हूँ। आपकी इस महीने की EMI 15 तारीख़ को due है, बस याद दिलाने के लिए call किया।
  - Gloss: Hello Rahul ji, I am Artha. Your EMI for this month is due on the 15th, I just called to remind you.
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: हाँ, पता है। Salary 12 को आएगी, तो 13 तक payment कर दूँगा।
- **Agent**, regenerated
  - Old: ठीक है, मैंने 13 तारीख़ नोट कर ली है। और कोई सवाल हो तो बताइए।
  - New: ठीक है, मैंने 13 तारीख़ note कर ली है। कोई और सवाल हो तो बताइए।
  - Gloss: Okay, I have noted the 13th. Let me know if you have any other question.

### /languages/marathi (Marathi (Pune, natural Marathi with common English words))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: नमस्कार, उद्या सकाळी घरी blood test साठी sample collection होईल का?
- **Agent**, regenerated
  - Old: नमस्कार! हो, उद्या सकाळी 7 ते 9 चा slot उपलब्ध आहे. तुमचा पत्ता आणि पिन कोड सांगाल का?
  - New: नमस्कार! हो, उद्या सकाळी 7 ते 9 चा slot available आहे. तुमचा address आणि pin code सांगाल का?
  - Gloss: Hello! Yes, a 7 to 9 a.m. slot is available tomorrow. Could you tell me your address and pin code?
- **Caller**, regenerated
  - Old: कोथरूड, पिन कोड 411038. Fasting लागेल का?
  - New: कोथरूड, pin code 411038. Fasting लागेल का?
  - Gloss: Kothrud, pin code 411038. Is fasting needed?
- **Agent**, regenerated
  - Old: त्या test साठी लॅबच्या सूचनेनुसार fasting लागेल. मी उद्याचा 7 ते 9 चा slot बुक केला आहे.
  - New: त्या test साठी lab च्या instructions नुसार fasting लागेल. मी उद्याचा 7 ते 9 चा slot book केला आहे.
  - Gloss: For that test, fasting is needed as per the lab instructions. I have booked tomorrow’s 7 to 9 a.m. slot.

### /languages/tamil (Tamil (Chennai, colloquial Tanglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Agent**, regenerated
  - Old: வணக்கம் கார்த்திக், நான் Artha பேசுறேன். நீங்க OMR project பத்தி enquiry பண்ணீங்க, அதுக்காக call பண்றேன்.
  - New: வணக்கம் கார்த்திக், நான் Artha பேசுறேன். OMR project பத்தி enquiry பண்ணீங்க-ல, அத பத்தி பேசத்தான் call பண்ணிருக்கேன்.
  - Gloss: Hello Karthik, I am Artha. You enquired about the OMR project, so I am calling to discuss it.
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ஆமா, 2BHK price என்ன range-ல இருக்கு?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: 2BHK 75 lakh-ல இருந்து ஆரம்பிக்குது. நீங்க சொந்தமா இருக்கவா, investment-க்கா பாக்குறீங்க?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: சொந்தமா இருக்க. Sunday site visit பண்ணலாமா?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: பண்ணலாம். Sunday காலை 10 மணிக்கு slot free-ஆ இருக்கு, book பண்ணட்டுமா?

### /languages/telugu (Telugu (Hyderabad, colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: హలో, రేపు డాక్టర్ గారి appointment దొరుకుతుందా?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: నమస్కారం! రేపు సాయంత్రం 5 గంటలకు slot ఖాళీగా ఉంది. మీ పేరు చెప్తారా?
- **Caller**, regenerated
  - Old: లక్ష్మి. Evening 5 okay.
  - New: లక్ష్మి. సాయంత్రం 5 okay.
  - Gloss: Lakshmi. 5 in the evening is okay.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: సరే లక్ష్మి గారు, రేపు సాయంత్రం 5 గంటలకు మీ appointment book అయింది.

### /languages/telugu (Telugu (colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Greeting**, regenerated
  - Old: నమస్కారం! నేను Artha, మీకు ఎలా సహాయం చేయగలను?
  - New: నమస్కారం! నేను Artha ని, మీకు ఎలా help చేయగలను?
  - Gloss: Hello! I am Artha, how can I help you?
- **When the caller is busy**, regenerated
  - Old: ఇప్పుడు busy గా ఉంటే, ఏ టైమ్ లో call చేయమంటారు?
  - New: ఇప్పుడు busy గా ఉంటే, ఏ టైమ్ కి call చేయమంటారు?
  - Gloss: If you are busy now, what time should we call?
- **A question outside the knowledge base**, regenerated
  - Old: ఆ విషయం మా team తో confirm చేసి మీకు చెప్తాము.
  - New: ఆ విషయం మా team తో confirm చేసి మళ్ళీ చెప్తాము.
  - Gloss: We will confirm that with our team and get back to you.
- **Transfer on a phone call**, unchanged (Sarvam judged it already natural)
  - Old: ఒక్క నిమిషం, మిమ్మల్ని మా sales team కి connect చేస్తాను.

### /languages/kannada (Kannada (Bengaluru, colloquial Kanglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ಹಲೋ, Whitefield ಹತ್ತಿರ 2BHK flat ಇದೆಯಾ?
- **Agent**, regenerated
  - Old: ನಮಸ್ಕಾರ! ಹೌದು, Whitefield ಹತ್ತಿರ 2BHK ಆಯ್ಕೆಗಳಿವೆ. ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಹೇಳ್ತೀರಾ?
  - New: ನಮಸ್ಕಾರ! ಹೌದು, Whitefield ಹತ್ತಿರ 2BHK options ಇವೆ. ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಹೇಳ್ತೀರಾ?
  - Gloss: Hello! Yes, there are 2BHK options near Whitefield. What is your budget?
- **Caller**, regenerated
  - Old: ಸುಮಾರು 80 lakh ಒಳಗೆ. Weekend site visit ಮಾಡಬಹುದಾ?
  - New: ಸುಮಾರು 80 lakh ಒಳಗೆ. Weekend-ಅಲ್ಲಿ site visit ಮಾಡಬಹುದಾ?
  - Gloss: Under about 80 lakh. Can I do a site visit on the weekend?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ಖಂಡಿತ. ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 11 ಗಂಟೆಗೆ slot ಖಾಲಿ ಇದೆ, book ಮಾಡ್ಲಾ?

### /languages/kannada (Kannada (colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Greeting**, regenerated
  - Old: ನಮಸ್ಕಾರ! ನಾನು Artha, ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?
  - New: ನಮಸ್ಕಾರ, ನಾನು Artha. ನಿಮಗೆ ಹೇಗೆ help ಮಾಡಲಿ?
  - Gloss: Hello, I am Artha. How can I help you?
- **When the caller is busy**, regenerated
  - Old: ಈಗ busy ಇದ್ರೆ, ಯಾವ ಸಮಯಕ್ಕೆ call ಮಾಡಲಿ?
  - New: ಈಗ busy ಇದ್ರೆ, ಯಾವ time ಗೆ call ಮಾಡ್ಲಿ?
  - Gloss: If you are busy now, what time should we call?
- **A question outside the knowledge base**, unchanged (Sarvam judged it already natural)
  - Old: ಆ ವಿಷಯ ನಮ್ಮ team ಹತ್ರ confirm ಮಾಡಿ ನಿಮಗೆ ತಿಳಿಸ್ತೀವಿ.
- **Transfer on a phone call**, regenerated
  - Old: ಒಂದು ನಿಮಿಷ, ನಿಮ್ಮನ್ನು ನಮ್ಮ sales team ಗೆ connect ಮಾಡ್ತೀನಿ.
  - New: ಒಂದು ನಿಮಿಷ hold ಮಾಡಿ, sales team ಗೆ connect ಮಾಡ್ತೀನಿ.
  - Gloss: Hold for one minute, I will connect you to the sales team.

### /languages/bengali (Bengali (Kolkata, colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, regenerated
  - Old: হ্যালো, আমার অর্ডারটা কবে আসবে? অর্ডার নম্বর 5821।
  - New: হ্যালো, আমার order-টা কবে আসবে? order number 5821.
  - Gloss: Hello, when will my order arrive? Order number 5821.
- **Agent**, regenerated
  - Old: নমস্কার! একটু দেখে নিচ্ছি। আপনার অর্ডারটা আজ বিকেল পাঁচটার মধ্যে পৌঁছানোর কথা। ডেলিভারি পার্টনারের নম্বর কি SMS-এ পাঠিয়ে দেব?
  - New: নমস্কার! একটু দেখে নিচ্ছি। আপনার order-টা আজ বিকেল ৫টার মধ্যে পৌঁছানোর কথা। delivery partner-এর number-টা কি SMS-এ পাঠিয়ে দেব?
  - Gloss: Hello! Let me check. Your order is due to arrive by 5 p.m. today. Shall I send the delivery partner’s number via SMS?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: হ্যাঁ, পাঠিয়ে দিন। ধন্যবাদ।

### /languages/gujarati (Gujarati (Surat, colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Agent**, regenerated
  - Old: નમસ્તે મહેશભાઈ, હું Artha બોલું છું. Invoice નંબર 1042નું payment 20 તારીખે due છે, એની યાદ અપાવવા ફોન કર્યો છે.
  - New: નમસ્તે મહેશભાઈ, હું Artha બોલું છું. Invoice નંબર 1042 નું payment 20 તારીખે due છે, બસ એની યાદ અપાવવા call કર્યો છે.
  - Gloss: Hello Maheshbhai, this is Artha. The payment for invoice number 1042 is due on the 20th; I just called to remind you.
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: હા, ખબર છે. સોમવાર સુધીમાં transfer કરી દઈશ.
- **Agent**, regenerated
  - Old: સારું, હું સોમવારની તારીખ નોંધી લઉં છું. બીજું કંઈ જોઈએ તો કહો.
  - New: સારું, હું સોમવારની તારીખ નોંધી લઉં છું. બીજું કંઈ હોય તો કહેજો.
  - Gloss: Okay, I’m noting down Monday. Let me know if there’s anything else.

### /languages/malayalam (Malayalam (Kerala, colloquial Manglish))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ഹലോ, കൊച്ചിയിൽ 2BHK flat ഉണ്ടോ? ഞാൻ ദുബായിൽ നിന്നാണ് വിളിക്കുന്നത്.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: നമസ്കാരം! ഉണ്ട്, കാക്കനാട് ഭാഗത്ത് 2BHK ഓപ്ഷനുകളുണ്ട്. നിങ്ങളുടെ budget എത്രയാണ്?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ഏകദേശം 70 lakh. അടുത്ത മാസം നാട്ടിൽ വരുന്നുണ്ട്, അപ്പോൾ site visit നടക്കുമോ?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: തീർച്ചയായും. ഏത് തീയതികളിൽ നാട്ടിൽ ഉണ്ടാകും എന്ന് പറയാമോ? ആ ദിവസങ്ങളിലെ slot ഞാൻ നോക്കാം.

### /languages/punjabi (Punjabi (Punjab, colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, regenerated
  - Old: ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਜੀ, Canada ਦੇ study visa ਲਈ counselling ਕਦੋਂ ਹੋ ਸਕਦੀ ਹੈ?
  - New: ਸਤ ਸ੍ਰੀ ਅਕਾਲ, Canada ਦੇ study visa ਲਈ counselling ਕਦੋਂ ਹੋ ਸਕਦੀ ਹੈ?
  - Gloss: Hello, when can I get counselling for a Canada study visa?
- **Agent**, regenerated
  - Old: ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ ਦਾ slot ਖਾਲੀ ਹੈ। ਤੁਹਾਡਾ IELTS ਹੋ ਗਿਆ ਹੈ?
  - New: ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ ਦਾ slot ਖਾਲੀ ਹੈ। ਤੁਹਾਡਾ IELTS ਹੋ ਗਿਆ?
  - Gloss: Hello! The slot is free tomorrow morning at 11. Have you done your IELTS?
- **Caller**, regenerated
  - Old: ਹਾਂ ਜੀ, 6.5 bands ਆਏ ਨੇ। 11 ਵਜੇ ਠੀਕ ਹੈ।
  - New: ਹਾਂ ਜੀ, 6.5 bands ਆਏ ਨੇ। 11 ਵਜੇ ਠੀਕ ਹੈ ਜੀ।
  - Gloss: Yes, I got 6.5 bands. 11 o’clock is fine.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ਵਧੀਆ। ਆਪਣਾ ਨਾਂ ਦੱਸ ਦਿਓ, ਮੈਂ ਕੱਲ੍ਹ 11 ਵਜੇ ਦੀ counselling book ਕਰ ਦਿੰਦੀ ਹਾਂ।

### /languages/odia (Odia (Bhubaneswar, colloquial))

Source: `web-demo/src/lib/marketingContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ନମସ୍କାର, ଆପଣଙ୍କ ଇନଷ୍ଟିଚ୍ୟୁଟରେ ନୂଆ batch କେବେ ଆରମ୍ଭ ହେବ?
- **Agent**, regenerated
  - Old: ନମସ୍କାର! ନୂଆ batch ଆସନ୍ତା ସୋମବାରରୁ ଆରମ୍ଭ ହେବ। ଆପଣ କେଉଁ class ପାଇଁ ପଚାରୁଛନ୍ତି?
  - New: ନମସ୍କାର! ନୂଆ batch ଆସନ୍ତା ସୋମବାରରୁ ଆରମ୍ଭ ହେବ। ଆପଣ କୋଉ class ପାଇଁ ପଚାରୁଛନ୍ତି?
  - Gloss: Hello! The new batch starts from next Monday. Which class are you asking about?
- **Caller**, regenerated
  - Old: Class 10 ପାଇଁ। Demo class ଅଛି କି?
  - New: Class 10 ପାଇଁ। କିଛି demo class ଅଛି କି?
  - Gloss: For class 10. Is there any demo class?
- **Agent**, regenerated
  - Old: ହଁ, ଆସନ୍ତାକାଲି ସକାଳ 10ଟାରେ demo class ଅଛି। ଆପଣଙ୍କ ନାମ କହିବେ, ମୁଁ book କରିଦେବି।
  - New: ହଁ, ଆସନ୍ତାକାଲି ସକାଳ 10ଟାରେ demo class ଅଛି। ଆପଣଙ୍କ ନାଁ କହିବେ, ମୁଁ book କରିଦେବି।
  - Gloss: Yes, there is a demo class tomorrow at 10 a.m. Tell me your name, I will book it.

### /solutions/real-estate/hindi-ai-calling-agent-real-estate (Hindi (Hinglish, Delhi NCR))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, regenerated
  - Old: Noida Extension में 3 BHK देख रहे हैं, budget लगभग 80 लाख है.
  - New: नोएडा एक्सटेंशन में 3 BHK देख रहे हैं, budget लगभग 80 लाख है.
  - Gloss: Looking for a 3 BHK in Noida Extension, budget is around 80 lakh.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ज़रूर. आप ख़ुद रहने के लिए ले रहे हैं या investment के लिए?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ख़ुद के लिए, अगले छह महीने में.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ठीक है. क्या इस शनिवार site visit रख दूँ?

### /solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate (Marathi (Pune/Mumbai, colloquial))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, regenerated
  - Old: हिंजवडीजवळ 2 BHK हवा आहे, बजेट साधारण 70 लाख.
  - New: हिंजवडीजवळ 2 BHK हवाय, budget साधारण 70 लाख.
  - Gloss: Want a 2 BHK near Hinjewadi, budget around 70 lakh.
- **Agent**, regenerated
  - Old: नक्की. तुम्हाला possession कधीपर्यंत हवा आहे?
  - New: नक्की. possession कधीपर्यंत हवंय?
  - Gloss: Sure. When do you need possession?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: पुढच्या वर्षापर्यंत चालेल.
- **Agent**, regenerated
  - Old: ठीक आहे. रविवारी सकाळी site visit बुक करू का?
  - New: ठीक आहे. रविवारी सकाळी site visit book करू का?
  - Gloss: Okay. Shall I book a site visit on Sunday morning?

### /solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate (Kannada (Bengaluru, Kanglish))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, regenerated
  - Old: ವೈಟ್‌ಫೀಲ್ಡ್ ಹತ್ತಿರ 2 BHK ಬೇಕು, budget ಸುಮಾರು 90 lakh.
  - New: ವೈಟ್‌ಫೀಲ್ಡ್ ಹತ್ತಿರ 2 BHK ಬೇಕು, budget 90 lakh ಆಸುಪಾಸು.
  - Gloss: Need a 2 BHK near Whitefield, budget around 90 lakh.
- **Agent**, regenerated
  - Old: ಖಂಡಿತ. ಇದು ನಿಮ್ಮ ಸ್ವಂತ ವಾಸಕ್ಕೋ ಅಥವಾ investment ಗೋ?
  - New: ಖಂಡಿತ. ಇದು ಸ್ವಂತಕ್ಕೆ ವಾಸ ಮಾಡೋಕಾ ಅಥವಾ investment ಗೋ?
  - Gloss: Sure. Is this for self-use or for investment?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: ಸ್ವಂತಕ್ಕೆ. ಈ ವರ್ಷದೊಳಗೆ ಬೇಕು.
- **Agent**, regenerated
  - Old: ಸರಿ. ಶನಿವಾರ site visit ಬುಕ್ ಮಾಡಲಾ?
  - New: ಸರಿ. ಶನಿವಾರ site visit booking ಮಾಡ್ಲಾ?
  - Gloss: Okay. Shall I book a site visit on Saturday?

### /solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate (Telugu (Hyderabad, Tenglish))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: గచ్చిబౌలి దగ్గర 3 BHK కావాలి, budget దాదాపు 1.2 కోట్లు.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: తప్పకుండా. మీరు సొంతంగా ఉండటానికా, investment కోసమా?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: సొంతానికే. మూడు నెలల్లో కొనాలని అనుకుంటున్నాం.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: సరే. ఈ ఆదివారం site visit బుక్ చేయమంటారా?

### /solutions/real-estate/gujarati-ai-calling-agent-ahmedabad-real-estate (Gujarati (Ahmedabad, colloquial))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: SG Highway પાસે 3 BHK જોઈએ છે, બજેટ લગભગ 85 લાખ.
- **Agent**, regenerated
  - Old: ચોક્કસ. તમે પોતે રહેવા માટે લો છો કે investment માટે?
  - New: ચોક્કસ. તમે પોતાના રહેવા માટે લો છો કે investment માટે?
  - Gloss: Certainly. Are you buying for personal use or for investment?
- **Caller**, regenerated
  - Old: પોતે રહેવા માટે, દિવાળી પહેલાં.
  - New: પોતાના રહેવા માટે, દિવાળી પહેલાં.
  - Gloss: For personal use, before Diwali.
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: સરસ. શનિવારે site visit ગોઠવી દઉં?

### /demo-calls/hindi-real-estate-lead-qualification (Hindi (Hinglish, code-mixed))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, regenerated
  - Old: Investment ke liye.
  - New: Investment ke liye hai.
  - Gloss: It is for investment.
- **Caller**, regenerated
  - Old: Around 6000 square feet. Pricing bata dijiye.
  - New: Lagbhag 6000 square feet. Pricing bata dijiye.
  - Gloss: Approximately 6000 square feet. Please tell me the pricing.

### /demo-calls/marathi-site-visit-booking (Marathi (code-mixed with English, Pune))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: Namaskar, tumhi project sathi enquiry keli hoti. Site visit schedule karaychi aahe ka?
- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: Ho, Saturday la possible aahe ka?
- **Agent**, regenerated
  - Old: Saturday preference note karto. Morning ki afternoon convenient aahe?
  - New: Saturday cha preference note karto. Morning ki afternoon chaalel?
  - Gloss: I am noting Saturday as a preference. Will morning or afternoon work?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: Perfect. Sales team exact slot confirm karun tumhala details pathavel.

### /demo-calls/kannada-inbound-property-enquiry (Kannada (Kanglish, code-mixed))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, flagged, original kept
  - Old: Self-use. Location mattu price details beku.
  - Sarvam returned: N ನಮಸ್ಕಾರ, naanu swantha use-ge tagolta idini. Location mattu price details beku.

### /demo-calls/telugu-website-widget-call (Telugu (Tenglish, code-mixed))

Source: `web-demo/src/lib/seoExpansionContent.ts`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: Pricing and location details kavali.

### /ai-telecaller (Hindi (Hinglish))

Source: `web-demo/src/pages/marketing/AiTelecaller.tsx`

- **Agent**, regenerated
  - Old: नमस्ते प्रिया जी, मैं ABC Academy की तरफ़ से AI assistant बोल रही हूँ। आपने कल website पर weekend batch के बारे में enquiry की थी, दो मिनट बात हो सकती है?
  - New: नमस्ते प्रिया जी, मैं ABC Academy से AI assistant बात कर रही हूँ। आपने कल website पर weekend batch के लिए enquiry की थी, दो मिनट बात हो सकती है?
  - Gloss: Hello Priya ji, I am an AI assistant from ABC Academy. You enquired about the weekend batch on the website yesterday; can we talk for two minutes?
- **Lead**, regenerated
  - Old: हाँ, बताइए। Fees कितनी है और classes कब से शुरू हैं?
  - New: हाँ, बताइए। Fees कितनी हैं और classes कब से शुरू हैं?
  - Gloss: Yes, tell me. How much are the fees and when do the classes start?
- **Agent**, regenerated
  - Old: Weekend batch अगले महीने की 5 तारीख़ से शुरू है। Fees के लिए हमारी counsellor आपको exact details देंगी। आप online classes चाहेंगी या centre पर?
  - New: Weekend batch अगले महीने 5 तारीख़ से शुरू है। Fees की exact details हमारी counsellor आपको बता देंगी। आप online classes लेंगी या centre पर?
  - Gloss: The weekend batch starts on the 5th of next month. Our counsellor will give you the exact fee details. Will you take online classes or at the centre?
- **Lead**, unchanged (Sarvam judged it already natural)
  - Old: Centre पर। लेकिन अभी मैं office में हूँ, शाम को call कर सकते हैं?
- **Agent**, unchanged (Sarvam judged it already natural)
  - Old: ज़रूर। मैंने आज शाम 6:30 बजे counsellor के call के लिए note कर लिया है। धन्यवाद प्रिया जी!

### /ai-receptionist (Hindi (Hinglish, code-mixed))

Source: `web-demo/src/pages/marketing/AiReceptionist.tsx`

- **Caller**, regenerated
  - Old: Haan, mujhe cleaning ke liye appointment chahiye, Thursday ko.
  - New: Haan, mujhe cleaning ki appointment chahiye, Thursday ko.
  - Gloss: Yes, I need a cleaning appointment, on Thursday.
- **Agent**, regenerated
  - Old: Zaroor. Thursday ko 11 baje aur 4 baje slot khaali hai. Aapke liye kaunsa theek rahega?
  - New: Theek hai. Thursday ko 11 baje aur 4 baje ka slot khaali hai. Aapko kaunsa time suit karega?
  - Gloss: Okay. Thursday at 11 AM and 4 PM are free. Which time works for you?
- **Caller**, regenerated
  - Old: 4 baje. Naam Priya hai.
  - New: 4 baje. Mera naam Priya hai.
  - Gloss: At 4 PM. My name is Priya.
- **Agent**, regenerated
  - Old: Thank you, Priya ji. Thursday 4 baje ka appointment book ho gaya hai. Kya main is number ko hi contact number ke liye save karun?
  - New: Thank you, Priya ji. Thursday 4 baje ka appointment book ho gaya hai. Kya main is number ko hi contact number ke liye save kar doon?
  - Gloss: Thank you, Priya. The Thursday 4 PM appointment is booked. Should I save this number as the contact number?

### /voice-bot (Hindi (Hinglish, code-mixed))

Source: `web-demo/src/pages/marketing/VoiceBot.tsx`

- **bot**, regenerated
  - Old: Namaste, Sunrise Dental Clinic. Main appointment mein madad kar sakti hoon. Bataiye?
  - New: Namaste, Sunrise Dental Clinic. Main aapki appointment mein help kar sakti hoon. Bataiye?
  - Gloss: Hello, Sunrise Dental Clinic. I can help you with your appointment. Tell me.
- **caller**, regenerated
  - Old: Haan, mujhe cleaning ke liye aana tha, is Saturday ho sakta hai?
  - New: Haan, mujhe cleaning karwani hai, is Saturday aa sakta hoon kya?
  - Gloss: Yes, I need a cleaning, can I come this Saturday?
- **bot**, regenerated
  - Old: Saturday ko 11 baje aur 3 baje ke slot khaali hain. Kaunsa theek rahega?
  - New: Saturday ko 11 baje aur 3 baje ke slots free hain. Kaunsa theek rahega?
  - Gloss: On Saturday, 11 AM and 3 PM slots are free. Which one works?
- **caller**, regenerated
  - Old: 11 is fine. Price kitna hai cleaning ka?
  - New: 11 baje theek hai. Cleaning ka price kitna hai?
  - Gloss: 11 is fine. How much is the price for cleaning?
- **bot**, unchanged (Sarvam judged it already natural)
  - Old: Clinic ki list ke hisaab se cleaning ka charge doctor checkup ke baad confirm hota hai. Main 11 baje ka slot book kar doon? Aapka naam bata dijiye.
- **bot**, regenerated
  - Old: Ho gaya, Rohan ji. Saturday 11 baje, cleaning. Kuch aur?
  - New: Ho gaya, Rohan Mehta ji. Saturday 11 baje, cleaning. Aur kuch chahiye?
  - Gloss: Done, Rohan Mehta. Saturday 11 AM, cleaning. Anything else?

### / (homepage) (Hindi (Hinglish, code-mixed))

Source: `web-demo/src/pages/marketing/Home.tsx`

- **Caller**, unchanged (Sarvam judged it already natural)
  - Old: Mujhe pricing samajhni hai, but please explain in English.

## Verification

- `npm --prefix web-demo run build` (includes the SEO route audit and the em-dash check): passed.
- `npm --prefix web-demo run test:seo`: passed with no change to its expected phrases (none of them quote a sample line).
- `npx tsx scripts/check-blog-seo.ts`: passed.
- Spot-checked the prerendered HTML for /solutions/healthcare and two demo-call pages: new lines present, the flagged Kannada line unchanged.
- Not verified: a native-speaker read of each language. Sarvam is a strong Indic model, but a human pass per language is still the real check.

## 2026-10-23: voice note

The lines in this doc are on-page text only; no audio was made from them. The only Sarvam-voiced demo audio on the marketing site is the ten /languages sample calls (`web-demo/public/media/samples/*-switch.m4a`). Following the owner's decision that all demo audio uses Bulbul v4 Flash with Aarti as the agent, their agent lines were re-voiced with `aarti_hi_customer` on 2026-10-23. See docs/SEO-VOICE-SAMPLES-2026-10-15.md.
