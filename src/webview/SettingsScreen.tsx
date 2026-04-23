import { config } from '../config';

export function SettingsScreen() {
  return (
    <div className="px-3 pt-4 pb-8 space-y-4">
      <h2 className="text-[17px] font-semibold">Settings</h2>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-2 text-[14px]">
        <div className="flex justify-between">
          <span className="text-text-dim">Worker URL</span>
          <span className="font-mono text-[12px] truncate max-w-[55%]">{config.workerUrl}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Chunk duration</span>
          <span>{config.chunkDurationMs / 1000}s</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Min confidence</span>
          <span>{Math.round(config.minConfidence * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Sample rate</span>
          <span>{config.sampleRate} Hz</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Channels</span>
          <span>{config.channels === 1 ? 'mono' : config.channels}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Bit depth</span>
          <span>{config.bitDepth}-bit</span>
        </div>
      </section>

      <p className="text-[12px] text-text-dim px-1">
        To change values, edit <code>.env</code> and rebuild.
      </p>
    </div>
  );
}
