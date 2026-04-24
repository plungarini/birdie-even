import { Badge, Button, Card, StatusDot, allIcons } from 'even-toolkit/web';
import React, { useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { requestCaptureControl } from '../control';
import { birdieStore, selectOrderedDetections } from '../store';
import type { AggregatedDetection, BirdieStoreState } from '../store';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;
const IcBird = allIcons['feat-message'] as SvgIcon;

function useStore(): BirdieStoreState {
  return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

type BadgeVariant = 'positive' | 'negative' | 'accent' | 'neutral';

const STATE_LABEL: Record<BirdieStoreState['hudStateType'], string> = {
  IDLE: 'Idle',
  LISTENING: 'Listening',
  ANALYZING: 'Analyzing',
  DETECTED: 'Detected',
  NO_DETECTION: 'No birds',
  ERROR: 'Error',
};

const STATE_BADGE: Record<BirdieStoreState['hudStateType'], BadgeVariant> = {
  IDLE: 'neutral',
  LISTENING: 'accent',
  ANALYZING: 'accent',
  DETECTED: 'positive',
  NO_DETECTION: 'neutral',
  ERROR: 'negative',
};

const STATE_HINT: Record<BirdieStoreState['hudStateType'], string> = {
  IDLE: 'Press the G2 side button to start a listening session.',
  LISTENING: 'Holding the room tone now. Keep the glasses pointed toward birdsong.',
  ANALYZING: 'BirdNET is identifying the strongest calls in the latest clip.',
  DETECTED: 'Recognition complete. Press again anytime for another listening pass.',
  NO_DETECTION: 'Nothing confident enough yet. Try a quieter spot or hold steady for a few seconds.',
  ERROR: 'The latest pass failed, but Birdie is ready to recover on the next try.',
};

function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatShortRelative(ts: number | null): string {
  if (!ts) return '—';
  const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function confidenceVariant(confidence: number): BadgeVariant {
  if (confidence >= 0.78) return 'positive';
  if (confidence >= 0.55) return 'accent';
  return 'neutral';
}

const BLIMP_DURATION_MS = 4500;

function LiveWaveform({ peaks, active }: { peaks: number[]; active: boolean }) {
  const width = 100;
  const height = 30;
  const gap = 1.15;
  const barWidth = Math.max(0.75, (width - gap * (peaks.length - 1)) / peaks.length);

  return (
    <div className="birdie-waveform-shell">
      <div className="flex items-center justify-between gap-3">
        <p className="birdie-section-kicker">Live audio</p>
        <p className="text-detail text-text-dim">{active ? 'Realtime mic preview' : 'Starts with the next listening pass'}</p>
      </div>
      <div className="birdie-waveform mt-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[60px] w-full" preserveAspectRatio="none" aria-hidden="true">
          {peaks.map((peak, index) => {
            const normalized = active ? Math.max(0.08, peak) : Math.max(0.04, peak * 0.45);
            const barHeight = Math.max(2, normalized * (height - 4));
            const x = index * (barWidth + gap);
            const y = (height - barHeight) / 2;
            return (
              <rect
                key={index}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={barWidth / 2}
                fill={active ? 'rgba(43, 58, 42, 0.9)' : 'rgba(92, 108, 87, 0.36)'}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DetectionCard({
  detection,
  isBlimping,
}: {
  detection: AggregatedDetection;
  isBlimping: boolean;
}) {
  return (
    <Card padding="none" className={`birdie-surface-card ${isBlimping ? 'birdie-card--blimp' : ''}`}>
      <div className="birdie-card-body">
        <div className="flex items-start justify-between gap-3">
          {detection.image_url ? (
            <img
              src={detection.image_url}
              alt=""
              className="h-16 w-16 flex-none rounded-[14px] object-cover bg-white/40"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-normal-title text-text break-words">{detection.common_name}</p>
            <p className="mt-1 text-detail italic text-text-dim break-words">{detection.scientific_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={confidenceVariant(detection.bestConfidence)} className="birdie-chip">
                {pct(detection.bestConfidence)}
              </Badge>
              <Badge variant="neutral" className="birdie-chip">Heard {detection.count}×</Badge>
              <Badge variant="neutral" className="birdie-chip">{formatShortRelative(detection.lastDetectedAt)}</Badge>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HomeView() {
  const state = useStore();
  const { hudStateType, lastError, isCaptureActive, waveformPeaks, latestBirdKeys, latestBirdUpdatedAt } = state;
  const ordered = selectOrderedDetections(state);
  const featured = ordered[0] ?? null;
  const modeToneClass = hudStateType === 'LISTENING' || hudStateType === 'ANALYZING' ? 'birdie-subtle-shimmer' : '';

  // Reactive blimp set — keys pulse for BLIMP_DURATION_MS then are cleared.
  const [blimpingKeys, setBlimpingKeys] = useState<ReadonlySet<string>>(new Set());
  const blimpTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!latestBirdKeys.length || !latestBirdUpdatedAt) return;
    setBlimpingKeys((prev) => new Set([...prev, ...latestBirdKeys]));
    for (const key of latestBirdKeys) {
      const existing = blimpTimers.current.get(key);
      if (existing) clearTimeout(existing);
      blimpTimers.current.set(key, setTimeout(() => {
        setBlimpingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        blimpTimers.current.delete(key);
      }, BLIMP_DURATION_MS));
    }
  }, [latestBirdKeys, latestBirdUpdatedAt]);

  const statusLine =
    hudStateType === 'DETECTED' && featured
      ? `${featured.common_name} · heard ${featured.count}×`
      : hudStateType === 'LISTENING'
        ? 'Listening for birdsong'
        : hudStateType === 'ANALYZING'
          ? 'Identifying the latest audio clip'
          : hudStateType === 'NO_DETECTION'
            ? 'No confident match yet'
            : hudStateType === 'ERROR'
              ? 'Session needs a retry'
              : 'Ready to begin';

  return (
    <div className="birdie-scroll-panel">
      <div className="flex flex-col gap-5 pb-6">
        <Card padding="none" className={`birdie-surface-card birdie-hero ${modeToneClass}`}>
          <div className="birdie-card-body birdie-card-body--hero relative flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="birdie-section-kicker">birdie companion</p>
                <h2 className="text-[1.9rem] leading-[1.02] tracking-[-0.04em] text-text">
                  {featured ? featured.common_name : 'Listen for the next bird.'}
                </h2>
                <p className="text-normal-body text-text-dim">{statusLine}</p>
              </div>
              <div className={isCaptureActive ? 'birdie-hero__pulse' : ''}>
                <StatusDot connected={isCaptureActive} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATE_BADGE[hudStateType]} className="birdie-chip">{STATE_LABEL[hudStateType]}</Badge>
              <Badge variant="neutral" className="birdie-chip">{formatShortRelative(state.lastDetectionsUpdatedAt)}</Badge>
            </div>

            <p className="max-w-[30ch] text-normal-body leading-snug text-text-dim">{STATE_HINT[hudStateType]}</p>

            <div className="flex flex-col gap-3">
              {isCaptureActive ? <LiveWaveform peaks={waveformPeaks} active={isCaptureActive} /> : null}
              <Button
                variant={isCaptureActive ? 'danger' : 'default'}
                onClick={() => requestCaptureControl(isCaptureActive ? 'stop' : 'start')}
                className={`birdie-listen-button ${isCaptureActive ? 'birdie-listen-button--stop' : ''}`}
              >
                {isCaptureActive ? 'Stop listening' : 'Start listening'}
              </Button>
            </div>

            {!featured ? (
              <div className="rounded-[18px] border border-dashed border-border bg-white px-4 py-5">
                <div className="flex flex-col items-center gap-3 text-center">
                  <IcBird width={30} height={30} className="text-text-dim" />
                  <div className="space-y-1">
                    <p className="text-normal-title text-text">No detections yet</p>
                    <p className="mx-auto max-w-[24ch] text-normal-body text-text-dim">
                      Start listening near an open window or outside.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {lastError && hudStateType === 'ERROR' && (
          <Card padding="none" className="birdie-surface-card border-negative/30 bg-negative/5">
            <div className="birdie-card-body">
              <p className="text-detail text-text-dim uppercase tracking-[0.28em] mb-2">Recovery note</p>
              <p className="text-normal-body text-negative">{lastError}</p>
            </div>
          </Card>
        )}

        {ordered.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="birdie-section-title">Birds heard</p>
              <p className="text-detail text-text-dim">{ordered.length} species tracked</p>
            </div>
            {ordered.map((d) => (
              <DetectionCard
                key={d.scientific_name}
                detection={d}
                isBlimping={blimpingKeys.has(d.scientific_name)}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
