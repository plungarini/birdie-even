import { Badge, Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';

function formatDuration(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SoundsSection({ detail }: { detail: BirdDetail }) {
	if (detail.recordings.length === 0) {
		return (
			<Card padding='none' className='birdie-surface-card'>
				<div className='birdie-card-body'>
					<p className='birdie-section-kicker mb-1'>Recordings</p>
					<p className='text-detail text-text-dim'>No recordings available</p>
				</div>
			</Card>
		);
	}

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Recordings</p>
				<div className='flex flex-col gap-2'>
					{detail.recordings.map((r) => (
						<RecordingRow key={r.id} r={r} />
					))}
				</div>
			</div>
		</Card>
	);
}

function RecordingRow({ r }: { r: BirdDetail['recordings'][number] }) {
	return (
		<div className='flex flex-col gap-1 rounded-xl border border-border/10 bg-white/80 p-2.5'>
			<div className='flex items-center justify-between'>
				<div className='flex flex-wrap gap-1'>
					{r.types.map((t) => (
						<Badge
							key={t}
							variant='neutral'
							className='text-[0.6rem] px-1.5 py-0.5'
						>
							{t}
						</Badge>
					))}
				</div>
				{r.lengthSeconds !== null && (
					<span className='text-detail text-text-dim'>
						{formatDuration(r.lengthSeconds)}
					</span>
				)}
			</div>
			<audio
				controls
				src={r.audioUrl}
				className='mt-1 h-8 w-full'
				preload='none'
			>
				Your browser does not support audio.
			</audio>
			<div className='flex flex-wrap gap-x-3 gap-y-0.5 text-detail text-text-dim'>
				{r.recordist && <span>{r.recordist}</span>}
				{r.country && <span>{r.country}</span>}
				{r.date && <span>{r.date}</span>}
			</div>
		</div>
	);
}
