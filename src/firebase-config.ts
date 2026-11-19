/**
 * Firebase configuration for Lancar.
 *
 * Project: lancar-hybrid-ai (Firebase Spark plan, no billing, no Analytics).
 * Web app: "Lancar Web".
 *
 * Created in the Firebase console under Paduka's Google account. These are
 * client-side Firebase web keys: they identify the project and are safe to
 * ship in a web app, but access is still guarded by Firestore security
 * rules, Anonymous Auth and (once enabled) App Check — see README.md,
 * "Firebase console setup".
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  /** reCAPTCHA Enterprise site key for App Check. Empty until one is registered (see README.md). */
  recaptchaSiteKey?: string;
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: 'AIzaSyBiw0VfrgncDSGJi-Xo70fabMvKGGM-t9k',
  authDomain: 'lancar-hybrid-ai.firebaseapp.com',
  projectId: 'lancar-hybrid-ai',
  storageBucket: 'lancar-hybrid-ai.firebasestorage.app',
  messagingSenderId: '880049393627',
  appId: '1:880049393627:web:68c80625131ecdfd88e1fe',
  recaptchaSiteKey: '6LfvmyYuAAAAAJgaHSk-uqMpjIpVK0kaMIdZDAVf',
};

/**
 * True when this file holds a real project config (not placeholders).
 * The app initialises Firebase and calls Firebase AI Logic for real while
 * this is true. The local demo tutor remains only as a graceful fallback
 * when Firebase initialisation fails (e.g. no network) — it is never the
 * primary path anymore.
 */
export const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
  firebaseConfig.apiKey.length > 0 &&
  firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
  firebaseConfig.projectId.length > 0 &&
  firebaseConfig.appId !== 'YOUR_APP_ID' &&
  firebaseConfig.appId.length > 0;
