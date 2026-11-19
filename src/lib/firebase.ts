/**
 * Safe Firebase bootstrap.
 *
 * Every Firebase feature is optional: if the config placeholders in
 * `firebase-config.ts` have not been filled in, or if any init step fails,
 * the app keeps working in demo mode backed by localStorage. Nothing here
 * throws to the caller — failures are reported through the returned status
 * object and a friendly message.
 */
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getString } from 'firebase/remote-config';
import type { RemoteConfig } from 'firebase/remote-config';
import { FIREBASE_CONFIGURED, firebaseConfig } from '../firebase-config';
import type { ProgressData, VocabItem } from './types';

export interface FirebaseStatus {
  configured: boolean;
  appCheck: boolean;
  auth: boolean;
  firestore: boolean;
  remoteConfig: boolean;
  error: string | null;
}

export interface RemoteConfigValues {
  tutor_persona: string;
  default_level: string;
}

const DEFAULT_REMOTE_CONFIG: RemoteConfigValues = {
  tutor_persona:
    'Kamu adalah tutor percakapan bahasa Inggris yang ramah untuk pelajar Indonesia. Jawab dalam bahasa Inggris yang sederhana, lalu beri satu koreksi singkat bila ada kesalahan.',
  default_level: 'Pemula',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let remoteConfig: RemoteConfig | null = null;
let uid: string | null = null;
let uidPromise: Promise<string | null> | null = null;
let status: FirebaseStatus = {
  configured: FIREBASE_CONFIGURED,
  appCheck: false,
  auth: false,
  firestore: false,
  remoteConfig: false,
  error: FIREBASE_CONFIGURED ? null : 'Firebase belum dikonfigurasi — aplikasi berjalan dalam mode demo.',
};

function initAppCheckGuarded(firebaseApp: FirebaseApp): void {
  // App Check is initialised only when a reCAPTCHA Enterprise site key has
  // been provided in firebase-config.ts. Any failure is swallowed — the app
  // must keep working, and the UI reports the App Check status.
  //
  // Debug flow (localhost / development only, never production): when the
  // app runs in dev mode we set self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  // BEFORE initializeAppCheck. The SDK then prints a debug token to the
  // browser console ("App Check debug token: ...") which must be registered
  // in the Firebase console (App Check > app overflow menu > Manage debug
  // tokens). See README.md, "Firebase console setup".
  const siteKey = firebaseConfig.recaptchaSiteKey;
  if (import.meta.env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (!siteKey) {
    console.warn(
      '[Lancar] App Check dilewati: belum ada reCAPTCHA Enterprise site key di firebase-config.ts. ' +
        'Jika enforcement App Check untuk AI Logic aktif di console, panggilan AI akan diblokir — ' +
        'lihat README.md ("Firebase console setup") untuk mendaftarkan debug token atau site key.',
    );
    return;
  }
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    status = { ...status, appCheck: true };
    console.info('[Lancar] App Check initialised (reCAPTCHA Enterprise).');
  } catch {
    status = { ...status, appCheck: false };
    console.warn('[Lancar] App Check gagal diinisialisasi — aplikasi lanjut tanpa App Check.');
  }
}

/** Initialise Firebase once. Safe to call repeatedly; returns null in demo mode. */
export function initFirebase(): FirebaseApp | null {
  if (app) return app;
  if (!FIREBASE_CONFIGURED) return null;
  try {
    app = initializeApp(firebaseConfig);
    initAppCheckGuarded(app);
    auth = getAuth(app);
    db = getFirestore(app);
    remoteConfig = getRemoteConfig(app);
    remoteConfig.defaultConfig = { ...DEFAULT_REMOTE_CONFIG };
    remoteConfig.settings.minimumFetchIntervalMillis = 3600000;
    status = { ...status, firestore: true, remoteConfig: true, error: null };
    console.info(
      `[Lancar] Firebase initialised: project ${firebaseConfig.projectId} (App Check: ${status.appCheck ? 'on' : 'off — see README'}).`,
    );
    return app;
  } catch (err) {
    status = {
      ...status,
      error: `Firebase gagal diinisialisasi: ${err instanceof Error ? err.message : 'kesalahan tidak diketahui'}. Aplikasi berjalan dalam mode demo.`,
    };
    console.warn('[Lancar] Firebase init failed, running in demo fallback mode.', err);
    app = null;
    return null;
  }
}

export function getFirebaseStatus(): FirebaseStatus {
  return status;
}

export function isFirebaseConfigured(): boolean {
  return FIREBASE_CONFIGURED;
}

/**
 * Sign in anonymously (no account needed) and return the uid, or null when
 * Firebase is unavailable. The result is cached for the session.
 */
export function ensureAnonymousAuth(): Promise<string | null> {
  if (uid) return Promise.resolve(uid);
  if (uidPromise) return uidPromise;
  uidPromise = (async (): Promise<string | null> => {
    const firebaseApp = initFirebase();
    if (!firebaseApp || !auth) return null;
    try {
      const cred = await signInAnonymously(auth);
      uid = cred.user.uid;
      status = { ...status, auth: true };
      return uid;
    } catch {
      return null;
    }
  })();
  return uidPromise;
}

/** Fetch Remote Config values, falling back to the in-code defaults. */
export async function getRemoteConfigValues(): Promise<RemoteConfigValues> {
  const firebaseApp = initFirebase();
  if (!firebaseApp || !remoteConfig) return { ...DEFAULT_REMOTE_CONFIG };
  try {
    await fetchAndActivate(remoteConfig);
    return {
      tutor_persona: getString(remoteConfig, 'tutor_persona') || DEFAULT_REMOTE_CONFIG.tutor_persona,
      default_level: getString(remoteConfig, 'default_level') || DEFAULT_REMOTE_CONFIG.default_level,
    };
  } catch {
    return { ...DEFAULT_REMOTE_CONFIG };
  }
}

/** Load the user's progress document from Firestore (users/{uid}). */
export async function loadProgressFromFirestore(userId: string): Promise<ProgressData | null> {
  const firebaseApp = initFirebase();
  if (!firebaseApp || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<ProgressData>;
    return {
      sessionsCompleted: data.sessionsCompleted ?? 0,
      totalMessages: data.totalMessages ?? 0,
      streakDays: data.streakDays ?? 0,
      lastActiveDate: data.lastActiveDate ?? null,
      level: data.level ?? 'A1',
    };
  } catch {
    return null;
  }
}

/** Save the user's progress document to Firestore (users/{uid}). */
export async function saveProgressToFirestore(userId: string, progress: ProgressData): Promise<boolean> {
  const firebaseApp = initFirebase();
  if (!firebaseApp || !db) return false;
  try {
    await setDoc(doc(db, 'users', userId), { ...progress, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/** Load the user's saved vocabulary from Firestore (users/{uid}/meta/vocab). */
export async function loadVocabFromFirestore(userId: string): Promise<VocabItem[] | null> {
  const firebaseApp = initFirebase();
  if (!firebaseApp || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'meta', 'vocab'));
    if (!snap.exists()) return null;
    const data = snap.data() as { items?: VocabItem[] };
    return Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}

/** Save the user's vocabulary to Firestore (users/{uid}/meta/vocab). */
export async function saveVocabToFirestore(userId: string, items: VocabItem[]): Promise<boolean> {
  const firebaseApp = initFirebase();
  if (!firebaseApp || !db) return false;
  try {
    await setDoc(doc(db, 'users', userId, 'meta', 'vocab'), { items }, { merge: true });
    return true;
  } catch {
    return false;
  }
}
