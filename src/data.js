export const LANGUAGES = [
  { id: "en-US", name: "US English", flag: "🇺🇸", market: "United States", level: "A2", focus: "clear global business English, discovery calls and closing" },
  { id: "en-GB", name: "UK English", flag: "🇬🇧", market: "United Kingdom", level: "A1", focus: "British business tone, polite phrasing and vocabulary" },
  { id: "en-AU", name: "Australian English", flag: "🇦🇺", market: "Australia", level: "A1", focus: "natural Australian conversation and professional rapport" },
  { id: "de-DE", name: "German", flag: "🇩🇪", market: "Germany / Austria / Switzerland", level: "A0", focus: "introductions, polite business phrases and marketing vocabulary" },
  { id: "ja-JP", name: "Japanese", flag: "🇯🇵", market: "Japan", level: "A0", focus: "polite introductions and business etiquette" },
  { id: "fr-FR", name: "French", flag: "🇫🇷", market: "France / Francophone markets", level: "A0", focus: "greetings, introductions and professional courtesy" },
  { id: "ru-RU", name: "Russian", flag: "🇷🇺", market: "Russian-speaking markets", level: "A0", focus: "Cyrillic, greetings and basic introductions" },
  { id: "zh-CN", name: "Mandarin Chinese", flag: "🇨🇳", market: "Mandarin-speaking markets", level: "A0", focus: "tones, pinyin, greetings and simple business introductions" },
  { id: "en-SG", name: "Singapore Business English", flag: "🇸🇬", market: "Singapore", level: "A1", focus: "international business English and Singapore business etiquette" },
  { id: "ar-AE", name: "Arabic (Gulf focus)", flag: "🇦🇪", market: "UAE / Gulf", level: "A0", focus: "Arabic greetings, polite phrases and Gulf business context" },
  { id: "it-IT", name: "Italian", flag: "🇮🇹", market: "Italy", level: "A0", focus: "introductions and marketing vocabulary" },
  { id: "es-ES", name: "Spanish", flag: "🇪🇸", market: "Spain / Latin America", level: "A0", focus: "introductions, questions and sales conversations" },
  { id: "pt-BR", name: "Portuguese (Brazil)", flag: "🇧🇷", market: "Brazil / Portugal", level: "A0", focus: "Brazilian Portuguese pronunciation and introductions" },
  { id: "en-CA", name: "Canadian English", flag: "🇨🇦", market: "Canada", level: "A1", focus: "clear North American business English" },
  { id: "en-NZ", name: "New Zealand English", flag: "🇳🇿", market: "New Zealand", level: "A1", focus: "natural professional conversation" }
];

export const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
export const MODES = [
  { id: "daily", label: "Daily conversation", icon: "☕" },
  { id: "business", label: "Win a client", icon: "🤝" },
  { id: "interview", label: "Job interview", icon: "💼" },
  { id: "travel", label: "Travel & culture", icon: "🌍" },
  { id: "exam", label: "Level assessment", icon: "🎯" }
];

export const ROADMAP = [
  { month: 1, title: "International English", languages: "US / UK / Australian / Canadian / Singapore / New Zealand English", milestone: "3-minute introduction + 10-minute mock discovery call" },
  { month: 2, title: "German foundations", languages: "German", milestone: "Introduce yourself and describe your agency simply" },
  { month: 3, title: "French foundations", languages: "French", milestone: "2-minute introduction and short prospect message" },
  { month: 4, title: "Spanish foundations", languages: "Spanish", milestone: "5-minute beginner conversation" },
  { month: 5, title: "Arabic foundations", languages: "Arabic (Modern Standard + Gulf expressions)", milestone: "Greetings and simple business introduction" },
  { month: 6, title: "Review and sales practice", languages: "English + review German/French/Spanish/Arabic", milestone: "15-minute mock client meeting and proposal" },
  { month: 7, title: "Italian foundations", languages: "Italian", milestone: "Explain three agency services simply" },
  { month: 8, title: "Portuguese foundations", languages: "Brazilian Portuguese", milestone: "2-minute introduction and outreach draft" },
  { month: 9, title: "Japanese foundations", languages: "Japanese", milestone: "Polite introduction and essential greetings" },
  { month: 10, title: "Mandarin foundations", languages: "Mandarin Chinese", milestone: "Basic introduction and common greetings" },
  { month: 11, title: "Russian foundations", languages: "Russian", milestone: "Read basic Cyrillic and introduce yourself" },
  { month: 12, title: "Consolidation", languages: "All selected languages", milestone: "Portfolio of introductions, outreach templates and next-year priorities" }
];

export function makeTutorPrompt({ language, level, mode, correction, nativeSupport }) {
  return `You are GlobalTalk AI, an adaptive multilingual language tutor and international business role-play partner.
TARGET LANGUAGE: ${language.name} (${language.market}). LEARNER LEVEL: ${level}. SESSION MODE: ${mode}.
The learner is building language skills to win international clients for a digital marketing agency called Askus Studio.
BEHAVIOUR:
- Speak naturally in the target language; keep the first sentence and questions appropriate for the learner's level.
- Be proactive: ask one clear question at a time, follow up on the learner's answer, and never wait passively for the learner to invent a topic.
- Adapt difficulty: A0/A1 = short phrases and patient repetition; A2/B1 = longer answers and everyday scenarios; B2/C1/C2 = nuanced, fast, culturally aware, challenging conversation.
- In business mode, act as a realistic prospect/client. Ask about goals, budget, current marketing, timelines, decision-making and expected results. Include objections and negotiation as level rises.
- Correct mistakes supportively. After a learner turn, briefly model a more natural version and explain at most 1-3 high-value corrections. Do not interrupt every sentence; keep conversation flowing.
- ${correction ? "After each user turn, give concise corrections and an improved version." : "Prioritize conversational flow; save detailed corrections for pauses or when asked."}
- ${nativeSupport ? "If the learner is stuck, briefly explain in English, then return to the target language." : "Stay in the target language unless the learner explicitly asks for help."}
- For pronunciation, give practical phoneme/stress/intonation tips based on the spoken input and transcript. Do not claim a precise phonetic score unless you can justify it.
- For assessment mode, ask one question at a time, cover comprehension, vocabulary, grammar, fluency and task completion, then give an estimated level with evidence and a short next-step plan. Label estimates as informal, not official CEFR certification.
- Maintain a warm, encouraging, professional tone. Avoid long monologues. End each turn with one relevant question unless delivering a final session summary.
- Never claim to save progress yourself; the app records session metadata after the user ends the session.`;
}
