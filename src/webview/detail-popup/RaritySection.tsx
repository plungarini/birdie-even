import { Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';
import { RARITY_DOT_BORDERS, formatRarityLabel, pluralize } from './shared';

export function RaritySection({ detail }: { detail: BirdDetail }) {
	if (!detail.rarity) return null;
	const r = detail.rarity;

	return (
		<Card
			padding='none'
			className={`birdie-surface-card ${RARITY_DOT_BORDERS[r.tier]}`}
		>
			<div className={`birdie-card-body flex items-center gap-3`}>
				<div>
					<p className='text-normal-title text-text capitalize font-semibold'>
						{formatRarityLabel(r.tier)}
					</p>
					<p className='text-detail text-text-dim'>
						Seen {r.localCount90d} {pluralize(r.localCount90d, 'time')} nearby
						in the last 90 days
					</p>
					{r.lastSeenNearby && (
						<p className='text-detail text-text-dim mt-0.5'>
							Last seen {r.lastSeenNearby.date}
							{r.lastSeenNearby.placeName ?
								` at ${r.lastSeenNearby.placeName}`
							:	''}
							{' · '}
							{r.lastSeenNearby.distanceKm} km away
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}
