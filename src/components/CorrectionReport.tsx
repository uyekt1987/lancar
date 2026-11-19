import type { CorrectionReportData } from '../lib/types';

interface CorrectionReportProps {
  report: CorrectionReportData;
  source: 'cloud' | 'demo';
  onBack: () => void;
  onNewSession: () => void;
}

export default function CorrectionReport({ report, source, onBack, onNewSession }: CorrectionReportProps) {
  return (
    <section className="card report">
      <h2>Laporan koreksi sesi</h2>
      <p className="muted">
        Dibuat oleh {source === 'cloud' ? 'Gemini di cloud' : 'pemeriksa lokal (mode demo)'} • Estimasi level:{' '}
        <strong>{report.levelEstimate}</strong> • Skor: <strong>{report.score}/100</strong>
      </p>
      {report.summary && <p className="report-summary">{report.summary}</p>}

      <h3>Kesalahan grammar</h3>
      {report.corrections.length === 0 ? (
        <p className="muted">Tidak ada kesalahan yang terdeteksi. Kerja bagus!</p>
      ) : (
        <ul className="correction-list">
          {report.corrections.map((c, i) => (
            <li key={i}>
              <p className="wrong">“{c.original}”</p>
              <p className="right">→ {c.corrected}</p>
              <p className="muted">{c.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      {report.betterPhrases.length > 0 && (
        <>
          <h3>Frasa yang lebih natural</h3>
          <ul className="phrase-list">
            {report.betterPhrases.map((p, i) => (
              <li key={i}>
                <span className="wrong">“{p.original}”</span> → <span className="right">{p.better}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {report.newVocab.length > 0 && (
        <>
          <h3>Kosakata baru (sudah disimpan)</h3>
          <ul className="vocab-list">
            {report.newVocab.map((v, i) => (
              <li key={i}>
                <strong>{v.word}</strong> — {v.meaning}
                <br />
                <span className="muted">“{v.example}”</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="report-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Kembali ke chat
        </button>
        <button type="button" className="btn-primary" onClick={onNewSession}>
          Mulai sesi baru
        </button>
      </div>
    </section>
  );
}
