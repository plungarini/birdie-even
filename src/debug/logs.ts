import { useEffect, useState } from 'react';

export interface DebugLogEntry {
  level: 'log' | 'warn' | 'error';
  msg: string;
  ts: number;
  details?: unknown[];
}

declare global {
  var __birdieDebugInstalled: boolean | undefined;
  var __debugLogs: DebugLogEntry[] | undefined;
  var __refreshDebug: (() => void) | undefined;
}

const MAX_LOGS = 250;
const LOG_PREFIX_ALLOWLIST = ['[birdie]', '[capture]', '[birdie-proxy]'];

function refresh() {
  globalThis.__refreshDebug?.();
}

function push(level: DebugLogEntry['level'], msg: string, details?: unknown[]) {
  const next = [...(globalThis.__debugLogs ?? []), { level, msg, ts: Date.now(), details }];
  globalThis.__debugLogs = next.slice(-MAX_LOGS);
  refresh();
}

function shouldSkipLog(level: DebugLogEntry['level'], msg: string): boolean {
  if (!msg.trim()) return true;
  if (
    msg.startsWith('[EvenAppBridge]') ||
    msg.includes('EvenHub event:') ||
    msg.includes('audioPcm') ||
    msg.includes('Captured audio') ||
    msg.includes('rawEventsCleared emitted without explicit MainE') ||
    msg.includes('eventManager') ||
    msg.includes('Explicit MainEventsCleared')
  ) {
    return true;
  }
  if (level === 'log') {
    if (!LOG_PREFIX_ALLOWLIST.some((prefix) => msg.startsWith(prefix))) {
      return true;
    }
    return (
      msg.startsWith('[capture] first audioEvent shape:') ||
      msg.startsWith('[birdie] state transition') ||
      msg.startsWith('[birdie] click event accepted') ||
      msg.startsWith('[birdie] foreground enter') ||
      msg.startsWith('[birdie] foreground exit / abnormal exit') ||
      msg.startsWith('[birdie] stale analyze result ignored') ||
      msg.startsWith('[birdie] stale analyze error ignored')
    );
  }
  return false;
}

function summarizeAudioPayload(detail: unknown): { msg: string; detail: unknown } | null {
  if (typeof detail === 'string' && detail.includes('audioPcm')) {
    const sampleMatch = detail.match(/"audioPcm"\s*:\s*\[(.*?)\]/s);
    const values = sampleMatch?.[1]?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
    return {
      msg: `[EvenAppBridge] Captured audio (${values.length} samples in preview)`,
      detail: '[audioPcm payload summarized]',
    };
  }

  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  const candidates = [
    record['audioPcm'],
    (record['jsonData'] as Record<string, unknown> | undefined)?.['audioPcm'],
    (record['audioEvent'] as Record<string, unknown> | undefined)?.['audioPcm'],
  ];
  const audio = candidates.find((value) => Array.isArray(value));
  if (!Array.isArray(audio)) return null;

  return {
    msg: `[EvenAppBridge] Captured audio (${audio.length} samples)`,
    detail: { audioPcm: `[${audio.length} samples]` },
  };
}

function normalize(detail: unknown): string {
  if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`.trim();
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function joinArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  const audioSummary = args.map((arg) => summarizeAudioPayload(arg)).find(Boolean);
  if (audioSummary) return audioSummary.msg;
  return args.map((arg) => normalize(arg)).join(' ');
}

function sanitizeDetails(args: unknown[]): unknown[] {
  return args.map((arg) => {
    const audioSummary = summarizeAudioPayload(arg);
    if (audioSummary) return audioSummary.detail;
    return arg;
  });
}

function installCapture() {
  if (globalThis.__birdieDebugInstalled) return;
  globalThis.__birdieDebugInstalled = true;
  globalThis.__debugLogs = globalThis.__debugLogs ?? [];

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => {
    const msg = joinArgs(args);
    if (!shouldSkipLog('log', msg)) {
      push('log', msg, sanitizeDetails(args));
    }
    original.log(...args);
  };
  console.warn = (...args: unknown[]) => {
    const msg = joinArgs(args);
    if (!shouldSkipLog('warn', msg)) {
      push('warn', msg, sanitizeDetails(args));
    }
    original.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    const msg = joinArgs(args);
    if (!shouldSkipLog('error', msg)) {
      push('error', msg, sanitizeDetails(args));
    }
    original.error(...args);
  };

  window.addEventListener('error', (event) => {
    const target = event.target as (EventTarget & { src?: string; href?: string; tagName?: string }) | null;
    if (target && target !== window) {
      push('error', 'resource load error', [{ tagName: target.tagName, src: target.src, href: target.href }]);
      return;
    }
    const errorEvent = event as ErrorEvent;
    push('error', errorEvent.message || 'window error', [
      errorEvent.error ?? errorEvent.filename,
      { lineno: errorEvent.lineno, colno: errorEvent.colno },
    ]);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    push('error', 'unhandled rejection', [event.reason]);
  });

  push('log', '[birdie] debug console capture installed');
}

installCapture();

function cloneLogs() {
  return [...(globalThis.__debugLogs ?? [])];
}

export function useDebugLogs(): DebugLogEntry[] {
  const [logs, setLogs] = useState<DebugLogEntry[]>(cloneLogs());

  useEffect(() => {
    const previous = globalThis.__refreshDebug;
    const handleRefresh = () => {
      setLogs(cloneLogs());
      previous?.();
    };
    globalThis.__refreshDebug = handleRefresh;
    return () => {
      if (globalThis.__refreshDebug === handleRefresh) {
        globalThis.__refreshDebug = previous;
      }
    };
  }, []);

  return logs;
}

export {};
