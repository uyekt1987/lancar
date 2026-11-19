import { useEffect, useState } from 'react';
import Chat from './components/Chat';
import CorrectionReport from './components/CorrectionReport';
import Onboarding from './components/Onboarding';
import Progress from './components/Progress';
import StatusBar from './components/StatusBar';
import Vocab from './components/Vocab';
import { getDeviceInitState } from './lib/ai';
import { getFirebaseStatus, initFirebase } from './lib/firebase';
import {
  addVocab,
  hydrateProgressFromCloud,
  hydrateVocabFromCloud,
  loadProgress,
  loadSettings,
  saveSettings,
  touchProgress,
} from './lib/store';
import type { CorrectionReportData, ProgressData, Settings } from './lib/types';

type Tab = 'chat' | 'vocab' | 'progress';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings());
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => loadSettings() === null);
  const [tab, setTab] = useState<Tab>('chat');
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());
  const [report, setReport] = useState<{ data: CorrectionReportData; source: 'cloud' | 'demo' } | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const app = initFirebase();
    const status = getFirebaseStatus();
    if (!app) {
      // Firebase could not start (no network or bad config): the app still
      // works end-to-end with the local demo tutor, and says so clearly.
      setDemoMode(true);
      setFirebaseError(status.error ?? 'Firebase tidak tersedia — berjalan dalam mode demo.');
    } else {
      setDemoMode(false);
      void hydrateProgressFromCloud().then(setProgress);
      void hydrateVocabFromCloud();
    }
  }, []);

  function handleOnboardingDone(next: Settings): void {
    saveSettings(next);
    setSettings(next);
    setShowOnboarding(false);
    setTab('chat');
    setChatKey((k) => k + 1);
  }

  function handleEndSession(data: CorrectionReportData, source: 'cloud' | 'demo'): void {
    if (data.newVocab.length > 0) addVocab(data.newVocab);
    setProgress((prev) => touchProgress(prev, 0, true));
    setReport({ data, source });
    setTab('chat');
  }

  function handleMessagesChanged(count: number): void {
    setProgress((prev) => touchProgress(prev, count, false));
  }

  const deviceReady = getDeviceInitState() === 'ready';

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Lancar</h1>
          <p className="tagline">Tutor percakapan bahasa Inggris — offline-first untuk pelajar Indonesia</p>
        </div>
      </header>

      <StatusBar mode={demoMode ? 'demo' : 'firebase'} deviceReady={deviceReady} deviceDownloading={false} deviceProgress={0} />

      {demoMode && (
        <div className="notice" role="alert">
          <strong>Mode demo aktif.</strong> {firebaseError ?? 'Firebase tidak tersedia.'} Tutor lokal tetap bisa
          dipakai untuk latihan, dan laporan koreksi dibuat dari aturan sederhana. Periksa koneksi internetmu, lalu
          muat ulang halaman untuk memakai AI sungguhan.
        </div>
      )}

      {showOnboarding || !settings ? (
        <Onboarding initial={settings} onDone={handleOnboardingDone} />
      ) : report ? (
        <CorrectionReport
          report={report.data}
          source={report.source}
          onBack={() => setReport(null)}
          onNewSession={() => {
            setReport(null);
            setChatKey((k) => k + 1);
          }}
        />
      ) : (
        <>
          <nav className="tabs" aria-label="Bagian aplikasi">
            <button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              Latihan
            </button>
            <button type="button" className={tab === 'vocab' ? 'active' : ''} onClick={() => setTab('vocab')}>
              Kosakata
            </button>
            <button type="button" className={tab === 'progress' ? 'active' : ''} onClick={() => setTab('progress')}>
              Progres
            </button>
          </nav>

          {tab === 'chat' && (
            <Chat
              key={`${chatKey}-${settings.level}-${settings.topic}-${settings.style}`}
              settings={settings}
              onEndSession={handleEndSession}
              onMessagesChanged={handleMessagesChanged}
            />
          )}
          {tab === 'vocab' && <Vocab key={`vocab-${chatKey}`} />}
          {tab === 'progress' && (
            <Progress
              progress={progress}
              settings={settings}
              onEditSettings={() => setShowOnboarding(true)}
              onResetOnboarding={() => {
                setSettings(null);
                setShowOnboarding(true);
              }}
            />
          )}
        </>
      )}

      <footer className="app-footer">
        <p>
          Lancar memakai Firebase AI Logic: obrolan berjalan di perangkat dengan Gemini Nano bila tersedia, dan
          beralih ke Gemini di cloud bila tidak. Laporan koreksi selalu dibuat di cloud. Dibangun untuk hackathon
          #BuildHybridAI 2026.
        </p>
      </footer>
    </div>
  );
}
