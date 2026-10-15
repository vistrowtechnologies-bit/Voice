// Two-speaker sample calls for the /languages pages: the caller starts in
// Hindi and switches to the page's language at turn 3 (Hindi page: to
// English), and the agent follows. Lines drafted with Sarvam
// sarvam-105b-conversations and reviewed; voiced with Sarvam bulbul:v4-flash
// (agent ritu_hi_customer, caller shubh_hi_customer, pace 0.85). `start` is
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
  hindi: {
    "src": "/media/samples/hindi-switch.m4a",
    "seconds": 40,
    "from": "Hindi",
    "to": "English",
    "languages": [
      "hi-IN",
      "en-IN"
    ],
    "turns": [
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते राहुल जी, मैं Saarthi Finance से Artha बोल रही हूँ। आपकी इस महीने की EMI 15 तारीख को due है, बस याद दिलाने के लिए call किया। क्या आपके पास एक minute है?",
        "start": 0.25,
        "gloss": "Hello Rahul ji, this is Artha from Saarthi Finance. Your EMI for this month is due on the 15th; I just called to remind you. Do you have a minute?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ, पता है। मेरी salary 12 तारीख को आती है।",
        "start": 13.09,
        "gloss": "Yes, I know. My salary comes on the 12th."
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Sorry, can we continue in English? It’s easier for me on calls.",
        "start": 16.29
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Of course, happy to continue in English. By which date will you make the payment?",
        "start": 20.13
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "By the 13th. I’ll pay through the app as soon as my salary comes in.",
        "start": 25.17
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "Thanks. I’ve noted payment by the 13th through the app for our collections team.",
        "start": 30.16
      },
      {
        "speaker": "Caller",
        "lang": "en-IN",
        "native": "Okay, that’s fine. Thanks for the reminder.",
        "start": 35.32
      },
      {
        "speaker": "Agent",
        "lang": "en-IN",
        "native": "You’re welcome, Rahul ji. Have a good day.",
        "start": 37.77
      }
    ]
  },
  marathi: {
    "src": "/media/samples/marathi-switch.m4a",
    "seconds": 46,
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
        "native": "Hello, कल सुबह घर से blood sample collect हो सकता है क्या?",
        "start": 0.25,
        "gloss": "Hello, can a blood sample be collected from home tomorrow morning?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! जी हाँ, कल सुबह 7 से 9 के बीच का slot available है।",
        "start": 4.4,
        "gloss": "Hello! Yes, a slot between 7 and 9 tomorrow morning is available."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "Actually, आपण मराठीत बोलूया का? माझा address Kothrud मधला आहे.",
        "start": 10.38,
        "gloss": "Actually, can we speak in Marathi? My address is in Kothrud."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "हो, नक्की मराठीत बोलूया. तुमचा पूर्ण address आणि pin code सांगाल का?",
        "start": 14.66,
        "gloss": "Yes, sure, let’s speak in Marathi. Could you tell me your full address and pin code?"
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "Kothrud, pin code 411038. आणि या test साठी fasting लागेल का?",
        "start": 19.56,
        "gloss": "Kothrud, pin code 411038. And is fasting needed for this test?"
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "Lab च्या instructions नुसार 10 तास fasting आवश्यक आहे. रात्री 9 नंतर काही खाऊ नका, पाणी चालेल.",
        "start": 27.22,
        "gloss": "As per the lab’s instructions, 10 hours of fasting is needed. Don’t eat anything after 9 at night; water is fine."
      },
      {
        "speaker": "Caller",
        "lang": "mr-IN",
        "native": "ठीक आहे, मग उद्याचा 7 ते 9 चा slot book करा.",
        "start": 35.29,
        "gloss": "Okay, then please book tomorrow’s 7 to 9 slot."
      },
      {
        "speaker": "Agent",
        "lang": "mr-IN",
        "native": "झालं, उद्याचा 7 ते 9 चा slot book झाला आहे. आमची team तुमच्या Kothrud च्या address वर येईल.",
        "start": 38.88,
        "gloss": "Done, tomorrow’s 7 to 9 slot is booked. Our team will come to your Kothrud address."
      }
    ]
  },
  tamil: {
    "src": "/media/samples/tamil-switch.m4a",
    "seconds": 40,
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
        "native": "नमस्ते कार्तिक जी, मैं Artha बोल रही हूँ। आपने OMR project के लिए enquiry की थी, दो मिनट बात कर सकते हैं?",
        "start": 0.25,
        "gloss": "Hello Karthik ji, this is Artha. You had enquired about the OMR project; can we talk for two minutes?"
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ जी, बताइए, मैं सुन रहा हूँ।",
        "start": 7.71,
        "gloss": "Yes, go ahead, I’m listening."
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "தமிழ்ல பேசலாமா? அது எனக்கு கொஞ்சம் easy-ஆ இருக்கும்.",
        "start": 9.64,
        "gloss": "Can we speak in Tamil? That’s a bit easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "கண்டிப்பா, தமிழ்லயே பேசலாம். நீங்க சொந்தமா இருக்கவா, investment-க்கா பாக்குறீங்க? எந்த size வேணும்?",
        "start": 12.04,
        "gloss": "Of course, let’s speak in Tamil. Are you looking to live in it yourself, or as an investment? Which size do you want?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "சொந்தமா இருக்க, family-ஓட. எனக்கு 2BHK வேணும்.",
        "start": 19.06,
        "gloss": "To live in, with my family. I want a 2BHK."
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "சரி, சொந்தமா இருக்க 2BHK. நீங்க site-க்கு நேர்ல வந்து பார்க்க விரும்புறீங்களா?",
        "start": 23.04,
        "gloss": "Okay, a 2BHK to live in. Would you like to come and see the site in person?"
      },
      {
        "speaker": "Caller",
        "lang": "ta-IN",
        "native": "ஆமா, ஞாயிற்றுக்கிழமை site visit பண்ணலாமா?",
        "start": 29.4,
        "gloss": "Yes, can I do a site visit on Sunday?"
      },
      {
        "speaker": "Agent",
        "lang": "ta-IN",
        "native": "ஞாயிறு காலை 10 மணிக்கு slot free-ஆ இருக்கு, உங்களுக்காக book பண்ணிட்டேன். எங்க team உங்கள site-ல சந்திப்பாங்க.",
        "start": 32.13,
        "gloss": "There’s a free slot on Sunday at 10 in the morning; I’ve booked it for you. Our team will meet you at the site."
      }
    ]
  },
  telugu: {
    "src": "/media/samples/telugu-switch.m4a",
    "seconds": 37,
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
        "native": "Hello, क्या मुझे कल doctor का appointment मिल सकता है?",
        "start": 0.25,
        "gloss": "Hello, can I get an appointment with the doctor tomorrow?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! जी हाँ, कल शाम 5 बजे का slot free है। वो time आपको ठीक रहेगा?",
        "start": 3.3,
        "gloss": "Hello! Yes, there’s a free slot tomorrow at 5 in the evening. Will that time work for you?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "తెలుగులో మాట్లాడొచ్చా? సాయంత్రం 5 గంటలు నాకు ఓకే.",
        "start": 9.65,
        "gloss": "Can I speak in Telugu? 5 in the evening is okay for me."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "తప్పకుండా అండి, తెలుగులోనే మాట్లాడుదాం. Patient పేరు చెప్తారా?",
        "start": 13.52,
        "gloss": "Of course, let’s talk in Telugu. Could you tell me the patient’s name?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "నా పేరు రవి కుమార్. Appointment నా కోసమే.",
        "start": 18.21,
        "gloss": "My name is Ravi Kumar. The appointment is for me."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే అండి. Doctor గారికి తెలియడానికి, visit దేనికోసమో కొంచెం చెప్తారా?",
        "start": 21.11,
        "gloss": "Okay. So the doctor knows, could you tell me briefly what the visit is for?"
      },
      {
        "speaker": "Caller",
        "lang": "te-IN",
        "native": "గత 3 రోజులుగా జ్వరం, దగ్గు ఉన్నాయి.",
        "start": 26.34,
        "gloss": "I’ve had a fever and cough for the last 3 days."
      },
      {
        "speaker": "Agent",
        "lang": "te-IN",
        "native": "సరే రవి గారు, రేపు సాయంత్రం 5 గంటలకు మీ appointment book అయింది. 10 నిమిషాలు ముందు రండి.",
        "start": 30.77,
        "gloss": "Okay Ravi garu, your appointment is booked for 5 in the evening tomorrow. Please come 10 minutes early."
      }
    ]
  },
  kannada: {
    "src": "/media/samples/kannada-switch.m4a",
    "seconds": 39,
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
        "native": "Hello, Whitefield के पास 2BHK फ्लैट मिलेगा क्या?",
        "start": 0.25,
        "gloss": "Hello, can I get a 2BHK flat near Whitefield?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! जी हाँ, Whitefield के पास 2BHK options हैं।",
        "start": 4.04,
        "gloss": "Hello! Yes, there are 2BHK options near Whitefield."
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡಬಹುದಾ? ನನಗೆ ಅದು ಸ್ವಲ್ಪ easy ಆಗುತ್ತೆ.",
        "start": 8.66,
        "gloss": "Can we talk in Kannada? That’s a bit easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಖಂಡಿತ, ಕನ್ನಡದಲ್ಲೇ ಮಾತಾಡೋಣ. ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಹೇಳ್ತೀರಾ?",
        "start": 11.9,
        "gloss": "Of course, let’s talk in Kannada. Could you tell me your budget?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಸುಮಾರು 80 lakh ಒಳಗೆ. 6 ತಿಂಗಳಲ್ಲಿ shift ಆಗಬೇಕು.",
        "start": 16.66,
        "gloss": "Under about 80 lakh. I need to move in within 6 months."
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಸರಿ, 80 lakh ಒಳಗೆ, 6 ತಿಂಗಳಲ್ಲಿ shift. ನಿಮಗೆ site visit ಬೇಕಾ?",
        "start": 20.56,
        "gloss": "Okay: under 80 lakh, moving in within 6 months. Would you like a site visit?"
      },
      {
        "speaker": "Caller",
        "lang": "kn-IN",
        "native": "ಹೌದು, ಈ weekend-ನಲ್ಲಿ ಮಾಡಬಹುದಾ?",
        "start": 26.24,
        "gloss": "Yes, can it be this weekend?"
      },
      {
        "speaker": "Agent",
        "lang": "kn-IN",
        "native": "ಖಂಡಿತ. ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 11 ಗಂಟೆಗೆ slot free ಇದೆ, ನಿಮಗಾಗಿ book ಮಾಡಿದ್ದೀನಿ. ನಮ್ಮ team site-ನಲ್ಲಿ ನಿಮ್ಮನ್ನ meet ಮಾಡುತ್ತೆ.",
        "start": 28.49,
        "gloss": "Of course. There’s a free slot on Saturday at 11 in the morning; I’ve booked it for you. Our team will meet you at the site."
      }
    ]
  },
  malayalam: {
    "src": "/media/samples/malayalam-switch.m4a",
    "seconds": 41,
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
        "native": "नमस्ते, Kochi में 2BHK flat मिलेगा क्या? मैं Dubai से call कर रहा हूँ।",
        "start": 0.25,
        "gloss": "Hello, can I get a 2BHK flat in Kochi? I’m calling from Dubai."
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! जी हाँ, Kakkanad area में 2BHK के options हैं।",
        "start": 6.16,
        "gloss": "Hello! Yes, there are 2BHK options in the Kakkanad area."
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "മലയാളത്തിൽ സംസാരിക്കാമോ? അതാണ് എനിക്ക് എളുപ്പം.",
        "start": 11.59,
        "gloss": "Can I speak in Malayalam? That’s easier for me."
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "തീർച്ചയായും, മലയാളത്തിൽ സംസാരിക്കാം. നിങ്ങളുടെ budget എത്രയാണ്?",
        "start": 14.84,
        "gloss": "Of course, let’s speak in Malayalam. What is your budget?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "ഏകദേശം 70 lakh. അടുത്ത മാസം നാട്ടിൽ വരുന്നുണ്ട്, അപ്പോൾ site visit നടക്കുമോ?",
        "start": 19.66,
        "gloss": "About 70 lakh. I’m coming home next month; can we do a site visit then?"
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "തീർച്ചയായും. ഏത് dates-ൽ Kerala-യിൽ ഉണ്ടാകും എന്ന് പറയാമോ?",
        "start": 25.77,
        "gloss": "Certainly. Could you tell me which dates you will be in Kerala?"
      },
      {
        "speaker": "Caller",
        "lang": "ml-IN",
        "native": "അടുത്ത മാസം 10 മുതൽ 20 വരെ.",
        "start": 30.08,
        "gloss": "From the 10th to the 20th of next month."
      },
      {
        "speaker": "Agent",
        "lang": "ml-IN",
        "native": "മനസ്സിലായി, Kerala-യിൽ 10 മുതൽ 20 വരെ. അതിനിടയിൽ ഒരു ദിവസം site visit arrange ചെയ്ത് confirm ചെയ്യാം.",
        "start": 32.62,
        "gloss": "Got it: in Kerala from the 10th to the 20th. We’ll arrange a site visit on one of those days and confirm it with you."
      }
    ]
  },
  gujarati: {
    "src": "/media/samples/gujarati-switch.m4a",
    "seconds": 37,
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
        "native": "नमस्ते महेशभाई, मैं Artha बोल रही हूँ। इनवॉइस नंबर 1042 का payment 20 तारीख को due है, बस याद दिलाने के लिए call किया।",
        "start": 0.25,
        "gloss": "Hello Maheshbhai, this is Artha. The payment for invoice 1042 is due on the 20th; I just called to remind you."
      },
      {
        "speaker": "Caller",
        "lang": "hi-IN",
        "native": "हाँ जी, पता है।",
        "start": 9.98,
        "gloss": "Yes, I know."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "આપણે ગુજરાતીમાં વાત કરીએ? હું સોમવાર સુધીમાં transfer કરી દઈશ.",
        "start": 11.77,
        "gloss": "Shall we talk in Gujarati? I’ll transfer it by Monday."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "ચોક્કસ, ગુજરાતીમાં જ વાત કરીએ. મેં સોમવાર payment date તરીકે note કરી લીધું છે.",
        "start": 16.11,
        "gloss": "Of course, let’s talk in Gujarati. I’ve noted Monday as the payment date."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "અને મારા email પર account statement પણ મોકલી આપજો.",
        "start": 22.86,
        "gloss": "And please send the account statement to my email too."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "મેં તમારી request note કરી લીધી છે, accounts team email પર statement મોકલી દેશે.",
        "start": 26.4,
        "gloss": "I’ve noted your request; the accounts team will email you the statement."
      },
      {
        "speaker": "Caller",
        "lang": "gu-IN",
        "native": "ઠીક છે, આભાર.",
        "start": 32.48,
        "gloss": "Okay, thanks."
      },
      {
        "speaker": "Agent",
        "lang": "gu-IN",
        "native": "આભાર મહેશભાઈ, તમારો દિવસ સારો રહે.",
        "start": 33.81,
        "gloss": "Thank you Maheshbhai, have a good day."
      }
    ]
  },
  bengali: {
    "src": "/media/samples/bengali-switch.m4a",
    "seconds": 35,
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
        "start": 0.25,
        "gloss": "Hello, when will my order arrive?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! मैं अभी check करती हूँ, आप अपना order number बता दीजिए।",
        "start": 2.56,
        "gloss": "Hello! Let me check right away; please tell me your order number."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "বাংলায় বলতে পারি? আমার order number 5821.",
        "start": 7.2,
        "gloss": "Can I speak in Bengali? My order number is 5821."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "নিশ্চয়ই, বাংলাতেই বলুন। দেখে নিলাম, আপনার order আজ বিকেল 5টার মধ্যে পৌঁছে যাবে।",
        "start": 12.64,
        "gloss": "Of course, go ahead in Bengali. I’ve checked: your order will arrive by 5 in the evening today."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "আমি 6টার আগে বাড়িতে থাকব না, তাহলে কি delivery-টা সন্ধ্যায় দেওয়া যাবে?",
        "start": 19.78,
        "gloss": "I won’t be home before 6, so can the delivery be made in the evening?"
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "ঠিক আছে, আমি delivery team-এর জন্য সন্ধ্যা 6টার পরে delivery-র request note করে নিলাম।",
        "start": 24.43,
        "gloss": "Okay, I’ve noted a request for delivery after 6 in the evening for the delivery team."
      },
      {
        "speaker": "Caller",
        "lang": "bn-IN",
        "native": "আচ্ছা, ঠিক আছে। অনেক ধন্যবাদ।",
        "start": 30.36,
        "gloss": "Okay, that’s fine. Thanks a lot."
      },
      {
        "speaker": "Agent",
        "lang": "bn-IN",
        "native": "আপনাকেও ধন্যবাদ, ভালো থাকবেন।",
        "start": 32.65,
        "gloss": "Thank you too, take care."
      }
    ]
  },
  punjabi: {
    "src": "/media/samples/punjabi-switch.m4a",
    "seconds": 36,
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
        "start": 0.25,
        "gloss": "Hello, when can I get counselling for a Canada study visa?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! कल सुबह 11 बजे का slot free है। आपका IELTS हो गया?",
        "start": 3.66,
        "gloss": "Hello! There’s a free slot tomorrow at 11 in the morning. Have you done your IELTS?"
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦੇ ਹਾਂ? ਹਾਂ ਜੀ, ਮੇਰੇ 6.5 bands ਆਏ ਨੇ।",
        "start": 8.88,
        "gloss": "Can we talk in Punjabi? Yes, I got 6.5 bands."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਹਾਂ ਜੀ, ਬਿਲਕੁਲ। ਇਹ ਵਧੀਆ score ਹੈ। ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ book ਕਰਨ ਲਈ ਆਪਣਾ ਨਾਂ ਦੱਸ ਦਿਓ।",
        "start": 13.65,
        "gloss": "Yes, of course. That’s a good score. Tell me your name so I can book 11 tomorrow morning."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਮੇਰਾ ਨਾਂ ਗੁਰਪ੍ਰੀਤ ਸਿੰਘ ਹੈ।",
        "start": 20.02,
        "gloss": "My name is Gurpreet Singh."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਗੁਰਪ੍ਰੀਤ ਜੀ, ਤੁਹਾਡੀ counselling ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ book ਹੋ ਗਈ ਹੈ। ਆਪਣਾ IELTS scorecard ਨਾਲ ਲੈ ਕੇ ਆਇਓ।",
        "start": 21.58,
        "gloss": "Gurpreet ji, your counselling is booked for 11 tomorrow morning. Please bring your IELTS scorecard."
      },
      {
        "speaker": "Caller",
        "lang": "pa-IN",
        "native": "ਠੀਕ ਹੈ ਜੀ, scorecard ਲੈ ਕੇ ਆਵਾਂਗਾ। ਬਹੁਤ ਧੰਨਵਾਦ।",
        "start": 29.32,
        "gloss": "Okay, I’ll bring the scorecard. Thank you very much."
      },
      {
        "speaker": "Agent",
        "lang": "pa-IN",
        "native": "ਧੰਨਵਾਦ ਜੀ, ਕੱਲ੍ਹ 11 ਵਜੇ ਮਿਲਦੇ ਹਾਂ।",
        "start": 32.74,
        "gloss": "Thank you, see you tomorrow at 11."
      }
    ]
  },
  odia: {
    "src": "/media/samples/odia-switch.m4a",
    "seconds": 36,
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
        "start": 0.25,
        "gloss": "Hello, when does the new batch start at your institute?"
      },
      {
        "speaker": "Agent",
        "lang": "hi-IN",
        "native": "नमस्ते! नया batch अगले सोमवार से शुरू होगा। आप किस class के लिए पूछ रहे हैं?",
        "start": 4.15,
        "gloss": "Hello! The new batch starts next Monday. Which class are you asking about?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ଆମେ ଓଡ଼ିଆରେ କଥା ହୋଇପାରିବା କି? ମୋ ପୁଅ ପାଇଁ, class 10।",
        "start": 9.85,
        "gloss": "Can we speak in Odia? It’s for my son, class 10."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ନିଶ୍ଚୟ, ଓଡ଼ିଆରେ କଥା ହେବା। କାଲି ସକାଳ 10ଟାରେ class 10ର demo class ଅଛି, book କରିଦେବି କି?",
        "start": 14.6,
        "gloss": "Of course, let’s speak in Odia. There’s a class 10 demo class tomorrow at 10 in the morning; shall I book it?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ହଁ, book କରିଦିଅନ୍ତୁ। ସେ ନିଶ୍ଚୟ ଆସିବ।",
        "start": 22.08,
        "gloss": "Yes, please book it. He will definitely come."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଠିକ୍ ଅଛି। ଛାତ୍ରଙ୍କ ନାଁ କଣ?",
        "start": 24.93,
        "gloss": "Okay. What is the student’s name?"
      },
      {
        "speaker": "Caller",
        "lang": "or-IN",
        "native": "ନାଁ ସୌରଭ ମହାନ୍ତି।",
        "start": 27.82,
        "gloss": "His name is Sourav Mohanty."
      },
      {
        "speaker": "Agent",
        "lang": "or-IN",
        "native": "ଠିକ୍ ଅଛି, ସୌରଭଙ୍କ demo class କାଲି ସକାଳ 10ଟାରେ book ହୋଇଗଲା। ଧନ୍ୟବାଦ।",
        "start": 29.71,
        "gloss": "Okay, Sourav’s demo class is booked for 10 tomorrow morning. Thank you."
      }
    ]
  },
}
