import { useState } from 'react';
import { LEVELS, STYLES, TOPICS } from '../lib/types';
import type { Level, Settings, Topic, TutorStyle } from '../lib/types';

interface OnboardingProps {
  initial?: Settings | null;
  onDone: (settings: Settings) => void;
}

export default function Onboarding({ initial, onDone }: OnboardingProps) {
  const [level, setLevel] = useState<Level>(initial?.level ?? 'Pemula');
  const [topic, setTopic] = useState<Topic>(initial?.topic ?? 'Sehari-hari');
  const [style, setStyle] = useState<TutorStyle>(initial?.style ?? 'Santai');

  return (
    <section className="card onboarding">
      <h2>Siapkan sesi belajarmu</h2>
      <p className="muted">
        Pilih level, topik, dan gaya tutor. Kamu bisa mengubahnya kapan saja dari halaman Progres.
      </p>

      <fieldset>
        <legend>Level bahasa Inggrismu</legend>
        <div className="choices">
          {LEVELS.map((item) => (
            <button
              type="button"
              key={item}
              className={`choice ${level === item ? 'selected' : ''}`}
              onClick={() => setLevel(item)}
              aria-pressed={level === item}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Topik latihan</legend>
        <div className="choices">
          {TOPICS.map((item) => (
            <button
              type="button"
              key={item}
              className={`choice ${topic === item ? 'selected' : ''}`}
              onClick={() => setTopic(item)}
              aria-pressed={topic === item}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Gaya tutor</legend>
        <div className="choices">
          {STYLES.map((item) => (
            <button
              type="button"
              key={item}
              className={`choice ${style === item ? 'selected' : ''}`}
              onClick={() => setStyle(item)}
              aria-pressed={style === item}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" className="btn-primary" onClick={() => onDone({ level, topic, style })}>
        Mulai latihan
      </button>
    </section>
  );
}
