// Two-speaker sample calls for the /languages pages, agent-led: the AI agent
// opens in the business's default language (`from`), the caller just answers
// in the page's language (`to`), and the agent carries on in it without being
// asked. Nobody mentions language. Voiced with Sarvam bulbul:v4-flash (agent
// aarti_hi_customer, caller aditya_hi_conversational on a phone-band line,
// temperature 0.9). `start` is each line's offset in the file, in seconds.
// Generated; see docs/SEO-VOICE-SAMPLES-2026-10-15.md. Waveform peaks come
// from scripts/voice-sample-peaks.py.

import { VOICE_SAMPLE_PEAKS } from './voiceSamplePeaks'

export interface VoiceSampleTurn {
  speaker: 'Caller' | 'Agent'
  /** BCP 47 code of the line's spoken language. */
  lang: string
  native: string
  /** English gloss; omitted when the line is already English. */
  gloss?: string
  start: number
}

export interface VoiceSample {
  src: string
  seconds: number
  from: string
  to: string
  languages: string[]
  /** Index of the agent's first line in `to`, where the language track
   * flips; defaults to SWITCH_TURN. */
  switchTurn?: number
  turns: VoiceSampleTurn[]
  /** Waveform bar heights (0-100), from voiceSamplePeaks.ts. */
  peaks?: number[]
}

/** Index of the caller's language-switch turn in every sample. */
export const SWITCH_TURN = 2

export const switchTurnOf = (sample: VoiceSample) => sample.switchTurn ?? SWITCH_TURN

