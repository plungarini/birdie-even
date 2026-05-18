import { Card } from 'even-toolkit/web';
import type { BirdDetail, PersonalStats } from '../../net/detail-types';
import { pluralize } from './shared';

export function StatsSection({
	detail,
	personalStats,
}: {
	detail: BirdDetail;
	personalStats?: PersonalStats | null;
}) {
	const hasGlobalStats = detail.stats.globalObservationsCount !== null ||
		detail.stats.recordingsAvailable !== null;
	const hasPersonalStats = personalStats !== null && personalStats !== undefined;
	if (!hasGlobalStats && !hasPersonalStats) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Stats</p>
				<div className='flex flex-col gap-1.5'>
					{detail.stats.globalObservationsCount !== null && (
						<p className='text-detail text-text-dim'>
							Global observations: {detail.stats.globalObservationsCount.toLocaleString()}
						</p>
					)}
					{detail.stats.recordingsAvailable !== null && (
						<p className='text-detail text-text-dim'>
							Recordings available: {detail.stats.recordingsAvailable}
						</p>
					)}
					{hasPersonalStats && (
						<PersonalStatsBlock stats={personalStats!} />
					)}
				</div>
			</div>
		</Card>
	);
}

function PersonalStatsBlock({ stats }: { stats: PersonalStats }) {
	return (
		<>
			<p className='text-detail text-text-dim'>
				You've spotted this species {stats.detectionCount} {pluralize(stats.detectionCount, 'time')}
			</p>
			<p className='text-detail text-text-dim'>
				First spotted: {new Date(stats.firstIdentifiedAt).toLocaleDateString()}
			</p>
			<p className='text-detail text-text-dim'>
				Last spotted: {new Date(stats.lastDetectedAt).toLocaleDateString()}
			</p>
		</>
	);
}
