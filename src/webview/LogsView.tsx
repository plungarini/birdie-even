import { Button, Card, EmptyState, Toast, allIcons } from 'even-toolkit/web';
import React, { useEffect, useState } from 'react';

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

function useDebugLogs(): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>(() => (window as unknown as GlobalWithLogs).__debugLogs ?? []);

  useEffect(() => {
    const prev = (window as unknown as GlobalWithLogs).__refreshDebug;
    (window as unknown as GlobalWithLogs).__refreshDebug = () => {
      setLogs([...((window as unknown as GlobalWithLogs).__debugLogs ?? [])]);
      prev?.();
    };
    return () => {
      (window as unknown as GlobalWithLogs).__refreshDebug = prev;
    };
  }, []);

  return logs;
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
  const allLogs = useDebugLogs();
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({ log: true, warn: true, error: true });
  const [toast, setToast] = useState('');

  const filteredLogs = allLogs.filter((l) => filters[l.level as LogLevel] ?? true);

  function toggleFilter(level: LogLevel) {
    setFilters((f) => ({ ...f, [level]: !f[level] }));
  }

  function clearLogs() {
    if (!confirm('Clear all logs?')) return;
    (window as unknown as GlobalWithLogs).__debugLogs = [];
    (window as unknown as GlobalWithLogs).__refreshDebug?.();
  }

  async function copyLogs() {
    const text = allLogs.map((l) => {
      const header = `[${l.level.toUpperCase()}] ${l.msg}`;
      return l.details?.length ? header + '\n' + formatDetails(l.details) : header;
    }).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied to clipboard');
    } catch {
      setToast('Copy failed');
    }
    setTimeout(() => setToast(''), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <Card padding="default" className="birdie-surface-card">
        <div className="flex flex-col gap-2">
          <p className="text-detail uppercase tracking-[0.28em] text-text-dim">Diagnostics</p>
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
          <EmptyState
            icon={<IcChecklist width={32} height={32} />}
            title="No logs"
            description={allLogs.length === 0 ? 'Logs will appear once the app starts.' : 'Nothing matches the current filters.'}
          />
        ) : (
          <div className="max-h-[320px] overflow-y-auto px-2 py-2">
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
          <Toast message={toast} />
        </div>
      )}
    </div>
  );
}
