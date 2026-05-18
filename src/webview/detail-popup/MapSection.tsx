import { Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';

export function MapSection({ detail }: { detail: BirdDetail }) {
	if (!detail.map) return null;
	const m = detail.map;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Sightings map</p>
				{m.nearbyPins.length > 0 && (
					<div className='flex flex-col gap-2'>
						{m.nearbyPins.slice(0, 5).map((pin, i) => (
							<div
								key={i}
								className='flex items-center gap-2 text-detail text-text-dim'
							>
								<span className='h-2 w-2 flex-none rounded-full bg-accent shrink-0' />
								<span className='shrink-0'>{pin.date}</span>
								{pin.placeName && (
									<span className='truncate text-text!'>{pin.placeName}</span>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</Card>
	);
}
