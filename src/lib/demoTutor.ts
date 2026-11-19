/**
 * Demo-mode tutor: a small rule-based stand-in for the AI tutor, used when
 * Firebase has not been configured yet. It keeps every UI flow testable
 * offline: it answers sensibly, asks follow-up questions, and the correction
 * engine catches common learner mistakes.
 */
import type { CorrectionReportData, Settings, VocabItem } from './types';

const GREETINGS: Record<string, string[]> = {
  'Sehari-hari': [
    "Hi! Great to see you. How was your day today? Tell me one thing you did this morning.",
    "Hello! Let's chat. What did you eat for breakfast today?",
  ],
  Kerja: [
    "Hi! Let's practise work English. What do you do for work? Tell me about your job in two or three sentences.",
    "Hello! Imagine we are colleagues. How would you introduce yourself to a new coworker?",
  ],
  Traveling: [
    "Hi! Let's plan a trip together. If you could visit any country tomorrow, where would you go — and why?",
    "Hello! You are at an airport. How would you ask where the gate for your flight is?",
  ],
  Sekolah: [
    "Hi! Let's talk about school. What is your favourite subject, and why do you like it?",
    "Hello! Tell me about your teacher. What makes a good teacher, in your opinion?",
  ],
};

const FOLLOW_UPS = [
  'Nice! Can you tell me more about that?',
  'Interesting! Why do you think so?',
  'Good! Now try to say it again using a full sentence.',
  'I see. What happened next?',
  'Great job! Can you give me an example?',
  'That sounds good. How did you feel about it?',
];

const TOPIC_WORDS: Record<string, string[]> = {
  'Sehari-hari': ['morning', 'breakfast', 'family', 'weekend', 'hobby'],
  Kerja: ['meeting', 'colleague', 'deadline', 'project', 'office'],
  Traveling: ['journey', 'ticket', 'hotel', 'luggage', 'destination'],
  Sekolah: ['lesson', 'homework', 'teacher', 'classmate', 'exam'],
};

const BUILTIN_VOCAB: VocabItem[] = [
  { word: 'journey', meaning: 'perjalanan', example: 'We had a long journey to the beach.' },
  { word: 'deadline', meaning: 'tenggat waktu', example: 'The deadline for this report is Friday.' },
  { word: 'delicious', meaning: 'lezat / enak', example: 'The food at that restaurant is delicious.' },
  { word: 'borrow', meaning: 'meminjam', example: 'Can I borrow your pen, please?' },
  { word: 'improve', meaning: 'meningkatkan / memperbaiki', example: 'I want to improve my English every day.' },
  { word: 'schedule', meaning: 'jadwal', example: 'What is your schedule for tomorrow?' },
  { word: 'confident', meaning: 'percaya diri', example: 'She feels confident when she speaks English.' },
  { word: 'neighborhood', meaning: 'lingkungan / sekitar rumah', example: 'There is a nice park in my neighborhood.' },
  { word: 'appointment', meaning: 'janji / pertemuan terjadwal', example: 'I have a doctor’s appointment at 10 a.m.' },
  { word: 'useful', meaning: 'berguna', example: 'This app is very useful for learning English.' },
];

