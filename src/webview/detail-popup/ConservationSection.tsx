import { Badge, Card } from 'even-toolkit/web';
import type { BirdDetail, IucnStatus } from '../../net/detail-types';

// Severity colors aligned with the server's IUCN_SEVERITY_ORDER (LC, NT, VU, EN, CR, EW, EX, DD).
const SCALE_COLORS = [
	'bg-teal-500', // LC
	'bg-lime-500', // NT
	'bg-amber-500', // VU
	'bg-orange-500', // EN
	'bg-red-500', // CR
	'bg-red-700', // EW
	'bg-stone-800', // EX
	'bg-gray-400', // DD
];

const SCALE_LABELS: IucnStatus[] = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'];

export function ConservationSection({ detail }: { detail: BirdDetail }) {
	const c = detail.conservation;
	const hasAny =
		c.iucnStatus !== null ||
		c.native === true ||
		c.introduced === true ||
		c.endemic === true;
	if (!hasAny) return null;

	const info = c.iucnInfo;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Conservation</p>

				{info && (
					<div className='flex flex-col gap-3'>
						<div className='flex items-baseline gap-2'>
							<span
								className={`inline-block h-3 w-3 rounded-full ${SCALE_COLORS[info.severityIndex] ?? 'bg-gray-400'}`}
								aria-hidden
							/>
							<p className='text-normal-title text-text'>{info.label}</p>
							<span className='text-detail text-text-dim'>· {info.code}</span>
						</div>

						<div>
							<p className='birdie-section-kicker mb-1'>IUCN Red List scale</p>
							<div className='flex items-center gap-1'>
								{SCALE_LABELS.map((code, i) => {
									const isActive = i === info.severityIndex;
									const baseColor = SCALE_COLORS[i];
									return (
										<div key={code} className='flex flex-1 flex-col items-center gap-1'>
											<div
												className={`h-2 w-full rounded-full ${isActive ? baseColor : 'bg-border/40'}`}
											/>
											<span
												className={`text-[10px] leading-none ${isActive ? 'font-semibold text-text' : 'text-text-dim'}`}
											>
												{code}
											</span>
										</div>
									);
								})}
							</div>
						</div>

						{info.blurb && (
							<p className='text-normal-body text-text-dim'>{info.blurb}</p>
						)}
					</div>
				)}

				{!info && c.iucnStatus && (
					<div className='flex items-baseline gap-2'>
						<span
							className='inline-block h-3 w-3 rounded-full bg-gray-400'
							aria-hidden
						/>
						<p className='text-normal-title text-text'>IUCN: {c.iucnStatus}</p>
					</div>
				)}

				{(c.native === true ||
					c.introduced === true ||
					c.endemic === true ||
					c.threatened === true) && (
					<div className='mt-3 flex flex-wrap gap-2'>
						{c.native === true && (
							<Badge variant='neutral' className='birdie-chip'>
								Native here
							</Badge>
						)}
						{c.introduced === true && (
							<Badge variant='neutral' className='birdie-chip'>
								Introduced here
							</Badge>
						)}
						{c.endemic === true && (
							<Badge variant='neutral' className='birdie-chip'>
								Endemic here
							</Badge>
						)}
						{c.threatened === true && (
							<Badge variant='negative' className='birdie-chip'>
								Threatened
							</Badge>
						)}
					</div>
				)}
			</div>
		</Card>
	);
}
