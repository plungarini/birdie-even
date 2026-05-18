import { Badge, Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';

export function ConservationSection({ detail }: { detail: BirdDetail }) {
	const c = detail.conservation;
	const hasAny = c.iucnStatus !== null || c.native !== null || c.introduced !== null ||
		c.endemic !== null || c.threatened !== null;
	if (!hasAny) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Conservation</p>
				<div className='flex flex-wrap gap-2'>
					{c.iucnStatus && (
						<Badge variant='neutral' className='birdie-chip'>
							IUCN: {c.iucnStatus}
						</Badge>
					)}
					{c.native === true && (
						<Badge variant='neutral' className='birdie-chip'>
							Native
						</Badge>
					)}
					{c.introduced === true && (
						<Badge variant='neutral' className='birdie-chip'>
							Introduced
						</Badge>
					)}
					{c.endemic === true && (
						<Badge variant='neutral' className='birdie-chip'>
							Endemic
						</Badge>
					)}
					{c.threatened === true && (
						<Badge variant='negative' className='birdie-chip'>
							Threatened
						</Badge>
					)}
				</div>
			</div>
		</Card>
	);
}
