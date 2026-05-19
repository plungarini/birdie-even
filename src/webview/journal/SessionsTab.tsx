import { useEffect, useState, useSyncExternalStore } from 'react';
import { getJournalIndex, loadSession, type JournalSession } from '../../journal';
import { getPreferencesState, subscribePreferences } from '../../preferences';
import { SessionAccordion } from './SessionAccordion';
import { BirdDetailPopup } from '../detail-popup';
import type { PersonalStats } from '../../net/detail-types';

function usePreferencesState() {
	return useSyncExternalStore(subscribePreferences, getPreferencesState, getPreferencesState);
}

export function SessionsTab({ onToast }: { onToast: (msg: string) => void }) {
	const index = getJournalIndex();
	const { values: preferences } = usePreferencesState();
	const [sessions, setSessions] = useState<JournalSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [popupTarget, setPopupTarget] = useState<{
		scientificName: string;
		personalStats: PersonalStats;
		birdUrl: string | null;
		fallback: { commonName: string | null; imageUrl: string | null };
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		(async () => {
			const results = await Promise.all(index.sessionIds.map((id) => loadSession(id)));
			if (cancelled) return;
			setSessions(results.filter((s): s is JournalSession => s !== null));
			setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [index]);

	if (loading) {
		return <p className="px-1 text-detail text-text-dim">Loading sessions…</p>;
	}

	if (sessions.length === 0) {
		return (
			<div className="rounded-[18px] border border-dashed border-border bg-white px-4 py-6">
				<p className="text-normal-title text-text">No sessions yet</p>
				<p className="mt-1 text-normal-body text-text-dim">
					Start a listening session from the Home tab. Sessions with at least one bird are saved here automatically.
				</p>
			</div>
		);
	}

	function handleSelectSpecies(
		scientificName: string,
		personalStats: PersonalStats,
		birdUrl: string | null,
		fallback: { commonName: string | null; imageUrl: string | null },
	) {
		setPopupTarget({ scientificName, personalStats, birdUrl, fallback });
	}

	return (
		<>
			<div className="flex flex-col gap-3">
				{sessions.map((s) => (
					<SessionAccordion
						key={s.id}
						session={s}
						onCopyToast={onToast}
						onSelectSpecies={handleSelectSpecies}
						showCity={preferences.sessionShowCity}
					/>
				))}
			</div>

			{popupTarget && (
				<BirdDetailPopup
					scientificName={popupTarget.scientificName}
					onClose={() => setPopupTarget(null)}
					personalStats={popupTarget.personalStats}
					birdUrl={popupTarget.birdUrl}
					fallback={popupTarget.fallback}
				/>
			)}
		</>
	);
}
