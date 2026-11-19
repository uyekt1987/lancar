import { useEffect, useState } from 'react';
import { checkNanoAvailability } from '../lib/ai';
import type { InferenceOrigin } from '../lib/types';

export type NanoStatus = 'available' | 'downloading' | 'downloadable' | 'unavailable' | 'unknown';

interface StatusBarProps {
  mode: 'firebase' | 'demo';
  deviceReady: boolean;
  deviceDownloading: boolean;
  deviceProgress: number;
}

const NANO_LABEL: Record<NanoStatus, string> = {
  available: 'Gemini Nano: tersedia',
  downloading: 'Gemini Nano: sedang mengunduh…',
  downloadable: 'Gemini Nano: siap diunduh',
  unavailable: 'Gemini Nano: tidak tersedia',
  unknown: 'Gemini Nano: tidak terdeteksi',
};

export function SourceBadge({ source }: { source: InferenceOrigin }) {
  if (source === 'on-device') {
    return <span className="badge badge-device">Nano • on-device</span>;
  }
  if (source === 'cloud') {
    return <span className="badge badge-cloud">Cloud • Gemini</span>;
  }
  return <span className="badge badge-demo">Demo • lokal</span>;
}

export default function StatusBar({ mode, deviceReady, deviceDownloading, deviceProgress }: StatusBarProps) {
  const [nano, setNano] = useState<NanoStatus>('unknown');
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    let cancelled = false;
    void checkNanoAvailability().then((value) => {
      if (!cancelled) setNano(value);
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <div className="statusbar" role="status">
      <span className={`status-pill ${online ? 'ok' : 'warn'}`}>
        <span className="dot" aria-hidden="true" />
        {online ? 'Online' : 'Offline'}
      </span>
      <span className={`status-pill ${nano === 'available' ? 'ok' : nano === 'downloading' || nano === 'downloadable' ? 'warn' : ''}`}>
        {NANO_LABEL[nano]}
      </span>
      <span className="status-pill">{mode === 'firebase' ? 'Mode: Firebase' : 'Mode: Demo'}</span>
      {deviceDownloading && (
        <span className="status-pill warn">Mengunduh model Nano… {Math.round(deviceProgress * 100)}%</span>
      )}
      {deviceReady && <span className="status-pill ok">Model Nano siap (offline)</span>}
    </div>
  );
}
