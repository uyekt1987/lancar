/**
 * Hybrid AI engine for Lancar (Firebase AI Logic).
 *
 * - Chat turns use PREFER_ON_DEVICE: Gemini Nano runs in the browser when
 *   available, and the SDK falls back to the cloud model otherwise.
 * - The correction report uses ONLY_IN_CLOUD, because a full-transcript
 *   analysis is a heavy job best done by the cloud model.
 * - Quiz questions are generated with PREFER_ON_DEVICE as well.
 *
 * On-device inference only supports single-turn text generation, so every
 * chat turn is sent as ONE prompt that folds the persona, a short summary of
 * the conversation so far, and the latest user message — never startChat().
 *
 * Every function returns `{ text, source }` where source tells the UI which
 * badge to show. When Firebase is not configured, the demo tutor answers
 * instead and `source` is `'demo'`.
 */
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import type { GenerativeModel } from 'firebase/ai';
import { initFirebase } from './firebase';
import { demoCorrectionReport, demoReply } from './demoTutor';
import type {
  AiResult,
  ChatMessage,
  CorrectionReportData,
  QuizQuestion,
  Settings,
  VocabItem,
} from './types';

const CLOUD_MODEL = 'gemini-flash-latest';

/**
 * How long one AI call may run before it is treated as failed.
 *
 * The Firebase AI Logic SDK can leave `generateContent` pending FOREVER
 * (observed 2026-11-19: the opening tutor message never arrived, no error,
 * the whole chat stayed locked for 6+ minutes). Likely hang points are
 * App Check token acquisition (enforcement is on for AI Logic), the
 * PREFER_ON_DEVICE probe of the on-device model, or a stalled network
 * request — the SDK neither resolves nor rejects in those cases, so the
 * app's own timeout is the only thing that can unstick the UI.
 */
const AI_CALL_TIMEOUT_MS = 25_000;
/** Device-model download is user-initiated and can legitimately be slow. */
const DEVICE_INIT_TIMEOUT_MS = 60_000;

/** Race a promise against a timer; rejects when the timer wins. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

let hybridModel: GenerativeModel | null = null;
let cloudModel: GenerativeModel | null = null;
let deviceInitState: 'idle' | 'downloading' | 'ready' | 'failed' = 'idle';
let deviceInitPromise: Promise<void> | null = null;

export function getDeviceInitState(): typeof deviceInitState {
  return deviceInitState;
}

function getHybridModel(): GenerativeModel | null {
  if (hybridModel) return hybridModel;
  const app = initFirebase();
  if (!app) return null;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  hybridModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: CLOUD_MODEL },
  });
  return hybridModel;
}

function getCloudModel(): GenerativeModel | null {
  if (cloudModel) return cloudModel;
  const app = initFirebase();
  if (!app) return null;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  cloudModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CLOUD_MODEL },
  });
  return cloudModel;
}

/**
 * Prepare the on-device model. MUST be called from a user gesture
 * (click/tap) and BEFORE the first generateContent call. On first use the
 * browser downloads Gemini Nano; `onProgress` receives 0–1 while it does.
 */
export function ensureDeviceModel(onProgress?: (progress: number) => void): Promise<void> {
  if (deviceInitState === 'ready') return Promise.resolve();
  if (deviceInitPromise) return deviceInitPromise;
  const model = getHybridModel();
  if (!model) {
    deviceInitState = 'failed';
    return Promise.resolve();
  }
  deviceInitState = 'downloading';
  deviceInitPromise = withTimeout(
    model.initializeDeviceModel((p) => onProgress?.(p)),
    DEVICE_INIT_TIMEOUT_MS,
    'initializeDeviceModel',
  )
    .then(() => {
      deviceInitState = 'ready';
    })
    .catch((err) => {
      // Download may fail offline or on an unsupported browser; the hybrid
      // model still works — it will fall back to the cloud. Clear the cached
      // promise so the user can retry the download later.
      deviceInitState = 'failed';
      deviceInitPromise = null;
      console.warn('[Lancar] On-device model init failed or timed out.', err);
    });
  return deviceInitPromise;
}

/** Gemini Nano availability, when the browser exposes the Prompt API. */
export async function checkNanoAvailability(): Promise<'available' | 'downloading' | 'downloadable' | 'unavailable' | 'unknown'> {
  try {
    const lm = (window as unknown as { LanguageModel?: { availability: () => Promise<string> } }).LanguageModel;
    if (!lm || typeof lm.availability !== 'function') return 'unknown';
    const value = await lm.availability();
    if (value === 'available') return 'available';
    if (value === 'downloading') return 'downloading';
    if (value === 'downloadable') return 'downloadable';
    return 'unavailable';
  } catch {
    return 'unknown';
  }
}

