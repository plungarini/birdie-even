import { Button, Card } from 'even-toolkit/web';
import { useState } from 'react';
import {
	deleteSession,
	getJournalIndex,
	isNewToday,
	type JournalSession,
} from '../../journal';
import { DetectionCard, type DetectionCardData } from '../DetectionCard';
import { buildBirdDetailsUrl, copyTextWithExecCommand } from '../utils';
import { SessionHeader } from './SessionHeader';
import type { PersonalStats } from '../../net/detail-types';

export function SessionAccordion({
	session,
	onCopyToast,
	onSelectSpecies,
}: {
	session: JournalSession;
	onCopyToast: (message: string) => void;
	onSelectSpecies?: (sciName: string, personalStats: PersonalStats, birdUrl: string | null) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	function handleCopy(detection: DetectionCardData) {
		const url = buildBirdDetailsUrl(detection);
		if (!url) {
			onCopyToast('Bird details URL unavailable');
			return;
		}
		const ok = copyTextWithExecCommand(url);
		onCopyToast(ok ? 'Copied bird details URL' : 'Copy failed');
	}

	async function handleDeleteSession() {
		if (isDeleting) return;
		if (!window.confirm('Delete this session? This action cannot be undone.'))
			return;

		setIsDeleting(true);
		try {
			await deleteSession(session.id);
			onCopyToast('Session deleted');
		} catch (err) {
			console.error('[birdie] delete session failed', err);
			onCopyToast('Could not delete session');
		} finally {
			setIsDeleting(false);
		}
	}

	const index = getJournalIndex();

	return (
		<Card padding='none' className='birdie-surface-card'>
			<button
				type='button'
				onClick={() => setExpanded((v) => !v)}
				className='birdie-card-body w-full text-left cursor-pointer'
				aria-expanded={expanded}
			>
				<SessionHeader session={session} expanded={expanded} />
			</button>
			<div
				className='grid transition-[grid-template-rows] duration-[420ms] ease-in-out'
				style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
			>
				<div className='overflow-hidden'>
					{session.detections.length > 0 ?
						<div className='flex flex-col gap-3 px-3 pb-3'>
							{session.detections.map((d) => {
								const lifeEntry = index.lifeList[d.scientific_name];
								return (
									<DetectionCard
										key={d.scientific_name}
										detection={d}
										countLabel={`Heard ${d.count}× in session`}
										isNewToday={isNewToday(
											lifeEntry?.firstIdentifiedAt ?? d.firstDetectedAt,
										)}
										onCopyUrl={handleCopy}
										onTap={onSelectSpecies ? (det) => {
											onSelectSpecies(
												det.scientific_name,
												{
													firstIdentifiedAt: lifeEntry?.firstIdentifiedAt ?? d.firstDetectedAt,
													lastDetectedAt: d.lastDetectedAt,
													detectionCount: d.count,
												},
												buildBirdDetailsUrl(det),
											);
										} : undefined}
									/>
								);
							})}
						</div>
					:	<div className='px-4 pb-4 text-detail text-text-dim'>
							No birds detected in this session.
						</div>
					}
					<div className='px-4 pb-4'>
						<Button
							variant='danger'
							onClick={handleDeleteSession}
							disabled={isDeleting}
							className='birdie-quiet-button w-full'
						>
							{isDeleting ? 'Deleting…' : 'Delete session'}
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
