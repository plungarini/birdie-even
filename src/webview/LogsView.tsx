import { Button, Card, allIcons } from 'even-toolkit/web';
import React, { useEffect, useRef, useState } from 'react';
import { useDebugLogs, shouldDisplayDebugLog } from '../debug/logs';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;
const IcChecklist = allIcons['edit-checklist'] as SvgIcon;

type LogLevel = 'log' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: number;
  details?: unknown[];
}

type GlobalWithLogs = {
  __debugLogs?: LogEntry[];
  __refreshDebug?: () => void;
};

const LEVEL_LABEL: Record<LogLevel, string> = { log: 'Log', warn: 'Warn', error: 'Error' };
const LEVEL_COLOR: Record<LogLevel, string> = {
  log: 'text-text-dim',
  warn: 'text-accent-warning',
  error: 'text-negative',
};

function formatDetails(details: unknown[]): string {
  return details.map((d, i) => {
    const obj = d as Record<string, unknown> | null;
    if (obj?.['_type'] === 'Error') return `[Error ${i + 1}] ${obj['name']}: ${obj['message']}\n${obj['stack'] ?? ''}`;
    if (obj?.['_type'] === 'Response') return `[Response ${i + 1}] ${obj['status']} ${obj['statusText']}\nURL: ${obj['url']}`;
    try { return `[Arg ${i + 1}] ${JSON.stringify(d, null, 2)}`; }
    catch { return `[Arg ${i + 1}] ${String(d)}`; }
  }).join('\n\n');
}

function LogItem({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(log.ts).toLocaleTimeString([], { hour12: false });
  const level = (log.level ?? 'log') as LogLevel;
  const hasDetails = (log.details?.length ?? 0) > 0;

  return (
    <div
      className={[
        'birdie-log-card',
        level === 'warn' ? 'birdie-log-card--warn' : '',
        level === 'error' ? 'birdie-log-card--error' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`w-full text-left p-3 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start gap-2">
          <span className="text-text-dim text-[10px] shrink-0 pt-0.5">{time}</span>
          <span className={`${LEVEL_COLOR[level]} uppercase text-[10px] font-bold shrink-0 pt-0.5 min-w-[34px]`}>
            {level}
          </span>
          <span className="text-text break-all flex-1 text-[11px] font-mono leading-relaxed">{log.msg}</span>
          {hasDetails && <span className="shrink-0 text-text-dim text-[10px]">{expanded ? '▲' : '▼'}</span>}
        </div>
      </button>
      {expanded && hasDetails && (
        <div className="px-3 pb-3">
          <pre className="text-[10px] font-mono text-text-dim bg-black/5 p-3 rounded-[12px] overflow-x-auto whitespace-pre-wrap">
            {formatDetails(log.details!)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function LogsPanel() {
  const allLogs = useDebugLogs() as LogEntry[];
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({ log: true, warn: true, error: true });
  const [toast, setToast] = useState('');
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState<LogEntry[]>(allLogs);
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFeedPaused) {
      setVisibleLogs(allLogs);
    }
  }, [allLogs, isFeedPaused]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const filteredLogs = visibleLogs.filter((l) => filters[l.level as LogLevel] ?? true);

  function showToast(message: string) {
    setToast(message);
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast('');
      setIsFeedPaused(false);
      toastTimeoutRef.current = null;
    }, 2200);
  }

  function toggleFilter(level: LogLevel) {
    setFilters((f) => ({ ...f, [level]: !f[level] }));
  }

  function clearLogs() {
    if (!confirm('Clear all logs?')) return;
    (window as unknown as GlobalWithLogs).__debugLogs =
      ((window as unknown as GlobalWithLogs).__debugLogs ?? []).filter((entry) => !shouldDisplayDebugLog(entry));
    (window as unknown as GlobalWithLogs).__refreshDebug?.();
  }

  async function copyLogs() {
    const snapshot = filteredLogs;
    const text = snapshot.map((l) => {
      const header = `[${l.level.toUpperCase()}] ${l.msg}`;
      return l.details?.length ? header + '\n' + formatDetails(l.details) : header;
    }).join('\n\n');
    try {
      setIsFeedPaused(true);
      setVisibleLogs(allLogs);
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(successful ? 'Logs copied' : 'Copy failed');
    } catch {
      showToast('Copy failed');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card padding="none" className="birdie-surface-card">
        <div className="birdie-card-body flex flex-col gap-2">
          <p className="birdie-section-kicker">Diagnostics</p>
          <p className="text-normal-body text-text-dim">
            Runtime logs for Birdie capture, network responses, and worker failures.
          </p>
        </div>
      </Card>

      <div className="flex gap-2 shrink-0">
        {(['log', 'warn', 'error'] as LogLevel[]).map((level) => (
          <Button
            key={level}
            variant="secondary"
            size="sm"
            onClick={() => toggleFilter(level)}
            className={`birdie-chip birdie-chip--interactive flex-1 ${filters[level] ? 'is-active' : ''}`}
          >
            {LEVEL_LABEL[level]}
          </Button>
        ))}
      </div>

      <p className="text-[10px] text-text-dim shrink-0">
        {filteredLogs.length} of {allLogs.length} entries
      </p>

      <Card padding="none" className="birdie-surface-card overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="birdie-card-body flex min-h-[180px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-[18px] border border-dashed border-border bg-white/65">
              <IcChecklist width={30} height={30} className="text-text-dim" />
            </div>
            <div className="space-y-2">
              <p className="birdie-section-title">
                {allLogs.length === 0 ? 'Waiting for runtime activity' : 'No logs match these filters'}
              </p>
              <p className="mx-auto max-w-[26ch] text-normal-body text-text-dim">
                {allLogs.length === 0
                  ? 'Start a capture or open the glasses flow to populate Birdie diagnostics.'
                  : 'Try enabling another log level to bring matching entries back into view.'}
              </p>
            </div>
          </div>
        ) : (
            <div className="max-h-[320px] overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {filteredLogs.map((l, i) => <LogItem key={i} log={l} />)}
              </div>
            </div>
        )}
      </Card>

      <div className="flex gap-2 shrink-0">
        <Button variant="default" onClick={copyLogs} className="birdie-quiet-button flex-1">Copy</Button>
        <Button variant="danger" onClick={clearLogs} className="birdie-quiet-button flex-1" data-variant="danger">
          Clear
        </Button>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-4 right-4 z-50">
          <div className="birdie-surface-card birdie-card-body text-center">
            <p className="birdie-section-title">{toast}</p>
            <p className="mt-1 text-detail text-text-dim">
              {toast === 'Logs copied' ? 'A filtered Birdie diagnostics snapshot is now on the clipboard.' : 'Birdie could not copy the current diagnostics snapshot.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
