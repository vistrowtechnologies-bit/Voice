// Two-speaker sample calls for the /languages pages: the caller starts in
// Hindi and switches to the page's language at turn 3 (Hindi page: starts
// in English and switches to Hindi), and the agent follows. Drafted with Sarvam
// sarvam-105b-conversations, then rewritten as spoken lines; voiced with
// Sarvam bulbul:v4-flash (agent aarti_hi_customer since 2026-10-23, caller
// aditya_hi_conversational, pace 1.2, temperature 0.7). `start` is
// each line's offset in the file, in seconds. Generated; see
// docs/SEO-VOICE-SAMPLES-2026-10-15.md.

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
  turns: VoiceSampleTurn[]
}

/** Index of the caller's language-switch turn in every sample. */
export const SWITCH_TURN = 2

export const VOICE_SAMPLES: Record<string, VoiceSample> = {
  marathi: {
    "src": "/media/samples/marathi-switch.m4a",
    "seconds": 31,
    "from": "Hindi",
    "to": "Marathi",
    "languages": [
      "hi-IN",
      "mr-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "Hello, कल सुबह घर से blood sample collect हो जाएगा क्या?",
        "start": 0.2,
        "gloss": "Hello, can a blood sample be collected from home tomorrow morning?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी हाँ, हो जाएगा। कल सुबह 7 से 9 का slot खाली है।",
        "start": 3.31,
        "gloss": "Yes, it can. Tomorrow’s 7 to 9 morning slot is free."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "अच्छा, मराठीत बोलूया का? माझा address Kothrud मधला आहे.",
        "start": 6.85,
        "gloss": "Okay, can we speak in Marathi? My address is in Kothrud."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "हो, चालेल ना! पूर्ण address आणि pin code सांगा.",
        "start": 10.57,
        "gloss": "Yes, sure! Tell me the full address and pin code."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "कोथरूड, 411038. आणि fasting लागेल का?",
        "start": 13.65,
        "gloss": "Kothrud, 411038. And is fasting needed?"
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "हो, lab च्या instructions नुसार 10 तास. म्हणजे रात्री 9 नंतर काही खाऊ नका, पाणी चालेल.",
        "start": 18.43,
        "gloss": "Yes, 10 hours as per the lab’s instructions. So nothing to eat after 9 at night; water is fine."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "ओके, मग 7 ते 9 चा slot book करा.",
        "start": 24.81,
        "gloss": "Okay, then book the 7 to 9 slot."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "झालं! उद्या 7 ते 9, Kothrud ला आमची team येईल.",
        "start": 27.48,
        "gloss": "Done! Tomorrow 7 to 9, our team will come to Kothrud."
      }
    ]
  },
  hindi: {
    "src": "/media/samples/hindi-switch.m4a",
    "seconds": 30,
    "from": "English",
    "to": "Hindi",
    "languages": [
      "en-IN",
      "hi-IN"
    ],
    "turns": [
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Hello Rahul ji, this is Artha from Saarthi Finance. Just a quick reminder: this month’s EMI is due on the 15th.",
        "start": 0.2
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Yes, yes, I know. My salary comes on the 12th.",
        "start": 6.41
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "अच्छा, क्या हम हिंदी में बात कर सकते हैं? मुझे आसान लगेगा।",
        "start": 8.74,
        "gloss": "Actually, can we talk in Hindi? It’s easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "हाँ, बिल्कुल! तो आप payment कब तक कर पाएँगे?",
        "start": 12.01,
        "gloss": "Yes, of course! So by when can you pay?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "13 तारीख तक। Salary 12 को आती है, तो अगले दिन app से कर दूँगा।",
        "start": 15.21,
        "gloss": "By the 13th. Salary comes on the 12th, so I’ll pay through the app the next day."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "ठीक है, मैं note कर लेती हूँ: 13 तारीख, app से। Thank you, राहुल जी।",
        "start": 19.99,
        "gloss": "Okay, I’m noting it down: the 13th, through the app. Thank you, Rahul ji."
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "बढ़िया, याद दिलाने के लिए thanks।",
        "start": 24.39,
        "gloss": "Great, thanks for reminding me."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "कोई बात नहीं, राहुल जी। आपका दिन अच्छा हो!",
        "start": 27.21,
        "gloss": "No problem, Rahul ji. Have a good day!"
      }
    ]
  },
  tamil: {
    "src": "/media/samples/tamil-switch.m4a",
    "seconds": 29,
    "from": "Hindi",
    "to": "Tamil",
    "languages": [
      "hi-IN",
      "ta-IN"
    ],
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते कार्तिक जी, Artha बोल रही हूँ। आपने OMR project के लिए enquiry की थी, दो मिनट बात हो सकती है?",
        "start": 0.2,
        "gloss": "Hello Karthik ji, this is Artha. You enquired about the OMR project; can we talk for two minutes?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ जी, बोलिए, मैं सुन रहा हूँ।",
        "start": 6.14,
        "gloss": "Yes, go ahead, I’m listening."
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "தமிழ்ல பேசலாமா? எனக்கு அது easy.",
        "start": 7.89,
        "gloss": "Can we speak in Tamil? That’s easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "கண்டிப்பா, தமிழ்லயே பேசலாம்! சொல்லுங்க, நீங்க இருக்கவா, இல்ல investment-க்கா?",
        "start": 9.86,
        "gloss": "Of course, let’s speak in Tamil! Tell me, is it to live in, or as an investment?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "இருக்கத்தான், family-ஓட. 2BHK வேணும்.",
        "start": 14.32,
        "gloss": "To live in, with my family. I want a 2BHK."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "சரி, family-க்கு 2BHK. ஒரு தடவை site-அ நேர்ல வந்து பாக்கலாமா?",
        "start": 16.76,
        "gloss": "Okay, a 2BHK for the family. Would you like to come and see the site once?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "ஆமா, இந்த Sunday வரலாமா?",
        "start": 21.22,
        "gloss": "Yes, can I come this Sunday?"
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "Sunday காலை 10 மணிக்கு slot இருக்கு, book பண்ணிட்டேன். எங்க team அங்க உங்களுக்காக wait பண்ணுவாங்க.",
        "start": 22.96,
        "gloss": "There’s a slot on Sunday at 10 in the morning; I’ve booked it. Our team will be waiting for you there."
      }
    ]
  },
  telugu: {
    "src": "/media/samples/telugu-switch.m4a",
    "seconds": 29,
    "from": "Hindi",
    "to": "Telugu",
    "languages": [
      "hi-IN",
      "te-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "Hello, कल doctor का appointment मिलेगा क्या?",
        "start": 0.2,
        "gloss": "Hello, can I get a doctor’s appointment tomorrow?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी हाँ, मिलेगा। कल शाम 5 बजे का slot खाली है, चलेगा?",
        "start": 2.9,
        "gloss": "Yes, you can. There’s a free slot tomorrow at 5 in the evening; does that work?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "తెలుగులో మాట్లాడొచ్చా? 5 గంటలు ఓకే.",
        "start": 6.78,
        "gloss": "Can I speak in Telugu? 5 o’clock is okay."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "అలాగే అండి, తెలుగులోనే మాట్లాడుదాం! Patient పేరు చెప్పండి.",
        "start": 10.31,
        "gloss": "Sure, let’s talk in Telugu! Tell me the patient’s name."
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "రవి కుమార్. నా కోసమే.",
        "start": 13.24,
        "gloss": "Ravi Kumar. It’s for me."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే అండి. Doctor గారికి చెప్పడానికి, ఏం problem అని కొంచెం చెప్తారా?",
        "start": 15.24,
        "gloss": "Okay. So I can tell the doctor, could you say briefly what the problem is?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "మూడు రోజులుగా జ్వరం, దగ్గు ఉన్నాయి అండి.",
        "start": 19.89,
        "gloss": "I’ve had fever and cough for three days."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే రవి గారు, రేపు సాయంత్రం 5 కి book అయింది. 10 నిమిషాలు ముందే రండి.",
        "start": 22.83,
        "gloss": "Okay Ravi garu, you’re booked for 5 in the evening tomorrow. Please come 10 minutes early."
      }
    ]
  },
  kannada: {
    "src": "/media/samples/kannada-switch.m4a",
    "seconds": 33,
    "from": "Hindi",
    "to": "Kannada",
    "languages": [
      "hi-IN",
      "kn-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "Hello, Whitefield के पास 2BHK फ्लैट मिलेगा?",
        "start": 0.2,
        "gloss": "Hello, can I get a 2BHK flat near Whitefield?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी हाँ, मिलेगा! Whitefield के पास 2BHK के कुछ options हैं।",
        "start": 3.1,
        "gloss": "Yes, you can! There are some 2BHK options near Whitefield."
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡ್ಬಹುದಾ? ನಂಗೆ ಅದೇ easy.",
        "start": 7.9,
        "gloss": "Can we talk in Kannada? That’s easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಖಂಡಿತ, ಕನ್ನಡದಲ್ಲೇ ಮಾತಾಡೋಣ! ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಹೇಳ್ತೀರಾ?",
        "start": 10.36,
        "gloss": "Of course, let’s talk in Kannada! Could you tell me your budget?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಸುಮಾರು 80 lakh ಒಳಗೆ. 6 ತಿಂಗಳಲ್ಲಿ shift ಆಗ್ಬೇಕು.",
        "start": 14.7,
        "gloss": "Under about 80 lakh. I need to move in within 6 months."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಸರಿ, 80 lakh ಒಳಗೆ, 6 ತಿಂಗಳಲ್ಲಿ. ಒಂದ್ಸಲ site visit ಮಾಡ್ತೀರಾ?",
        "start": 18.36,
        "gloss": "Okay, under 80 lakh, within 6 months. Would you like to do a site visit?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಹೌದು, ಈ weekend ಆಗುತ್ತಾ? ಶನಿವಾರ ಆದ್ರೆ ಒಳ್ಳೇದು.",
        "start": 23.44,
        "gloss": "Yes, is this weekend possible? Saturday would be good."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಆಗುತ್ತೆ. ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 11ಕ್ಕೆ book ಮಾಡಿದೀನಿ. ನಮ್ಮ team site-ಅಲ್ಲಿ ಇರುತ್ತೆ.",
        "start": 27.17,
        "gloss": "It is. I’ve booked Saturday at 11 in the morning. Our team will be at the site."
      }
    ]
  },
  malayalam: {
    "src": "/media/samples/malayalam-switch.m4a",
    "seconds": 29,
    "from": "Hindi",
    "to": "Malayalam",
    "languages": [
      "hi-IN",
      "ml-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "नमस्ते, Kochi में 2BHK flat मिलेगा? मैं Dubai से बोल रहा हूँ।",
        "start": 0.2,
        "gloss": "Hello, can I get a 2BHK flat in Kochi? I’m calling from Dubai."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "जी हाँ, Kakkanad area में 2BHK के options हैं।",
        "start": 4.82,
        "gloss": "Yes, there are 2BHK options in the Kakkanad area."
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "മലയാളത്തിൽ സംസാരിക്കാമോ? അതാ എളുപ്പം.",
        "start": 8.87,
        "gloss": "Can I speak in Malayalam? That’s easier."
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "പിന്നെന്താ, മലയാളത്തിൽ സംസാരിക്കാം! Budget എത്രയാ?",
        "start": 11.09,
        "gloss": "Of course, let’s speak in Malayalam! What’s the budget?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ഏകദേശം 70 lakh. അടുത്ത മാസം നാട്ടിൽ വരും, അപ്പോ site visit പറ്റുമോ?",
        "start": 14.21,
        "gloss": "About 70 lakh. I’m coming home next month; can we do a site visit then?"
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "പറ്റും. ഏതൊക്കെ dates-ൽ ആണ് നാട്ടിൽ ഉണ്ടാവുക?",
        "start": 18.75,
        "gloss": "Yes. Which dates will you be home?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "അടുത്ത മാസം 10 മുതൽ 20 വരെ.",
        "start": 21.21,
        "gloss": "From the 10th to the 20th of next month."
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "ഓക്കേ, 10 മുതൽ 20 വരെ. അതിനിടയിൽ ഒരു ദിവസം visit fix ചെയ്ത് confirm ചെയ്യാം.",
        "start": 23.61,
        "gloss": "Okay, the 10th to the 20th. We’ll fix a visit on one of those days and confirm it with you."
      }
    ]
  },
  gujarati: {
    "src": "/media/samples/gujarati-switch.m4a",
    "seconds": 31,
    "from": "Hindi",
    "to": "Gujarati",
    "languages": [
      "hi-IN",
      "gu-IN"
    ],
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
        "lang": "hi-IN",
        "native": "हाँ हाँ, पता है, याद है मुझे।",
        "start": 7.53,
        "gloss": "Yes, yes, I know, I remember."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "ગુજરાતીમાં વાત કરીએ? સોમવાર સુધીમાં transfer કરી દઈશ.",
        "start": 9.73,
        "gloss": "Shall we talk in Gujarati? I’ll transfer it by Monday."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "હા, ચોક્કસ, ગુજરાતીમાં વાત કરીએ! તો સોમવાર payment date તરીકે note કરી લીધું.",
        "start": 12.62,
        "gloss": "Yes, of course, let’s talk in Gujarati! So I’ve noted Monday as the payment date."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "અને હા, account statement પણ email પર મોકલી દેજો ને.",
        "start": 17.73,
        "gloss": "And yes, please send the account statement by email too."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "હા, ચોક્કસ. Request note કરી લીધી છે, accounts team email પર મોકલી દેશે.",
        "start": 21.13,
        "gloss": "Yes, sure. I’ve noted the request; the accounts team will email it."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "સારું, આભાર.",
        "start": 25.67,
        "gloss": "Okay, thanks."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "આભાર મહેશભાઈ, તમારો દિવસ સારો જાય! આવજો.",
        "start": 27.02,
        "gloss": "Thank you Maheshbhai, have a good day! Bye."
      }
    ]
  },
  bengali: {
    "src": "/media/samples/bengali-switch.m4a",
    "seconds": 27,
    "from": "Hindi",
    "to": "Bengali",
    "languages": [
      "hi-IN",
      "bn-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "Hello, मेरा order कब तक आएगा?",
        "start": 0.2,
        "gloss": "Hello, when will my order arrive?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! मैं अभी check करती हूँ, आप order number बताइए?",
        "start": 2.19,
        "gloss": "Hello! Let me check right away; what’s the order number?"
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "বাংলায় বলি? Order number 5821.",
        "start": 5.52,
        "gloss": "Can I speak in Bengali? Order number 5821."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "হ্যাঁ, অবশ্যই বাংলায় বলুন! দেখে নিলাম, আপনার order আজ বিকেল 5টার মধ্যে পৌঁছে যাবে।",
        "start": 9.05,
        "gloss": "Yes, of course, go ahead in Bengali! I’ve checked: your order will arrive by 5 in the evening today."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "আমি তো 6টার আগে বাড়ি থাকব না। সন্ধ্যার দিকে দেওয়া যাবে?",
        "start": 14.65,
        "gloss": "I won’t be home before 6. Can it be delivered in the evening?"
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "আচ্ছা, কোনো চিন্তা নেই। 6টার পরে delivery-র request delivery team-এর জন্য note করে নিলাম।",
        "start": 17.92,
        "gloss": "Okay, no worries. I’ve noted a request for delivery after 6 for the delivery team."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "ঠিক আছে, অনেক ধন্যবাদ।",
        "start": 23.32,
        "gloss": "Okay, thanks a lot."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "আপনাকেও ধন্যবাদ, ভালো থাকবেন!",
        "start": 24.99,
        "gloss": "Thank you too, take care!"
      }
    ]
  },
  punjabi: {
    "src": "/media/samples/punjabi-switch.m4a",
    "seconds": 30,
    "from": "Hindi",
    "to": "Punjabi",
    "languages": [
      "hi-IN",
      "pa-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "Hello, Canada study visa की counselling कब मिल सकती है?",
        "start": 0.2,
        "gloss": "Hello, when can I get counselling for a Canada study visa?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! कल सुबह 11 बजे का slot खाली है। आपका IELTS हो गया?",
        "start": 3.26,
        "gloss": "Hello! There’s a free slot tomorrow at 11 in the morning. Have you done your IELTS?"
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰੀਏ? ਹਾਂ ਜੀ, 6.5 bands ਆਏ ਨੇ।",
        "start": 7.71,
        "gloss": "Can we talk in Punjabi? Yes, I got 6.5 bands."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਹਾਂ ਜੀ, ਜ਼ਰੂਰ! ਵਧੀਆ score ਹੈ। ਨਾਂ ਦੱਸ ਦਿਓ, 11 ਵਜੇ book ਕਰ ਦਿੰਦੀ ਹਾਂ।",
        "start": 11.81,
        "gloss": "Yes, of course! That’s a good score. Tell me your name and I’ll book 11 o’clock."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਜੀ, ਮੇਰਾ ਨਾਂ ਗੁਰਪ੍ਰੀਤ ਸਿੰਘ ਹੈ।",
        "start": 16.05,
        "gloss": "My name is Gurpreet Singh."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਠੀਕ ਆ ਗੁਰਪ੍ਰੀਤ ਜੀ, ਕੱਲ੍ਹ 11 ਵਜੇ book ਹੋ ਗਈ। IELTS scorecard ਨਾਲ ਲੈ ਆਇਓ।",
        "start": 18.15,
        "gloss": "Okay Gurpreet ji, you’re booked for 11 tomorrow. Please bring your IELTS scorecard."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਠੀਕ ਆ ਜੀ, scorecard ਲੈ ਆਵਾਂਗਾ। ਧੰਨਵਾਦ।",
        "start": 24.89,
        "gloss": "Okay, I’ll bring the scorecard. Thanks."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਧੰਨਵਾਦ ਜੀ, ਕੱਲ੍ਹ ਮਿਲਦੇ ਹਾਂ!",
        "start": 27.92,
        "gloss": "Thank you, see you tomorrow!"
      }
    ]
  },
  odia: {
    "src": "/media/samples/odia-switch.m4a",
    "seconds": 28,
    "from": "Hindi",
    "to": "Odia",
    "languages": [
      "hi-IN",
      "or-IN"
    ],
    "turns": [
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "नमस्ते, आपके institute में नया batch कब से शुरू हो रहा है?",
        "start": 0.2,
        "gloss": "Hello, when does the new batch start at your institute?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! अगले सोमवार से शुरू हो रहा है। आप किस class के लिए पूछ रहे हैं?",
        "start": 3.8,
        "gloss": "Hello! It starts next Monday. Which class are you asking about?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ଓଡ଼ିଆରେ କଥା ହେବା କି? ମୋ ପୁଅ ପାଇଁ, class 10।",
        "start": 8.13,
        "gloss": "Can we speak in Odia? It’s for my son, class 10."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ହଁ, ନିଶ୍ଚୟ, ଓଡ଼ିଆରେ କଥା ହେବା। କାଲି ସକାଳ 10ଟାରେ class 10ର demo class ଅଛି, book କରିଦେବି?",
        "start": 11.13,
        "gloss": "Yes, of course, let’s speak in Odia! There’s a class 10 demo class tomorrow at 10 in the morning; shall I book it?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ହଁ, କରିଦିଅନ୍ତୁ। ସେ ଆସିବ।",
        "start": 17.14,
        "gloss": "Yes, please do. He’ll come."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଠିକ୍ ଅଛି। ପିଲାର ନାଁ କଣ କହିବେ?",
        "start": 19.18,
        "gloss": "Okay. Could you tell me the child’s name?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ସୌରଭ ମହାନ୍ତି।",
        "start": 21.64,
        "gloss": "Sourav Mohanty."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ବାସ୍, ସୌରଭଙ୍କ demo class କାଲି ସକାଳ 10ଟାରେ book ହୋଇଗଲା। ଧନ୍ୟବାଦ!",
        "start": 22.75,
        "gloss": "Done, Sourav’s demo class is booked for 10 tomorrow morning. Thank you!"
      }
    ]
  },
}
