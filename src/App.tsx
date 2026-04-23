import { useState, useSyncExternalStore } from 'react';
import { AppShell, NavBar, ScreenHeader } from 'even-toolkit/web';
import type { NavItem } from 'even-toolkit/web';
import { birdieStore } from './store';
import { SettingsScreen } from './webview/SettingsScreen';
import { DebugScreen } from './webview/DebugScreen';

const tabs: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'settings', label: 'Settings' },
  { id: 'debug', label: 'Debug' },
];

function useStore() {
  return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

export default function App() {
  const [tab, setTab] = useState('home');
  const state = useStore();

  return (
    <AppShell header={<NavBar items={tabs} activeId={tab} onNavigate={setTab} />}>
      {tab === 'home' && (
        <div className="px-3 pt-4 pb-8 space-y-4">
          <ScreenHeader title="BirdLens" />
          <div className="rounded-xl border border-border bg-surface p-5 text-center space-y-2">
            <p className="text-[15px] font-medium">
              {state.isListening ? '◉ Listening...' : 'Ready'}
            </p>
            <p className="text-[13px] text-text-dim">
              Tap the G2 to start or stop listening.
            </p>
          </div>
          {state.lastDetections.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
              {state.lastDetections.slice(0, 5).map((d, i) => (
                <div key={i} className="flex justify-between text-[14px]">
                  <span>{d.common_name}</span>
                  <span className="text-text-dim">{Math.round(d.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          {state.lastError && (
            <p className="text-[13px] text-red-400 px-1">{state.lastError}</p>
          )}
        </div>
      )}
      {tab === 'settings' && <SettingsScreen />}
      {tab === 'debug' && <DebugScreen />}
    </AppShell>
  );
}
