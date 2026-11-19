import { getFirebaseStatus } from '../lib/firebase';
import { clearSettings } from '../lib/store';
import type { ProgressData, Settings } from '../lib/types';

interface ProgressProps {
  progress: ProgressData;
  settings: Settings;
  onEditSettings: () => void;
  onResetOnboarding: () => void;
}

export default function Progress({ progress, settings, onEditSettings, onResetOnboarding }: ProgressProps) {
  const status = getFirebaseStatus();

  return (
    <section className="card">
      <h2>Progresmu</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat-value">{progress.streakDays}</span>
          <span className="stat-label">hari streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{progress.sessionsCompleted}</span>
          <span className="stat-label">sesi selesai</span>
        </div>
        <div className="stat">
          <span className="stat-value">{progress.totalMessages}</span>
          <span className="stat-label">pesan terkirim</span>
        </div>
        <div className="stat">
          <span className="stat-value">{progress.level}</span>
          <span className="stat-label">estimasi level</span>
        </div>
      </div>
      <p className="muted">
        Terakhir aktif: {progress.lastActiveDate ?? 'belum pernah'}. Latihan satu sesi setiap hari untuk menjaga
        streak tetap menyala.
      </p>
      <p className="muted">
        Penyimpanan progres:{' '}
        {status.configured
          ? 'Firestore (users/{uid}) bila online, localStorage bila offline.'
          : 'localStorage (mode demo — Firebase belum dikonfigurasi).'}
      </p>

      <h3>Pengaturan latihan</h3>
      <p className="muted">
        Level: {settings.level} • Topik: {settings.topic} • Gaya tutor: {settings.style}
      </p>
      <div className="report-actions">
        <button type="button" className="btn-secondary" onClick={onEditSettings}>
          Ubah pengaturan
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            clearSettings();
            onResetOnboarding();
          }}
        >
          Ulangi onboarding
        </button>
      </div>
    </section>
  );
}