function mapInferenceSource(raw: unknown): 'on-device' | 'cloud' | null {
  // The SDK reports "on_device" / "in_cloud" (older docs wrote ON_DEVICE /
  // IN_CLOUD); accept both spellings.
  if (raw === 'on_device' || raw === 'ON_DEVICE') return 'on-device';
  if (raw === 'in_cloud' || raw === 'IN_CLOUD') return 'cloud';
  return null;
}

async function fallbackSource(): Promise<'on-device' | 'cloud'> {
  const availability = await checkNanoAvailability();
  return availability === 'available' ? 'on-device' : 'cloud';
}

function styleInstruction(style: Settings['style']): string {
  if (style === 'Tegas') return 'Be direct and strict: correct mistakes immediately and briefly.';
  if (style === 'Menyemangati') return 'Be warm and encouraging: praise effort often and keep the learner motivated.';
  return 'Be relaxed and friendly, like chatting with a friend.';
}

function buildChatPrompt(settings: Settings, persona: string, history: ChatMessage[], userText: string): string {
  const levelHint =
    settings.level === 'Pemula'
      ? 'Use very simple English (A1-A2), short sentences, and common words.'
      : settings.level === 'Menengah'
        ? 'Use intermediate English (B1), with some new vocabulary explained simply.'
        : 'Use advanced English (B2), with natural idioms and longer sentences.';
  const historyText =
    history.length === 0
      ? '(This is the start of the conversation.)'
      : history
          .slice(-8)
          .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`)
          .join('\n');
  return [
    persona,
    `You are an English conversation tutor for an Indonesian student. Topic: ${settings.topic}. Level: ${settings.level}. ${levelHint} ${styleInstruction(settings.style)}`,
    'Reply in English. Keep replies short (2-4 sentences). If the student makes a grammar mistake, gently show the correct form once, then continue the conversation. End with a follow-up question to keep the conversation going.',
    'Conversation so far:',
    historyText,
    `Student (latest message): ${userText}`,
    'Tutor:',
  ].join('\n');
}

/** One chat turn: fold persona + history + latest message into a single prompt. */
export async function chatTurn(
  settings: Settings,
  persona: string,
  history: ChatMessage[],
  userText: string,
): Promise<AiResult> {
  const model = getHybridModel();
  if (!model) {
    return { text: demoReply(settings, userText, history.filter((m) => m.role === 'user').length), source: 'demo' };
  }
  try {
    const result = await withTimeout(
      model.generateContent(buildChatPrompt(settings, persona, history, userText)),
      AI_CALL_TIMEOUT_MS,
      'chatTurn',
    );
    const text = result.response.text().trim();
    const source = mapInferenceSource(result.response.inferenceSource) ?? (await fallbackSource());
    return { text: text || 'Maaf, saya tidak sempat menjawab. Coba kirim lagi.', source };
  } catch (err) {
    // Never surface raw SDK errors (they contain endpoint URLs) to the user.
    // The technical detail is still available in the browser console.
    // On ANY failure — rejection OR timeout — fall back to the local demo
    // tutor so the conversation can continue, and report the failure so the
    // UI can show an honest error banner (badge stays 'demo').
    console.warn('[Lancar] chatTurn failed, falling back to demo tutor.', err);
    const userCount = history.filter((m) => m.role === 'user').length;
    return {
      text: demoReply(settings, userText, userCount),
      source: 'demo',
      error:
        'AI cloud tidak bisa dihubungi (jaringan atau token App Check bermasalah). Tutor lokal menjawab untuk sementara — latihan tetap bisa dilanjutkan.',
    };
  }
}

const REPORT_JSON_HINT = `Return ONLY valid JSON with this exact shape, no markdown fences:
{"corrections":[{"original":"...","corrected":"...","explanation":"... (short, in Indonesian)"}],"betterPhrases":[{"original":"...","better":"..."}],"newVocab":[{"word":"...","meaning":"... (Indonesian)","example":"..."}],"levelEstimate":"A1|A2|B1|B2|C1|C2","score":0-100,"summary":"... (Indonesian, 1-2 sentences)"}`;

function parseReportJson(raw: string): CorrectionReportData | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<CorrectionReportData>;
    if (!Array.isArray(parsed.corrections) || typeof parsed.score !== 'number') return null;
    return {
      corrections: parsed.corrections ?? [],
      betterPhrases: parsed.betterPhrases ?? [],
      newVocab: parsed.newVocab ?? [],
      levelEstimate: parsed.levelEstimate ?? 'A2',
      score: parsed.score ?? 0,
      summary: parsed.summary ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Full-session correction report, generated ONLY in the cloud (Gemini).
 * Falls back to the rule-based demo report when Firebase is not configured
 * or the cloud call fails.
 */
export async function correctionReport(
  settings: Settings,
  userSentences: string[],
): Promise<{ report: CorrectionReportData; source: 'cloud' | 'demo' }> {
  const demo = { report: demoCorrectionReport(userSentences), source: 'demo' as const };
  const model = getCloudModel();
  if (!model) return demo;
  const transcript = userSentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const prompt = [
    'You are an English teacher for Indonesian students.',
    `The student (level ${settings.level}, topic ${settings.topic}) wrote these sentences in a conversation:`,
    transcript,
    'Analyse their English and produce a correction report. List real grammar mistakes with the original sentence, the corrected sentence, and a short explanation in Indonesian. Suggest more natural phrases for awkward expressions. Pick up to 5 useful new vocabulary words from the conversation with Indonesian meanings and example sentences. Estimate their CEFR level and give a score 0-100.',
    REPORT_JSON_HINT,
  ].join('\n');
  try {
    const result = await withTimeout(model.generateContent(prompt), AI_CALL_TIMEOUT_MS, 'correctionReport');
    const parsed = parseReportJson(result.response.text());
    if (!parsed) return demo;
    return { report: parsed, source: 'cloud' };
  } catch (err) {
    // A hang here would freeze the "end session" flow the same way the chat
    // greeting froze, so the timeout above is what unblocks it.
    console.warn('[Lancar] correctionReport failed, falling back to demo report.', err);
    return demo;
  }
}

function parseQuizJson(raw: string): QuizQuestion[] | null {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as QuizQuestion[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter((q) => Array.isArray(q.options) && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4);
  } catch {
    return null;
  }
}

/** Build a multiple-choice quiz from the saved vocabulary. */
export async function generateQuiz(vocab: VocabItem[]): Promise<{ questions: QuizQuestion[]; source: 'on-device' | 'cloud' | 'demo' }> {
  if (vocab.length === 0) return { questions: [], source: 'demo' };
  const model = getHybridModel();
  if (!model) return { questions: demoQuiz(vocab), source: 'demo' };
  const list = vocab.map((v) => `${v.word} = ${v.meaning}`).join('\n');
  const prompt = [
    'Create a multiple-choice English vocabulary quiz for an Indonesian student from this word list:',
    list,
    'Return ONLY valid JSON: an array of up to 5 objects like {"question":"What does \\"journey\\" mean?","options":["...","...","...","..."],"answerIndex":0,"explanation":"... (Indonesian, one sentence)"}.',
    'Each question asks the Indonesian meaning of one word. The 4 options must be plausible Indonesian meanings, with exactly one correct answer.',
  ].join('\n');
  try {
    const result = await withTimeout(model.generateContent(prompt), AI_CALL_TIMEOUT_MS, 'generateQuiz');
    const questions = parseQuizJson(result.response.text());
    if (!questions || questions.length === 0) return { questions: demoQuiz(vocab), source: 'demo' };
    const source = mapInferenceSource(result.response.inferenceSource) ?? (await fallbackSource());
    return { questions, source };
  } catch (err) {
    console.warn('[Lancar] generateQuiz failed, falling back to demo quiz.', err);
    return { questions: demoQuiz(vocab), source: 'demo' };
  }
}

/** Deterministic fallback quiz: pick the right meaning among other words' meanings. */
export function demoQuiz(vocab: VocabItem[]): QuizQuestion[] {
  const meanings = vocab.map((v) => v.meaning);
  return vocab.slice(0, 5).map((item, i) => {
    const distractors = meanings.filter((m) => m !== item.meaning).slice(0, 3);
    while (distractors.length < 3) distractors.push('tidak tahu');
    const options = [...distractors];
    const answerIndex = i % 4;
    options.splice(answerIndex, 0, item.meaning);
    return {
      question: `Apa arti kata "${item.word}"?`,
      options: options.slice(0, 4),
      answerIndex,
      explanation: `"${item.word}" artinya "${item.meaning}". Contoh: ${item.example}`,
    };
  });
}
