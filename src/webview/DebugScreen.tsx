import { useSyncExternalStore } from 'react';
import { birdieStore } from '../store';

function useStore() {
  return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

export function DebugScreen() {
  const state = useStore();

  return (
    <div className="px-3 pt-4 pb-8 space-y-4">
      <h2 className="text-[17px] font-semibold">Debug</h2>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-1 text-[13px]">
        <div className="flex justify-between">
          <span className="text-text-dim">Listening</span>
          <span className={state.isListening ? 'text-green-500' : ''}>{state.isListening ? 'yes' : 'no'}</span>
        </div>
        {state.lastError && (
          <div className="flex justify-between">
            <span className="text-text-dim">Last error</span>
            <span className="text-red-400 max-w-[60%] text-right">{state.lastError}</span>
          </div>
        )}
      </section>

      {state.lastDetections.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-[13px] font-medium text-text-dim uppercase tracking-wide px-1">Last detections</h3>
          <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
            {state.lastDetections.map((d, i) => (
              <div key={i} className="flex justify-between text-[13px]">
                <span>{d.common_name}</span>
                <span className="text-text-dim">{Math.round(d.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {state.lastRawResponse !== null && (
        <section className="space-y-1">
          <h3 className="text-[13px] font-medium text-text-dim uppercase tracking-wide px-1">Raw response</h3>
          <pre className="rounded-xl border border-border bg-surface p-4 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(state.lastRawResponse, null, 2)}
          </pre>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-[13px] font-medium text-text-dim uppercase tracking-wide px-1">Console logs</h3>
        <DebugLogs />
      </section>
    </div>
  );
}

function DebugLogs() {
  const [, forceUpdate] = [0, () => {}];
  // Register the global refresh callback so new log entries trigger re-render.
  if (typeof window !== 'undefined') {
    (window as unknown as { __refreshDebug?: () => void }).__refreshDebug = forceUpdate;
  }

  const logs: Array<{ level: string; msg: string; ts: number }> =
    (window as unknown as { __debugLogs?: Array<{ level: string; msg: string; ts: number }> }).__debugLogs ?? [];

  if (logs.length === 0) {
    return <p className="text-[12px] text-text-dim px-1">No logs yet.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-surface divide-y divide-border">
      {[...logs].reverse().map((l, i) => (
        <div key={i} className="px-4 py-2 flex gap-2 items-start text-[11px]">
          <span
            className={
              l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-text-dim'
            }
          >
            {l.level.toUpperCase()}
          </span>
          <span className="break-all">{l.msg}</span>
        </div>
      ))}
    </div>
  );
}
