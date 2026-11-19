import { useState } from 'react';
import { generateQuiz } from '../lib/ai';
import { builtinVocab } from '../lib/demoTutor';
import { addVocab, loadVocab } from '../lib/store';
import type { QuizQuestion, VocabItem } from '../lib/types';

type Mode = 'list' | 'flashcards' | 'quiz';

export default function Vocab() {
  const [items, setItems] = useState<VocabItem[]>(() => loadVocab());
  const [mode, setMode] = useState<Mode>('list');
  const [flipped, setFlipped] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizSource, setQuizSource] = useState<string>('');
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  function handleAddBuiltin(): void {
    setItems(addVocab(builtinVocab()));
  }

  async function handleStartQuiz(): Promise<void> {
    if (items.length === 0) return;
    setQuizLoading(true);
    setShowResults(false);
    setAnswers({});
    try {
      const { questions: qs, source } = await generateQuiz(items);
      setQuestions(qs);
      setQuizSource(source === 'on-device' ? 'Dibuat on-device (Nano)' : source === 'cloud' ? 'Dibuat di cloud (Gemini)' : 'Dibuat dari daftar lokal');
      setMode('quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.answerIndex ? 1 : 0), 0);
  const current = items[cardIndex];

  return (
    <section className="card">
      <h2>Kosakata</h2>
      <p className="muted">
        Kata dari laporan koreksi otomatis tersimpan di sini. {items.length} kata tersimpan.
      </p>

      <div className="choices vocab-tabs" role="tablist" aria-label="Mode kosakata">
        <button type="button" className={`choice ${mode === 'list' ? 'selected' : ''}`} onClick={() => setMode('list')}>
          Daftar
        </button>
        <button type="button" className={`choice ${mode === 'flashcards' ? 'selected' : ''}`} onClick={() => setMode('flashcards')}>
          Flashcard
        </button>
        <button
          type="button"
          className={`choice ${mode === 'quiz' ? 'selected' : ''}`}
          onClick={() => void handleStartQuiz()}
          disabled={items.length === 0 || quizLoading}
        >
          {quizLoading ? 'Membuat kuis…' : 'Kuis'}
        </button>
      </div>

      {mode === 'list' && (
        <>
          {items.length === 0 ? (
            <p className="muted">
              Belum ada kosakata. Selesaikan satu sesi latihan — kata baru dari laporan koreksi akan muncul di sini.
              Kamu juga bisa memuat daftar contoh di bawah.
            </p>
          ) : (
            <ul className="vocab-list">
              {items.map((v) => (
                <li key={v.word}>
                  <strong>{v.word}</strong> — {v.meaning}
                  <br />
                  <span className="muted">“{v.example}”</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-secondary" onClick={handleAddBuiltin}>
            Muat 10 kata contoh
          </button>
        </>
      )}

      {mode === 'flashcards' && (
        <div className="flashcard-wrap">
          {items.length === 0 ? (
            <p className="muted">Belum ada kosakata untuk flashcard.</p>
          ) : (
            current && (
              <>
                <button
                  type="button"
                  className={`flashcard ${flipped ? 'flipped' : ''}`}
                  onClick={() => setFlipped((f) => !f)}
                  aria-label={flipped ? 'Lihat kata' : 'Lihat arti'}
                >
                  <span className="flashcard-word">{flipped ? current.meaning : current.word}</span>
                  <span className="flashcard-hint">{flipped ? current.example : 'Ketuk untuk melihat arti'}</span>
                </button>
                <p className="muted">
                  Kartu {cardIndex + 1} dari {items.length}
                </p>
                <div className="flashcard-nav">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={cardIndex === 0}
                    onClick={() => {
                      setCardIndex((i) => Math.max(0, i - 1));
                      setFlipped(false);
                    }}
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={cardIndex >= items.length - 1}
                    onClick={() => {
                      setCardIndex((i) => Math.min(items.length - 1, i + 1));
                      setFlipped(false);
                    }}
                  >
                    Berikutnya
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      {mode === 'quiz' && (
        <div className="quiz">
          {questions.length === 0 && !quizLoading && <p className="muted">Kuis belum dibuat.</p>}
          {quizSource && <p className="muted">{quizSource}</p>}
          {questions.map((q, qi) => (
            <fieldset key={qi} className="quiz-question">
              <legend>
                {qi + 1}. {q.question}
              </legend>
              <div className="quiz-options">
                {q.options.map((opt, oi) => {
                  const picked = answers[qi] === oi;
                  const correct = showResults && oi === q.answerIndex;
                  const wrongPick = showResults && picked && oi !== q.answerIndex;
                  return (
                    <button
                      type="button"
                      key={oi}
                      className={`choice quiz-option ${picked ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrongPick ? 'wrong' : ''}`}
                      onClick={() => {
                        if (!showResults) setAnswers((a) => ({ ...a, [qi]: oi }));
                      }}
                      disabled={showResults}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {showResults && <p className="muted">{q.explanation}</p>}
            </fieldset>
          ))}
          {questions.length > 0 && !showResults && (
            <button type="button" className="btn-primary" onClick={() => setShowResults(true)}>
              Lihat hasil
            </button>
          )}
          {showResults && (
            <p className="quiz-score">
              Skor: {score} dari {questions.length} benar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
