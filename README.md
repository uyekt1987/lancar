# Lancar — Offline-First English Conversation Tutor

**Lancar** is an English conversation tutor for Indonesian students, built for the
**#BuildHybridAI 2026** hackathon (Devpost / Google / Firebase).

The app is **hybrid by design**, using Firebase AI Logic:

- **Practice chat runs on-device first.** Each turn is a single-turn text
  generation call with `InferenceMode.PREFER_ON_DEVICE`, so Gemini Nano in
  Chrome answers when it is available and the SDK falls back to the cloud
  Gemini model (`gemini-flash-latest`) when it is not. Every tutor message
  shows a routing badge — **Nano • on-device** (green) or **Cloud • Gemini**
  (blue) — taken from the response's `inferenceSource`.
- **The correction report runs in the cloud.** At the end of a session,
  `InferenceMode.ONLY_IN_CLOUD` asks Gemini to analyse the whole transcript:
  grammar mistakes (original → corrected → short explanation in Indonesian),
  more natural phrases, new vocabulary, and a CEFR level estimate (A1–C2)
  with a score.
- **Quiz questions are generated on-device** (`PREFER_ON_DEVICE`) from the
  student's saved vocabulary, with a local fallback.
- **Progress syncs to Firestore** (anonymous auth, `users/{uid}`) when online
  and falls back to `localStorage` when offline. Remote Config supplies the
  default tutor persona and level.

The UI is in Indonesian (the learning content is in English), mobile-friendly,
and warm-toned. No build step or account is needed to try the UI: if Firebase
cannot be reached, the app says so clearly and keeps working with a local
demo tutor (badge **Demo • lokal**) — that path is a fallback only, never the
primary experience.

## Run it

```bash
npm install
npm run dev      # local development server
npm run build    # TypeScript + Vite production build (output: dist/)
npm run preview  # serve the production build locally
```

Deploy the static `dist/` output anywhere — the Vite config uses
`base: './'`, so it works on GitHub Pages from a repository sub-path.

## Enable Gemini Nano (on-device) in Chrome

On-device chat needs Chrome Desktop **139+**:

1. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and set
   it to **Enabled**, then relaunch Chrome.
2. Open Lancar and click **“Aktifkan mode offline”** in the chat screen.
   The first click downloads the Gemini Nano model (the button shows download
   progress). This call must happen after a user gesture — that is why it is a
   button, not an automatic step.
3. The status bar shows Nano availability (`LanguageModel.availability()`):
   *tersedia / mengunduh / tidak tersedia*, alongside online/offline status
   and the current mode (Firebase / Demo).

Without Nano, chat still works — the SDK falls back to the cloud model and
the badge says so.

## Firebase console setup

The project is already created: **lancar-hybrid-ai** (Spark plan, no billing,
no Analytics), web app **“Lancar Web”**. Its config lives in
`src/firebase-config.ts`. The steps below still need to be clicked through in
the Firebase console — they cannot be done from code.

### 1. AI Logic — enable the Gemini Developer API

1. In the Firebase console, open project **lancar-hybrid-ai**.
2. Go to **AI Services > AI Logic** (left sidebar, under *Build*).
3. Click **Get started**.
4. When asked for a Gemini API provider, choose **Gemini Developer API**
   (free tier, no billing — the Agent Platform / Vertex AI path needs Blaze).
5. Finish the guided workflow. It enables two APIs for you:
   - Gemini Developer API (`generativelanguage.googleapis.com`)
   - Firebase AI Logic API (`firebasevertexai.googleapis.com`)
   and provisions a Google-managed service account plus the API-key allowlist.
   Wait 5–10 minutes, then verify in the Google Cloud console (same project):
   **APIs & Services > Enabled APIs & services** — both APIs should be listed.
6. Note: the guided workflow also turns on App Check enforcement for AI
   Logic automatically. If AI calls start failing with App Check errors,
   finish step 3 below (or temporarily use the *delay enforcement* option in
   the console — the latest possible date is **21 January 2027**).

### 2. Authentication — enable Anonymous sign-in

1. Go to **Build > Authentication > Sign-in method**.
2. Find **Anonymous** in the provider list, click it, toggle **Enable**, and
   click **Save**.
3. Lancar signs users in anonymously on first use (`signInAnonymously`) so
   progress can sync to Firestore without any account or password.

### 3. App Check — protect AI Logic

Firebase AI Logic enforces App Check automatically (since 2 November 2026).
Without a valid App Check token, AI calls are blocked.

**For production (GitHub Pages):**

1. In the Google Cloud console (project `lancar-hybrid-ai`), go to
   **Security > reCAPTCHA Enterprise > Create key**.
   Create a **score-based (no checkbox)** key of type **Website**, add your
   deployed domain (e.g. `uyekt1987.github.io`), and copy the site key.
   Do not add `localhost` to a production key.
2. In the Firebase console, go to **Security (or Build) > App Check > Apps**,
   select the **Lancar Web** app, and register it with that site key,
   choosing **reCAPTCHA Enterprise** as the provider.