const SAMPLES: Record<string, VoiceSample> = {
  marathi: {
    "src": "/media/samples/marathi-switch.m4a",
    "seconds": 35,
    "from": "Hindi",
    "to": "Marathi",
    "languages": [
      "hi-IN",
      "mr-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते, Artha बोल रही हूँ। बताइए, मैं क्या मदद कर सकती हूँ?",
        "start": 0.2,
        "gloss": "Hello, this is Artha. Tell me, how can I help?"
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "हां, नमस्कार… उद्या सकाळी घरून blood sample घेऊन जाल का?",
        "start": 4.12,
        "gloss": "Yes, hello… could you collect a blood sample from home tomorrow morning?"
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "हो, नक्की! उद्या सकाळी 7 ते 9 चा slot खाली आहे.",
        "start": 8.61,
        "gloss": "Yes, sure! Tomorrow’s 7 to 9 morning slot is free."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "अं, चालेल. माझा पत्ता कोथरूड मधला आहे, 411038. आणि… fasting लागेल का?",
        "start": 12.79,
        "gloss": "Um, that works. My address is in Kothrud, 411038. And… is fasting needed?"
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "हो, lab च्या instructions नुसार 10 तास. म्हणजे रात्री 9 नंतर काही खाऊ नका, पाणी चालेल.",
        "start": 20.02,
        "gloss": "Yes, 10 hours as per the lab’s instructions. So nothing to eat after 9 at night; water is fine."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "ओके ओके, मग 7 ते 9 चा slot book करा.",
        "start": 25.44,
        "gloss": "Okay, okay, then book the 7 to 9 slot."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "झालं! उद्या 7 ते 9, कोथरूडला आमची team येईल.",
        "start": 28.57,
        "gloss": "Done! Tomorrow 7 to 9, our team will come to Kothrud."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "बरं बरं, थँक यू.",
        "start": 32.8,
        "gloss": "Okay, okay, thank you."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "धन्यवाद, काळजी घ्या!",
        "start": 33.76,
        "gloss": "Thank you, take care!"
      }
    ]
  },
  hindi: {
    "src": "/media/samples/hindi-switch.m4a",
    "seconds": 33,
    "from": "English",
    "to": "Hindi",
    "languages": [
      "en-IN",
      "hi-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hi, Rahul ji? This is Artha from Saarthi Finance. Just a quick reminder, this month’s EMI is due on the 15th.",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ जी, बोलिए… हाँ हाँ, EMI वाला याद है।",
        "start": 7.66,
        "gloss": "Yes, go ahead… yes, yes, I remember the EMI."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी, thank you! तो payment कब तक हो पाएगा?",
        "start": 10.35,
        "gloss": "Great, thank you! So by when can the payment be made?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "वो, salary 12 को… हाँ, 12 तारीख को आती है।",
        "start": 13.37,
        "gloss": "Well, salary on the 12th… yes, it comes on the 12th."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी।",
        "start": 17.29,
        "gloss": "Right."
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "तो umm, 13 को कर दूँगा, app से।",
        "start": 17.75,
        "gloss": "So, umm, I’ll do it on the 13th, through the app."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "ठीक है, तो मैं note कर लेती हूँ: 13 तारीख, app से payment। सही है?",
        "start": 20.32,
        "gloss": "Okay, so I’ll note it down: the 13th, payment through the app. Is that right?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ हाँ, सही है।",
        "start": 24.07,
        "gloss": "Yes, yes, that’s right."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "Thank you, राहुल जी! आपका दिन अच्छा हो।",
        "start": 25.8,
        "gloss": "Thank you, Rahul ji! Have a good day."
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ, thank you, bye bye.",
        "start": 27.75,
        "gloss": "Yes, thank you, bye bye."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी, धन्यवाद राहुल जी, bye! ध्यान रखिए।",
        "start": 29.76,
        "gloss": "Thank you, Rahul ji, bye! Take care."
      }
    ]
  },
  tamil: {
    "src": "/media/samples/tamil-switch.m4a",
    "seconds": 28,
    "from": "English",
    "to": "Tamil",
    "languages": [
      "en-IN",
      "ta-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hi Karthik, this is Artha. You’d enquired about the OMR project. Can we talk for two minutes?",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "ஆ, சொல்லுங்க சொல்லுங்க.",
        "start": 5.59,
        "gloss": "Ah, go ahead, go ahead."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "சரி! நீங்க இருக்கவா பாக்குறீங்க, இல்ல investment-க்கா?",
        "start": 6.72,
        "gloss": "Okay! Are you looking to live in it, or as an investment?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "இருக்கத்தான்… family-ஓட. ம்ம், 2BHK வேணும்.",
        "start": 10.32,
        "gloss": "To live in… with my family. Hmm, I want a 2BHK."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "சரி, family-க்கு 2BHK. ஒரு தடவை site-அ நேர்ல வந்து பாக்கலாமா?",
        "start": 13.8,
        "gloss": "Okay, a 2BHK for the family. Would you like to come and see the site once?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "ஆமா… இந்த Sunday வரலாமா?",
        "start": 18.4,
        "gloss": "Yes… can I come this Sunday?"
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "Sunday காலை 10 மணிக்கு slot இருக்கு, book பண்ணிட்டேன். எங்க team அங்க உங்களுக்காக wait பண்ணுவாங்க.",
        "start": 20.37,
        "gloss": "There’s a slot on Sunday at 10 in the morning; I’ve booked it. Our team will be waiting for you there."
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "சூப்பர், thanks!",
        "start": 25.31,
        "gloss": "Super, thanks!"
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "ரொம்ப நன்றி கார்த்திக், bye!",
        "start": 26.46,
        "gloss": "Thanks a lot, Karthik, bye!"
      }
    ]
  },
  telugu: {
    "src": "/media/samples/telugu-switch.m4a",
    "seconds": 34,
    "from": "Hindi",
    "to": "Telugu",
    "languages": [
      "hi-IN",
      "te-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते, Artha बोल रही हूँ। बताइए, कैसे मदद करूँ?",
        "start": 0.2,
        "gloss": "Hello, this is Artha. Tell me, how can I help?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "హలో అండి… రేపు doctor appointment దొరుకుతుందా?",
        "start": 3.47,
        "gloss": "Hello… can I get a doctor’s appointment tomorrow?"
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "దొరుకుతుంది అండి. రేపు సాయంత్రం 5 గంటలకి slot ఖాళీగా ఉంది, ఓకేనా?",
        "start": 6.49,
        "gloss": "Yes, you can. There’s a free slot tomorrow at 5 in the evening; is that okay?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "ఆ, 5 ఓకే.",
        "start": 11.35,
        "gloss": "Yeah, 5 is okay."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే. Patient పేరు చెప్పండి?",
        "start": 12.36,
        "gloss": "Okay. The patient’s name?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "రవి కుమార్… నా కోసమే అండి.",
        "start": 14.43,
        "gloss": "Ravi Kumar… it’s for me."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే అండి. Doctor గారికి చెప్పడానికి, ఏం problem అని కొంచెం చెప్తారా?",
        "start": 17.11,
        "gloss": "Okay. So I can tell the doctor, could you say briefly what the problem is?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "అది… మూడు రోజులుగా జ్వరం, దగ్గు ఉన్నాయి.",
        "start": 21.66,
        "gloss": "Well… I’ve had fever and cough for three days."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే రవి గారు, రేపు సాయంత్రం 5 కి book అయింది. 10 నిమిషాలు ముందే రండి.",
        "start": 25.47,
        "gloss": "Okay Ravi garu, you’re booked for 5 in the evening tomorrow. Please come 10 minutes early."
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "సరే అండి, thank you.",
        "start": 29.09,
        "gloss": "Okay, thank you."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "ధన్యవాదాలు రవి గారు, జాగ్రత్తగా ఉండండి!",
        "start": 30.65,
        "gloss": "Thank you, Ravi garu, take care!"
      }
    ]
  },
  kannada: {
    "src": "/media/samples/kannada-switch.m4a",
    "seconds": 34,
    "from": "English",
    "to": "Kannada",
    "languages": [
      "en-IN",
      "kn-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hello, this is Artha. How can I help you today?",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಹಲೋ… Whitefield ಹತ್ರ 2BHK flat ಸಿಗುತ್ತಾ?",
        "start": 2.93,
        "gloss": "Hello… can I get a 2BHK flat near Whitefield?"
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಸಿಗುತ್ತೆ! Whitefield ಹತ್ರ 2BHK ಕೆಲವು options ಇವೆ. ನಿಮ್ಮ budget ಎಷ್ಟು?",
        "start": 6.83,
        "gloss": "You can! There are some 2BHK options near Whitefield. What’s your budget?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಹ್ಮ್… ಸುಮಾರು 80 lakh ಒಳಗೆ. 6 ತಿಂಗಳಲ್ಲಿ shift ಆಗ್ಬೇಕು.",
        "start": 12.42,
        "gloss": "Hmm… under about 80 lakh. I need to move in within 6 months."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಸರಿ, 80 lakh ಒಳಗೆ, 6 ತಿಂಗಳಲ್ಲಿ. ಒಂದ್ಸಲ site visit ಮಾಡ್ತೀರಾ?",
        "start": 17.3,
        "gloss": "Okay, under 80 lakh, within 6 months. Would you like to do a site visit?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಹೌದು, ಈ weekend ಆಗುತ್ತಾ? ಶನಿವಾರ ಆದ್ರೆ ಒಳ್ಳೇದು.",
        "start": 22.03,
        "gloss": "Yes, is this weekend possible? Saturday would be good."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಆಗುತ್ತೆ. ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 11ಕ್ಕೆ book ಮಾಡಿದೀನಿ. ನಮ್ಮ team site-ಅಲ್ಲಿ ಇರುತ್ತೆ.",
        "start": 25.81,
        "gloss": "It is. I’ve booked Saturday at 11 in the morning. Our team will be at the site."
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಸೂಪರ್, thank you.",
        "start": 30.22,
        "gloss": "Super, thank you."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಧನ್ಯವಾದಗಳು, ಒಳ್ಳೇ ದಿನ ಆಗ್ಲಿ!",
        "start": 31.31,
        "gloss": "Thank you, have a good day!"
      }
    ]
  },
  malayalam: {
    "src": "/media/samples/malayalam-switch.m4a",
    "seconds": 32,
    "from": "English",
    "to": "Malayalam",
    "languages": [
      "en-IN",
      "ml-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hello, this is Artha. How can I help you?",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ഹലോ… ഞാൻ Dubai-ൽ നിന്നാണ് വിളിക്കുന്നത്. Kochi-ൽ ഒരു 2BHK flat കിട്ടുമോ?",
        "start": 2.47,
        "gloss": "Hello… I’m calling from Dubai. Can I get a 2BHK flat in Kochi?"
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "കിട്ടും! Kakkanad area-യിൽ 2BHK options ഉണ്ട്. Budget എത്രയാ?",
        "start": 7.76,
        "gloss": "You can! There are 2BHK options in the Kakkanad area. What’s the budget?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ഏകദേശം… 70 lakh. അടുത്ത മാസം നാട്ടിൽ വരും, അപ്പോ site visit പറ്റുമോ?",
        "start": 12.31,
        "gloss": "About… 70 lakh. I’m coming home next month; can we do a site visit then?"
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "പറ്റും. ഏതൊക്കെ dates-ൽ ആണ് നാട്ടിൽ ഉണ്ടാവുക?",
        "start": 17.43,
        "gloss": "Yes. Which dates will you be home?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ആ, അടുത്ത മാസം 10 മുതൽ 20 വരെ.",
        "start": 20.36,
        "gloss": "Ah, from the 10th to the 20th of next month."
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "ഓക്കേ, 10 മുതൽ 20 വരെ. അതിനിടയിൽ ഒരു ദിവസം visit fix ചെയ്ത് confirm ചെയ്യാം.",
        "start": 23.02,
        "gloss": "Okay, the 10th to the 20th. We’ll fix a visit on one of those days and confirm it with you."
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ശരി, thanks!",
        "start": 28.81,
        "gloss": "Okay, thanks!"
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "നന്ദി, നല്ലൊരു ദിവസം!",
        "start": 29.66,
        "gloss": "Thank you, have a nice day!"
      }
    ]
  },
  gujarati: {
    "src": "/media/samples/gujarati-switch.m4a",
    "seconds": 29,
    "from": "Hindi",
    "to": "Gujarati",
    "languages": [
      "hi-IN",
      "gu-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते महेशभाई, Artha बोल रही हूँ। इनवॉइस नंबर 1042 का payment 20 तारीख को due है, बस याद दिलाना था।",
        "start": 0.2,
        "gloss": "Hello Maheshbhai, this is Artha. The payment for invoice 1042 is due on the 20th; just a reminder."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "હા હા, ખબર છે, યાદ છે… સોમવાર સુધીમાં transfer કરી દઈશ.",
        "start": 8.23,
        "gloss": "Yes, yes, I know, I remember… I’ll transfer it by Monday."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "સરસ, તો સોમવાર payment date તરીકે note કરી લીધું.",
        "start": 12.54,
        "gloss": "Great, so I’ve noted Monday as the payment date."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "અને હા… account statement પણ email પર મોકલી દેજો ને.",
        "start": 15.88,
        "gloss": "And yes… please send the account statement by email too."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "હા, ચોક્કસ. Request note કરી લીધી છે, accounts team email પર મોકલી દેશે.",
        "start": 19.09,
        "gloss": "Yes, sure. I’ve noted the request; the accounts team will email it."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "સારું સારું, આભાર. આવજો.",
        "start": 24.6,
        "gloss": "Okay, okay, thanks. Bye."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "આભાર મહેશભાઈ, તમારો દિવસ સારો જાય! આવજો.",
        "start": 26.08,
        "gloss": "Thank you, Maheshbhai, have a good day! Bye."
      }
    ]
  },
  bengali: {
    "src": "/media/samples/bengali-switch.m4a",
    "seconds": 28,
    "from": "Hindi",
    "to": "Bengali",
    "languages": [
      "hi-IN",
      "bn-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते, Artha बोल रही हूँ। बताइए, कैसे मदद कर सकती हूँ?",
        "start": 0.2,
        "gloss": "Hello, this is Artha. Tell me, how can I help?"
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "হ্যালো… আমার order-টা কবে আসবে বলুন তো? Order number 5821.",
        "start": 3.33,
        "gloss": "Hello… could you tell me when my order will come? Order number 5821."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "এক সেকেন্ড, দেখছি… হ্যাঁ, আপনার order আজ বিকেল 5টার মধ্যে পৌঁছে যাবে।",
        "start": 9.57,
        "gloss": "One second, checking… yes, your order will arrive by 5 this evening."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "উফ, আমি তো 6টার আগে বাড়ি থাকব না। সন্ধ্যার দিকে দেওয়া যাবে?",
        "start": 14.29,
        "gloss": "Oh, I won’t be home before 6. Can it be delivered in the evening?"
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "আচ্ছা, কোনো চিন্তা নেই। 6টার পরে delivery-র request delivery team-এর জন্য note করে নিলাম।",
        "start": 18.76,
        "gloss": "Okay, no worries. I’ve noted a request for delivery after 6 for the delivery team."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "ঠিক আছে, অনেক ধন্যবাদ। রাখছি।",
        "start": 23.44,
        "gloss": "Okay, thanks a lot. Bye now."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "আপনাকেও ধন্যবাদ, ভালো থাকবেন!",
        "start": 25.65,
        "gloss": "Thank you too, take care!"
      }
    ]
  },
  punjabi: {
    "src": "/media/samples/punjabi-switch.m4a",
    "seconds": 27,
    "from": "English",
    "to": "Punjabi",
    "languages": [
      "en-IN",
      "pa-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hello, this is Artha. How can I help you today?",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਹਾਂ ਜੀ, ਸਤ ਸ੍ਰੀ ਅਕਾਲ… Canada study visa ਦੀ counselling ਕਦੋਂ ਮਿਲ ਸਕਦੀ ਆ?",
        "start": 2.93,
        "gloss": "Yes, hello… when can I get counselling for a Canada study visa?"
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ ਦਾ slot ਖਾਲੀ ਹੈ। ਤੁਹਾਡਾ IELTS ਹੋ ਗਿਆ?",
        "start": 7.01,
        "gloss": "There’s a free slot tomorrow at 11 in the morning. Have you done your IELTS?"
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਹਾਂ ਜੀ, 6.5 bands ਆਏ ਨੇ।",
        "start": 11.74,
        "gloss": "Yes, I got 6.5 bands."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਵਧੀਆ score ਹੈ! ਨਾਂ ਦੱਸ ਦਿਓ, 11 ਵਜੇ book ਕਰ ਦਿੰਦੀ ਹਾਂ।",
        "start": 13.46,
        "gloss": "That’s a good score! Tell me your name and I’ll book 11 o’clock."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਗੁਰਪ੍ਰੀਤ… ਗੁਰਪ੍ਰੀਤ ਸਿੰਘ।",
        "start": 17.29,
        "gloss": "Gurpreet… Gurpreet Singh."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਠੀਕ ਆ ਗੁਰਪ੍ਰੀਤ ਜੀ, ਕੱਲ੍ਹ 11 ਵਜੇ book ਹੋ ਗਈ। IELTS scorecard ਨਾਲ ਲੈ ਆਇਓ।",
        "start": 19.23,
        "gloss": "Okay Gurpreet ji, you’re booked for 11 tomorrow. Please bring your IELTS scorecard."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਠੀਕ ਆ ਜੀ, ਲੈ ਆਵਾਂਗਾ। ਧੰਨਵਾਦ।",
        "start": 23.37,
        "gloss": "Okay, I’ll bring it. Thanks."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਧੰਨਵਾਦ ਜੀ, ਆਪਣਾ ਖਿਆਲ ਰੱਖਿਓ!",
        "start": 25.5,
        "gloss": "Thank you, take care!"
      }
    ]
  },
  odia: {
    "src": "/media/samples/odia-switch.m4a",
    "seconds": 32,
    "from": "Hindi",
    "to": "Odia",
    "languages": [
      "hi-IN",
      "or-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते, Artha बोल रही हूँ। बताइए, कैसे मदद कर सकती हूँ?",
        "start": 0.2,
        "gloss": "Hello, this is Artha. Tell me, how can I help?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ନମସ୍କାର… ଆପଣଙ୍କ institute ରେ ନୂଆ batch କେବେଠୁ ଆରମ୍ଭ ହେଉଛି?",
        "start": 3.33,
        "gloss": "Hello… when does the new batch start at your institute?"
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଆସନ୍ତା ସୋମବାରଠୁ ଆରମ୍ଭ ହେଉଛି। କେଉଁ class ପାଇଁ ପଚାରୁଛନ୍ତି?",
        "start": 7.16,
        "gloss": "It starts next Monday. Which class are you asking about?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ମୋ ପୁଅ ପାଇଁ… class 10।",
        "start": 11.02,
        "gloss": "For my son… class 10."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଆଚ୍ଛା। କାଲି ସକାଳ 10ଟାରେ class 10ର demo class ଅଛି, book କରିଦେବି?",
        "start": 13.57,
        "gloss": "I see. There’s a class 10 demo class tomorrow at 10 in the morning; shall I book it?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ହଁ, କରିଦିଅନ୍ତୁ। ସେ ଆସିବ।",
        "start": 19.39,
        "gloss": "Yes, please do. He’ll come."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଠିକ୍ ଅଛି। ପିଲାର ନାଁ କଣ କହିବେ?",
        "start": 21.94,
        "gloss": "Okay. Could you tell me the child’s name?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ସୌରଭ ମହାନ୍ତି।",
        "start": 24.43,
        "gloss": "Sourav Mohanty."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ବାସ୍, ସୌରଭ ପାଇଁ demo class କାଲି ସକାଳ 10ଟାରେ book ହୋଇଗଲା।",
        "start": 25.66,
        "gloss": "Done, the demo class for Sourav is booked for 10 tomorrow morning."
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ଠିକ୍ ଅଛି, ଧନ୍ୟବାଦ।",
        "start": 29.39,
        "gloss": "Okay, thank you."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଧନ୍ୟବାଦ, ଭଲରେ ରହିବେ!",
        "start": 30.5,
        "gloss": "Thank you, take care!"
      }
    ]
  },
  english: {
    "src": "/media/samples/english-switch.m4a",
    "seconds": 42,
    "from": "Hindi",
    "to": "English",
    "languages": [
      "hi-IN",
      "en-IN"
    ],
    "switchTurn": 2,
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते, Vikram जी? मैं Artha, Kaveri Software से बोल रही हूँ। आपने हमारे HR software के demo के लिए request भेजी थी।",
        "start": 0.2,
        "gloss": "Hello, Vikram ji? This is Artha from Kaveri Software. You had sent a request for a demo of our HR software."
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Yes, yes, tell me. Actually, we are about sixty people now, so we need something for payroll and leave.",
        "start": 8.59
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Got it, payroll and leave for around sixty people. Would a thirty-minute online demo work for you this week?",
        "start": 14.89
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Umm, Thursday is better… after lunch, maybe three o’clock?",
        "start": 21.61
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Sure, Thursday at 3 PM is free. I’ll send the meeting link to the email on your form.",
        "start": 26.35
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Okay… and my HR head will also join.",
        "start": 31.73
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "No problem, you can forward the same link to her. So, Thursday, 3 PM, online demo.",
        "start": 33.66
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Great, thanks.",
        "start": 38.38
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Thank you, Vikram ji! Have a good day.",
        "start": 39.48
      }
    ]
  },
}

export const VOICE_SAMPLES: Record<string, VoiceSample> = Object.fromEntries(
  Object.entries(SAMPLES).map(([slug, sample]) => [slug, { ...sample, peaks: VOICE_SAMPLE_PEAKS[slug] }]),
)
