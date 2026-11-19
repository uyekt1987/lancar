/**
 * Local-first store for Lancar.
 *
 * Settings, progress and vocabulary always live in localStorage first, so
 * the app works fully offline. When Firebase is configured and the user has
 * an anonymous uid, progress and vocabulary are also synced to Firestore
 * (users/{uid}) in the background — failures are silent and local data wins.
 */
import {
  ensureAnonymousAuth,
  loadProgressFromFirestore,
  loadVocabFromFirestore,
  saveProgressToFirestore,
  saveVocabToFirestore,
} from './firebase';
import type { ProgressData, Settings, VocabItem } from './types';

const KEYS = {
  settings: 'lancar.settings',
  progress: 'lancar.progress',
  vocab: 'lancar.vocab',
} as const;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or unavailable (private mode) — app keeps working.
  }
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function defaultProgress(): ProgressData {
  return { sessionsCompleted: 0, totalMessages: 0, streakDays: 0, lastActiveDate: null, level: 'A1' };
}

export function loadSettings(): Settings | null {
  const saved = readJson<Settings>(KEYS.settings);
  if (!saved || !saved.level || !saved.topic || !saved.style) return null;
  return saved;
}

export function saveSettings(settings: Settings): void {
  writeJson(KEYS.settings, settings);
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEYS.settings);
  } catch {
    // ignore
  }
}

export function loadProgress(): ProgressData {
  const saved = readJson<ProgressData>(KEYS.progress);
  return saved ? { ...defaultProgress(), ...saved } : defaultProgress();
}

export function saveProgressLocal(progress: ProgressData): void {
  writeJson(KEYS.progress, progress);
}

/** Mark a day active: updates the daily streak. Returns the new progress. */
export function touchProgress(progress: ProgressData, messagesAdded: number, sessionDone: boolean): ProgressData {
  const today = todayKey();
  let streakDays = progress.streakDays;
  if (progress.lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streakDays = progress.lastActiveDate === todayKey(yesterday) ? progress.streakDays + 1 : 1;
  }
  const next: ProgressData = {
    ...progress,
    sessionsCompleted: progress.sessionsCompleted + (sessionDone ? 1 : 0),
    totalMessages: progress.totalMessages + messagesAdded,
    streakDays,
    lastActiveDate: today,
    level: estimateLevel(progress.totalMessages + messagesAdded, progress.sessionsCompleted + (sessionDone ? 1 : 0)),
  };
  saveProgressLocal(next);
  void syncProgress(next);
  return next;
}

function estimateLevel(totalMessages: number, sessions: number): string {
  const points = totalMessages + sessions * 10;
  if (points >= 400) return 'B2';
  if (points >= 200) return 'B1';
  if (points >= 80) return 'A2';
  return 'A1';
}

/** Best-effort Firestore sync (no-op in demo mode or offline). */
async function syncProgress(progress: ProgressData): Promise<void> {
  try {
    const userId = await ensureAnonymousAuth();
    if (!userId) return;
    await saveProgressToFirestore(userId, progress);
  } catch {
    // Offline or unconfigured — local copy is the source of truth.
  }
}

/** Pull cloud progress once at startup; cloud wins only if it is ahead. */
export async function hydrateProgressFromCloud(): Promise<ProgressData> {
  const local = loadProgress();
  try {
    const userId = await ensureAnonymousAuth();
    if (!userId) return local;
    const cloud = await loadProgressFromFirestore(userId);
    if (!cloud) return local;
    const merged: ProgressData =
      cloud.totalMessages >= local.totalMessages ? cloud : local;
    saveProgressLocal(merged);
    return merged;
  } catch {
    return local;
  }
}

export function loadVocab(): VocabItem[] {
  const saved = readJson<VocabItem[]>(KEYS.vocab);
  return Array.isArray(saved) ? saved : [];
}

export function saveVocabLocal(items: VocabItem[]): void {
  writeJson(KEYS.vocab, items);
}

/** Add new words, de-duplicated by lowercase word. Returns the full list. */
export function addVocab(items: VocabItem[]): VocabItem[] {
  const current = loadVocab();
  const known = new Set(current.map((v) => v.word.toLowerCase()));
  const added = items.filter((v) => v.word && !known.has(v.word.toLowerCase()));
  if (added.length === 0) return current;
  const next = [...current, ...added];
  saveVocabLocal(next);
  void syncVocab(next);
  return next;
}

async function syncVocab(items: VocabItem[]): Promise<void> {
  try {
    const userId = await ensureAnonymousAuth();
    if (!userId) return;
    await saveVocabToFirestore(userId, items);
  } catch {
    // Offline or unconfigured — local copy is the source of truth.
  }
}

export async function hydrateVocabFromCloud(): Promise<VocabItem[]> {
  const local = loadVocab();
  try {
    const userId = await ensureAnonymousAuth();
    if (!userId) return local;
    const cloud = await loadVocabFromFirestore(userId);
    if (!cloud || cloud.length === 0) return local;
    const known = new Set(local.map((v) => v.word.toLowerCase()));
    const merged = [...local, ...cloud.filter((v) => !known.has(v.word.toLowerCase()))];
    saveVocabLocal(merged);
    return merged;
  } catch {
    return local;
  }
}
