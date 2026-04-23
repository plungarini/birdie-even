import { useState } from 'react';
import { AppShell, NavBar, ScreenHeader, Card } from 'even-toolkit/web';
import type { NavItem } from 'even-toolkit/web';
import { AppGlasses } from './glasses/AppGlasses';
import type { AppSnapshot } from './glasses/shared';

const tabs: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [tab, setTab] = useState('home');

  const snapshot: AppSnapshot = {
    message: 'Hello from BirdLens',
  };

  return (
    <>
      <AppGlasses snapshot={snapshot} />
      <AppShell header={<NavBar items={tabs} activeId={tab} onNavigate={setTab} />}>
        <div className="px-3 pt-4 pb-8">
          <ScreenHeader title="BirdLens" />
          <Card>
            <p className="text-[15px] text-text-dim">
              Hello from BirdLens!
            </p>
          </Card>
        </div>
      </AppShell>
    </>
  );
}