3. Paste the site key into `recaptchaSiteKey` in `src/firebase-config.ts`.
   The app initialises App Check with `ReCaptchaEnterpriseProvider`
   (`initializeAppCheck`, token auto-refresh on). If initialisation fails,
   the app logs a warning and continues without App Check — it never crashes.
4. Under **App Check > APIs**, find the **Firebase AI Logic** row and make
   sure enforcement is on for production traffic.

**For local development / the submission demo (debug token):**

1. Run the app with `npm run dev` (development mode only). The code sets
   `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` **before**
   `initializeAppCheck` — only when `import.meta.env.DEV` is true, so a
   debug token can never ship in a production build.
2. Open the app in Chrome and open DevTools (F12) > Console. You will see a
   line like:
   `App Check debug token: "123a4567-b89c-12d3-e456-789012345678". You will need to safelist it in the Firebase console for it to work.`
3. In the Firebase console, go to **App Check > Apps**, open the overflow
   menu (⋮) of the **Lancar Web** app, and choose **Manage debug tokens**.
4. Click **Add debug token**, paste the token from the console, give it a
   name (e.g. `demo-laptop`), and save. Backend services will now accept it.
5. The token is stored in that browser. To use the same token in another
   browser or on CI, set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` to the token
   string instead of `true` — but **never commit a debug token to a public
   repository**: anyone holding it can bypass App Check entirely. If one is
   ever exposed, revoke it immediately in the same **Manage debug tokens**
   screen.

### 4. Firestore Database — production mode + rules

1. Go to **Build > Firestore Database** and click **Create database**.
2. Choose **Start in production mode** and a location close to your users
   (e.g. `asia-southeast1` — Singapore — for Indonesia).
3. Go to the **Rules** tab and replace the rules with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Each anonymous user can only read/write their own documents.
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /meta/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

4. Click **Publish**. Lancar stores progress at `users/{uid}` and saved
   vocabulary at `users/{uid}/meta/vocab`; both are covered by these rules.

### 5. Remote Config — defaults (optional)

1. Go to **Run > Remote Config** (or **Build > Remote Config**).
2. Add two parameters (or leave them unset — the app has in-code defaults):
   - `tutor_persona` (string) — the system prompt for the tutor.
   - `default_level` (string) — one of `Pemula`, `Menengah`, `Mahir`.
3. Click **Publish changes**. The app fetches them with `fetchAndActivate`
   and falls back to its defaults if the fetch fails.

## Features

1. **Onboarding** — pick a level (Pemula / Menengah / Mahir), topic
   (Sehari-hari / Kerja / Traveling / Sekolah) and tutor style (Santai /
   Tegas / Menyemangati). Saved in `localStorage`.
2. **Practice chat** — English conversation with the tutor. On-device
   inference only supports single-turn generation, so each turn sends one
   prompt folding the persona, a short conversation history, and the latest
   message (`generateContent`, never `startChat`). Routing badges on every
   tutor message; status bar shows Nano availability, online/offline state,
   and Firebase/Demo mode.
3. **Correction report** — “Akhiri & lihat koreksi” sends the transcript to
   cloud Gemini for a structured report (grammar corrections, better phrases,
   new vocabulary, CEFR level + score). A rule-based local report is the
   fallback when the cloud is unreachable.
4. **Vocabulary** — words from reports are saved automatically; flashcard
   mode (tap to flip word ↔ meaning) and a multiple-choice quiz whose
   questions are generated on-device from the saved words.
5. **Progress** — daily streak, completed sessions, total messages, level
   estimate; synced to Firestore (`users/{uid}`) when online, `localStorage`
   otherwise. Remote Config drives the default persona/level.
6. **Offline-first** — everything degrades gracefully: chat falls back
   cloud → demo tutor, progress and vocabulary always persist locally first.

## Project structure

```
src/
  firebase-config.ts        # Firebase project config (lancar-hybrid-ai)
  App.tsx                   # tabs: Latihan / Kosakata / Progres + onboarding
  index.css                 # warm, mobile-friendly styling
  lib/
    firebase.ts             # safe init, App Check, anonymous auth, Firestore, Remote Config
    ai.ts                   # hybrid engine: chatTurn, correctionReport, generateQuiz
    demoTutor.ts            # rule-based demo tutor + correction fallback
    store.ts                # settings / progress / vocab (localStorage + Firestore sync)
    types.ts                # shared types
  components/
    Onboarding.tsx  Chat.tsx  CorrectionReport.tsx
    Vocab.tsx  Progress.tsx  StatusBar.tsx
```

## Tech

- Vite 8 + React 19 + TypeScript (strict)
- Firebase JS SDK 13.4.0 (`firebase/ai`, `firebase/app-check`,
  `firebase/auth`, `firebase/firestore`, `firebase/remote-config`)
- Static build (`vite.config.ts` uses `base: './'`) — ready for GitHub Pages

## License

Apache License 2.0 — see [LICENSE](LICENSE).
