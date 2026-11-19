import { useEffect, useRef, useState } from 'react';
import { chatTurn, correctionReport, ensureDeviceModel, getDeviceInitState } from '../lib/ai';
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
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setSending(true);
    void chatTurn(settings, persona, [], 'Hello! Please greet me and start our conversation.')
      .then((result) => {
        setMessages([{ id: nextId(), role: 'tutor', text: result.text, source: result.source }]);
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

      <button type="button" className="btn-secondary end-session" onClick={() => void handleEndSession()} disabled={ending || sending}>
        {ending ? 'Membuat laporan koreksi…' : 'Akhiri & lihat koreksi'}
      </button>
    </section>
  );
}
