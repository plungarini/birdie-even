import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getJournalState, subscribeJournal } from '../../journal';
import { LifeListTab } from './LifeListTab';
import { SessionsTab } from './SessionsTab';

type TabKey = 'sessions' | 'lifelist';

function useJournal() {
	return useSyncExternalStore(subscribeJournal, getJournalState, getJournalState);
}

export function JournalView() {
	const journal = useJournal();
	const [tab, setTab] = useState<TabKey>('sessions');
	const [toast, setToast] = useState('');
	const toastTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
		};
	}, []);

	function showToast(message: string) {
		setToast(message);
		if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
		toastTimeoutRef.current = window.setTimeout(() => {
			setToast('');
			toastTimeoutRef.current = null;
		}, 2200);
	}

	if (!journal.hydrated) {
		return (
			<div className="birdie-scroll-panel">
				<p className="px-1 pt-4 text-detail text-text-dim">Loading journal…</p>
			</div>
		);
	}

	return (
		<div className="birdie-scroll-panel">
			<div className="flex flex-col gap-4 pb-6">
				<div className="birdie-tab-switch flex gap-1 rounded-full border border-border bg-white p-1">
					<button
						type="button"
						onClick={() => setTab('sessions')}
						className={[
							'flex-1 cursor-pointer rounded-full px-3 py-2 text-detail font-medium transition-colors',
							tab === 'sessions' ? 'bg-accent text-white' : 'text-text-dim hover:text-text',
						].join(' ')}
						aria-pressed={tab === 'sessions'}
					>
						Sessions
					</button>
					<button
						type="button"
						onClick={() => setTab('lifelist')}
						className={[
							'flex-1 cursor-pointer rounded-full px-3 py-2 text-detail font-medium transition-colors',
							tab === 'lifelist' ? 'bg-accent text-white' : 'text-text-dim hover:text-text',
						].join(' ')}
						aria-pressed={tab === 'lifelist'}
					>
						Life list
					</button>
				</div>

				{tab === 'sessions' ? <SessionsTab onToast={showToast} /> : <LifeListTab onToast={showToast} />}
			</div>

			{toast && (
				<div className="fixed bottom-24 left-4 right-4 z-50">
					<div className="birdie-surface-card birdie-card-body text-center">
						<p className="birdie-section-title">{toast}</p>
					</div>
				</div>
			)}
		</div>
	);
}
