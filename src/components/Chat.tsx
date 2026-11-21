import { useEffect, useRef, useState } from 'react';
import { chatTurn, correctionReport, ensureDeviceModel, getDeviceInitState } from '../lib/ai';
import { demoReply } from '../lib/demoTutor';
import { getRemoteConfigValues } from '../lib/firebase';
import type { ChatMessage, CorrectionReportData, Settings } from '../lib/types';
import { SourceBadge } from './StatusBar';

interface ChatProps {
  settings: Settings;
  onEndSession: (report: CorrectionReportData, source: 'cloud' | 'demo') => void;
  onMessagesChanged: (userCount: number) => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${Date.now()}-${idCounter}`;
}

export default function Chat({ settings, onEndSession, onMessagesChanged }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceState, setDeviceState] = useState<'idle' | 'downloading' | 'ready' | 'failed'>(getDeviceInitState());
  const [deviceProgress, setDeviceProgress] = useState(0);
  const [persona, setPersona] = useState<string>(
    'Kamu adalah tutor percakapan bahasa Inggris yang ramah untuk pelajar Indonesia. Jawab dalam bahasa Inggris yang sederhana, lalu beri satu koreksi singkat bila ada kesalahan.',
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Remote Config can override the tutor persona; the in-code default above
  // applies until the fetch resolves (or when Firebase is unreachable).
  useEffect(() => {
    let cancelled = false;
    void getRemoteConfigValues().then((values) => {
      if (!cancelled && values.tutor_persona) setPersona(values.tutor_persona);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Send the opening tutor message once, via the same chatTurn path as the
  // rest of the conversation (so the first message also gets a real badge).
  // The greeting goes straight to the cloud (cloudOnly): the hybrid model's
  // on-device probe hangs for the full timeout in browsers without Nano,
  // and the greeting is the first thing the user sees — it should arrive
  // from Gemini, not from the demo fallback. (See ai.ts chatTurn.)
  // chatTurn never hangs: its AI call has a timeout and falls back to the
  // local demo tutor, so `sending` always clears. The .catch() below is a
  // last-resort guard — without it, a rejection here would leave the whole
  // chat locked on "Tutor sedang mengetik…" forever (the 2026-11-19 bug).
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setSending(true);
    void chatTurn(settings, persona, [], 'Hello! Please greet me and start our conversation.', true)
      .then((result) => {
        setMessages([{ id: nextId(), role: 'tutor', text: result.text, source: result.source }]);
        if (result.error) setError(result.error);
      })
      .catch(() => {
        setMessages([
          {
            id: nextId(),
            role: 'tutor',
            text: 'Hi! Selamat datang di Lancar. Ceritakan sedikit tentang dirimu dalam bahasa Inggris.',
            source: 'demo',
          },
        ]);
        setError('Tutor gagal dimulai. Tutor lokal menjawab untuk sementara — latihan tetap bisa dilanjutkan.');
      })
      .finally(() => setSending(false));
    // Only greet on mount; settings/persona changes start a fresh chat via App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleActivateOffline(): Promise<void> {
    setDeviceState('downloading');
    setDeviceProgress(0);
    await ensureDeviceModel((p) => setDeviceProgress(p));
    setDeviceState(getDeviceInitState());
  }

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    const history = [...messages, userMsg];
    setMessages(history);
    onMessagesChanged(1);
    setSending(true);
    try {
      const result = await chatTurn(settings, persona, history, text);
      setMessages([...history, { id: nextId(), role: 'tutor', text: result.text, source: result.source }]);
      if (result.error) setError(result.error);
    } catch {
      // chatTurn is designed to never throw (it returns a demo fallback on
      // failure), but if it ever does, still answer with the local demo
      // tutor so the user is never left with a message and no reply.
      const userCount = history.filter((m) => m.role === 'user').length;
      setMessages([...history, { id: nextId(), role: 'tutor', text: demoReply(settings, text, userCount), source: 'demo' }]);
      setError('AI cloud tidak bisa dihubungi (jaringan atau token App Check bermasalah). Tutor lokal menjawab untuk sementara — latihan tetap bisa dilanjutkan.');
    } finally {
      setSending(false);
    }
  }

  async function handleEndSession(): Promise<void> {
    const userSentences = messages.filter((m) => m.role === 'user').map((m) => m.text);
    if (userSentences.length === 0) {
      setError('Kirim minimal satu pesan dulu sebelum mengakhiri sesi.');
      return;
    }
    setEnding(true);
    setError(null);
    try {
      const { report, source } = await correctionReport(settings, userSentences);
      onEndSession(report, source);
    } catch {
      setError('Laporan koreksi gagal dibuat. Coba lagi sebentar lagi.');
    } finally {
      setEnding(false);
    }
  }

  return (
    <section className="card chat-card">
      <div className="chat-head">
        <div>
          <h2>Latihan percakapan</h2>
          <p className="muted">
            Topik: {settings.topic} • Level: {settings.level} • Gaya: {settings.style}
          </p>
        </div>
        {deviceState !== 'ready' && (
          <button type="button" className="btn-secondary" onClick={() => void handleActivateOffline()} disabled={deviceState === 'downloading'}>
            {deviceState === 'downloading'
              ? `Mengunduh Nano… ${Math.round(deviceProgress * 100)}%`
              : deviceState === 'failed'
                ? 'Coba aktifkan mode offline'
                : 'Aktifkan mode offline'}
          </button>
        )}
      </div>

      <div className="messages" aria-live="polite">
        {messages.length === 0 && !sending && <p className="muted">Memulai percakapan…</p>}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <p>{m.text}</p>
            {m.role === 'tutor' && m.source && (
              <div className="message-meta">
                <SourceBadge source={m.source} />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="message tutor typing">
            <p>Tutor sedang mengetik…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="composer">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSend();
          }}
          placeholder="Tulis jawabanmu dalam bahasa Inggris…"
          aria-label="Pesan untuk tutor"
          disabled={sending || ending}
        />
        <button type="button" className="btn-primary" onClick={() => void handleSend()} disabled={sending || ending || !input.trim()}>
          Kirim
        </button>
      </div>

      {/* Always clickable (except while the report itself is being built):
          it must never be locked by an in-flight tutor reply — a stuck
          "mengetik…" state used to make this button unreachable too. */}
      <button type="button" className="btn-secondary end-session" onClick={() => void handleEndSession()} disabled={ending}>
        {ending ? 'Membuat laporan koreksi…' : 'Akhiri & lihat koreksi'}
      </button>
    </section>
  );
}