export function builtinVocab(): VocabItem[] {
  return [...BUILTIN_VOCAB];
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

/** Generate a friendly tutor reply without any network or model. */
export function demoReply(settings: Settings, userText: string, turnCount: number): string {
  const text = userText.trim();
  if (turnCount === 0) {
    return pick(GREETINGS[settings.topic] ?? GREETINGS['Sehari-hari'], text.length);
  }
  const lower = text.toLowerCase();
  const words = TOPIC_WORDS[settings.topic] ?? [];
  const usedWord = words.find((w) => lower.includes(w));

  if (/\b(yes|yeah|yep)\b/.test(lower) && text.split(/\s+/).length <= 3) {
    return 'Good! Now try a longer answer: "Yes, I ..." — tell me a little more. For example: "Yes, I like it because..."';
  }
  if (text.split(/\s+/).length < 4) {
    return 'Good start! Try to make a longer sentence. ' + pick(FOLLOW_UPS, text.length + turnCount);
  }
  if (usedWord) {
    return `Nice — you used the word "${usedWord}"! ${pick(FOLLOW_UPS, text.length + turnCount)}`;
  }
  if (lower.includes('?')) {
    return 'Good question! Here is my answer: it depends on the situation, but in general, yes — that is a natural way to say it. Now, what do you think? ' + pick(FOLLOW_UPS, turnCount);
  }
  const encouragement =
    settings.style === 'Tegas'
      ? 'Good. Keep your sentences complete — subject + verb + the rest.'
      : settings.style === 'Menyemangati'
        ? 'Hebat! You are doing really well — keep going!'
        : 'Nice, I understand you!';
  return `${encouragement} ${pick(FOLLOW_UPS, text.length + turnCount)}`;
}

interface Rule {
  test: (sentence: string) => boolean;
  original: (sentence: string) => string;
  corrected: (sentence: string) => string;
  explanation: string;
}

const RULES: Rule[] = [
  {
    test: (s) => /\bi am go\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bi am go\b/gi, 'I am going'),
    explanation: 'Untuk kegiatan yang sedang berlangsung, gunakan "am going", bukan "am go".',
  },
  {
    test: (s) => /\b(he|she|it) (don't|doesnt)\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\b(he|she|it) (don't|doesnt)\b/gi, '$1 doesn’t'),
    explanation: 'Untuk he/she/it, bentuk negatifnya adalah "doesn’t", bukan "don’t".',
  },
  {
    test: (s) => /\b(he|she|it) (go|like|want|work|live|play|eat)\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\b(he|she|it) (go|like|want|work|live|play|eat)\b/gi, (_, p: string, v: string) => `${p} ${v}s`),
    explanation: 'Kata kerja setelah he/she/it memakai akhiran -s: "he goes", "she likes".',
  },
  {
    test: (s) => /\ba (apple|orange|umbrella|hour|idea|animal|egg)\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\ba (apple|orange|umbrella|hour|idea|animal|egg)\b/gi, 'an $1'),
    explanation: 'Gunakan "an" sebelum kata yang diawali bunyi vokal, misalnya "an apple".',
  },
  {
    test: (s) => /\ban (university|user|uniform|one|european)\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\ban (university|user|uniform|one|european)\b/gi, 'a $1'),
    explanation: 'Gunakan "a" bila kata diawali bunyi konsonan /j/ atau /w/, misalnya "a university".',
  },
  {
    test: (s) => /\bi have (\d+) years old\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bi have (\d+) years old\b/gi, 'I am $1 years old'),
    explanation: 'Umur dalam bahasa Inggris memakai "be": "I am 20 years old", bukan "I have".',
  },
  {
    test: (s) => /\byesterday i (go|come|see|eat|buy|take)\b/i.test(s),
    original: (s) => s,
    corrected: (s) =>
      s.replace(/\byesterday i (go|come|see|eat|buy|take)\b/gi, (_m, v: string) => {
        const past: Record<string, string> = { go: 'went', come: 'came', see: 'saw', eat: 'ate', buy: 'bought', take: 'took' };
        return `yesterday I ${past[v.toLowerCase()] ?? `${v}ed`}`;
      }),
    explanation: 'Kata "yesterday" menandakan masa lalu, jadi kata kerjanya harus bentuk past tense.',
  },
  {
    test: (s) => /\bmore better\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bmore better\b/gi, 'better'),
    explanation: '"Better" sudah bentuk perbandingan — tidak perlu "more" di depannya.',
  },
  {
    test: (s) => /\bi very like\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bi very like\b/gi, 'I like very much'),
    explanation: '"Very" tidak diletakkan sebelum "like". Pakai "I like ... very much".',
  },
  {
    test: (s) => /\bi am agree\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bi am agree\b/gi, 'I agree'),
    explanation: '"Agree" adalah kata kerja, jadi tidak memakai "am": cukup "I agree".',
  },
  {
    test: (s) => /\bdiscuss about\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\bdiscuss about\b/gi, 'discuss'),
    explanation: '"Discuss" tidak memakai "about" setelahnya: "discuss the problem".',
  },
  {
    test: (s) => /\binformations\b/i.test(s),
    original: (s) => s,
    corrected: (s) => s.replace(/\binformations\b/gi, 'information'),
    explanation: '"Information" tidak bisa dihitung — tidak ada bentuk jamak "informations".',
  },
];

/**
 * Build a correction report from the transcript using the rules above.
 * Sentences without a matching rule are treated as correct.
 */
export function demoCorrectionReport(userSentences: string[]): CorrectionReportData {
  const corrections: CorrectionReportData['corrections'] = [];
  const seen = new Set<string>();
  for (const raw of userSentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    for (const rule of RULES) {
      if (rule.test(sentence)) {
        const corrected = rule.corrected(sentence);
        if (corrected !== sentence && !seen.has(corrected.toLowerCase())) {
          seen.add(corrected.toLowerCase());
          corrections.push({ original: sentence, corrected, explanation: rule.explanation });
        }
        break;
      }
    }
  }

  const betterPhrases: CorrectionReportData['betterPhrases'] = [];
  const joined = userSentences.join(' ').toLowerCase();
  if (/\bvery good\b/.test(joined)) {
    betterPhrases.push({ original: 'very good', better: 'excellent / wonderful' });
  }
  if (/\bvery big\b/.test(joined)) {
    betterPhrases.push({ original: 'very big', better: 'huge / enormous' });
  }
  if (/\bi think\b/.test(joined)) {
    betterPhrases.push({ original: 'I think', better: 'In my opinion / I believe' });
  }

  const total = userSentences.length;
  const errors = corrections.length;
  const score = total === 0 ? 0 : Math.max(40, Math.round(100 - (errors / total) * 40));
  const levelEstimate = score >= 90 ? 'B1' : score >= 75 ? 'A2+' : score >= 60 ? 'A2' : 'A1';
  const newVocab = BUILTIN_VOCAB.slice(0, 4);

  return {
    corrections,
    betterPhrases,
    newVocab,
    levelEstimate,
    score,
    summary:
      corrections.length === 0
        ? 'Bagus! Tidak ada kesalahan pola umum yang terdeteksi di sesi ini. Terus latih kalimat yang lebih panjang dan kosakata baru.'
        : `Ditemukan ${corrections.length} pola kesalahan umum dari ${total} kalimat. Perbaiki polanya satu per satu, lalu coba lagi di sesi berikutnya.`,
  };
}
