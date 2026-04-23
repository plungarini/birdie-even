import { Badge, Button, Card } from 'even-toolkit/web';
import { useSyncExternalStore } from 'react';
import { config } from '../config';
import { birdieStore } from '../store';
import { LogsPanel } from './LogsView';

function useStore() {
  return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

export function SettingsView() {
  const state = useStore();
  const diagnostics = state.diagnostics;
  const connectionVariant =
    state.hudStateType === 'ERROR'
      ? 'negative'
      : state.isListening
        ? 'accent'
        : 'positive';
  const lastClipLabel = state.lastDetectionsUpdatedAt
    ? new Date(state.lastDetectionsUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'None yet';
  const lastCaptureLabel = diagnostics.lastCaptureStartedAt
    ? new Date(diagnostics.lastCaptureStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';
  const lastPacketLabel = diagnostics.lastAudioPacketAt
    ? new Date(diagnostics.lastAudioPacketAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'No packets';

  return (
    <div className="birdie-scroll-panel">
      <div className="flex flex-col gap-5 pb-6">
        <Card padding="none" className="birdie-surface-card">
          <div className="birdie-card-body flex flex-col gap-4">
            <div className="min-w-0">
              <p className="birdie-section-kicker">BirdNET session</p>
              <h2 className="mt-2 text-[1.8rem] leading-[1.04] tracking-[-0.04em] text-text">Birdie is tuned for short, repeatable listening passes.</h2>
              <p className="mt-3 text-normal-body text-text-dim">
                The glasses handle capture locally, then BirdNET scores the latest clip against your configured endpoint.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={connectionVariant} className="birdie-chip">
                {state.hudStateType.toLowerCase()}
              </Badge>
              <span className="text-detail text-text-dim">
                {state.isCaptureActive ? 'Capture is active on the glasses.' : 'Waiting for the next listening pass.'}
              </span>
            </div>
          </div>
        </Card>

      <section className="flex flex-col gap-3">
        <p className="birdie-section-title">BirdNET session</p>
        <div className="grid grid-cols-2 gap-3">
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
            <p className="text-detail uppercase tracking-[0.24em] text-text-dim">Capture state</p>
            <p className="mt-2 text-normal-title text-text">{state.isCaptureActive ? 'Listening live' : 'Waiting'}</p>
            </div>
          </Card>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
            <p className="text-detail uppercase tracking-[0.24em] text-text-dim">Last clip</p>
            <p className="mt-2 text-normal-title text-text">{lastClipLabel}</p>
            </div>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="birdie-section-title">Audio capture</p>
        <div className="grid grid-cols-3 gap-3">
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
            <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Sample rate</p>
            <p className="mt-2 text-normal-title text-text">{config.sampleRate / 1000}kHz</p>
            </div>
          </Card>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
            <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Channels</p>
            <p className="mt-2 text-normal-title text-text">{config.channels === 1 ? 'Mono' : String(config.channels)}</p>
            </div>
          </Card>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
            <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Bit depth</p>
            <p className="mt-2 text-normal-title text-text">{config.bitDepth}-bit</p>
            </div>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="birdie-section-title">Analysis thresholds</p>
        <Card padding="none" className="birdie-surface-card">
          <div className="birdie-card-body grid gap-4 sm:grid-cols-2">
            <div className="grid gap-3">
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Chunk duration</p>
                <p className="mt-2 text-normal-title text-text">{config.chunkDurationMs / 1000}s per request</p>
              </div>
              <div className="flex items-center justify-between gap-4 text-normal-body">
                <span className="text-text-dim">Minimum clip</span>
                <span className="text-text">{config.minChunkDurationMs / 1000}s</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-normal-body">
                <span className="text-text-dim">Maximum clip</span>
                <span className="text-text">{config.maxChunkDurationMs / 1000}s</span>
              </div>
            </div>
            <div className="rounded-[20px] border border-border-light bg-white/55 px-4 py-4">
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Minimum confidence</p>
              <p className="mt-2 text-[2.2rem] leading-none tracking-[-0.05em] text-text">
                {Math.round(config.minConfidence * 100)}%
              </p>
              <p className="mt-2 text-detail text-text-dim">
                Lower values are more permissive; higher values reduce uncertain matches.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <p className="birdie-section-title">Connection</p>
        <Card padding="none" className="birdie-surface-card">
          <div className="birdie-card-body flex flex-col gap-2">
            <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Endpoint</p>
            <p className="text-normal-body font-mono break-all text-text">{config.connectionLabel}</p>
            <p className="text-detail text-text-dim">
              {config.connectionHint}
            </p>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <p className="birdie-section-title">Diagnostics</p>
        <Card padding="none" className="birdie-surface-card">
          <div className="birdie-card-body grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last error</p>
              <p className="mt-2 text-normal-body text-text">
                {state.lastError ?? 'No recent BirdNET or network errors.'}
              </p>
            </div>
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Analyze status</p>
              <p className="mt-2 text-normal-body text-text">
                {diagnostics.lastAnalyzeStatus ?? 'Waiting for first capture.'}
              </p>
            </div>
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Capture started</p>
              <p className="mt-2 text-normal-body text-text">{lastCaptureLabel}</p>
            </div>
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last audio packet</p>
              <p className="mt-2 text-normal-body text-text">{lastPacketLabel}</p>
            </div>
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last flush size</p>
              <p className="mt-2 text-normal-body text-text">
                {diagnostics.lastFlushBytes !== null ? `${diagnostics.lastFlushBytes} B` : 'No flush yet'}
              </p>
            </div>
            <div>
              <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Capture issue</p>
              <p className="mt-2 text-normal-body text-text">
                {diagnostics.lastCaptureError ?? 'No microphone errors recorded.'}
              </p>
            </div>
            <Button variant="default" disabled className="birdie-quiet-button sm:col-span-2">
              Live logs below
            </Button>
          </div>
        </Card>
        <LogsPanel />
      </section>
      </div>
    </div>
  );
}
