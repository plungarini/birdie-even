import { Card } from 'even-toolkit/web';
import { useState } from 'react';
import {
	getJournalIndex,
	isNewToday,
	type JournalSession,
} from '../../journal';
import { DetectionCard, type DetectionCardData } from '../DetectionCard';
import { buildBirdDetailsUrl, copyTextWithExecCommand } from '../utils';
import { SessionHeader } from './SessionHeader';

export function SessionAccordion({
	session,
	onCopyToast,
}: {
	session: JournalSession;
	onCopyToast: (message: string) => void;
}) {
	const [expanded, setExpanded] = useState(false);

	function handleCopy(detection: DetectionCardData) {
		const url = buildBirdDetailsUrl(detection);
		if (!url) {
			onCopyToast('Bird details URL unavailable');
			return;
		}
		const ok = copyTextWithExecCommand(url);
		onCopyToast(ok ? 'Copied bird details URL' : 'Copy failed');
	}

	const index = getJournalIndex();

	return (
		<Card padding="none" className="birdie-surface-card">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="birdie-card-body w-full text-left cursor-pointer"
				aria-expanded={expanded}
			>
				<SessionHeader session={session} expanded={expanded} />
			</button>
			{expanded && session.detections.length > 0 ? (
				<div className="flex flex-col gap-3 px-3 pb-3">
					{session.detections.map((d) => {
						const lifeEntry = index.lifeList[d.scientific_name];
						return (
							<DetectionCard
								key={d.scientific_name}
								detection={d}
								countLabel={`Heard ${d.count}× in session`}
								isNewToday={isNewToday(lifeEntry?.firstIdentifiedAt ?? d.firstDetectedAt)}
								onCopyUrl={handleCopy}
							/>
						);
					})}
				</div>
			) : null}
			{expanded && session.detections.length === 0 ? (
				<div className="px-4 pb-4 text-detail text-text-dim">No birds detected in this session.</div>
			) : null}
		</Card>
	);
}
