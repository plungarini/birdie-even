import { Card } from 'even-toolkit/web';
import { useState } from 'react';
import type { BirdDetail } from '../../net/detail-types';
import { RecordingCard } from './RecordingCard';

export function SoundsSection({ detail }: { detail: BirdDetail }) {
	const [playingId, setPlayingId] = useState<string | null>(null);

	if (detail.recordings.length === 0) {
		return (
			<Card padding='none' className='birdie-surface-card'>
				<div className='birdie-card-body'>
					<p className='birdie-section-kicker mb-1'>Recordings</p>
					<p className='text-detail text-text-dim'>
						No recordings available
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-1'>
					Recordings · {detail.recordings.length}
				</p>
			</div>
			<div className='max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/30 [&::-webkit-scrollbar-track]:bg-transparent'>
				{detail.recordings.map((r, i) => (
					<RecordingCard
						key={r.id}
						r={r}
						playingId={playingId}
						onPlayingChange={setPlayingId}
						onPlayNext={
							i < detail.recordings.length - 1
								? () => setPlayingId(detail.recordings[i + 1].id)
								: undefined
						}
					/>
				))}
			</div>
		</Card>
	);
}