import { Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';

export function DescriptionSection({ detail }: { detail: BirdDetail }) {
	const { taglineShort, descriptionLong, descriptionIsFallback } =
		detail.description;
	const hasDescription = descriptionLong || taglineShort;
	if (!hasDescription) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body flex flex-col gap-2'>
				{descriptionLong && (
					<div>
						{descriptionLong
							.split('\n')
							.filter(Boolean)
							.map((para, i) => (
								<p
									key={i}
									className='text-normal-body text-text mb-2 leading-relaxed'
								>
									{para}
								</p>
							))}
						{descriptionIsFallback && (
							<p className='text-detail text-text-dim mt-1'>
								(Description from iNaturalist)
							</p>
						)}
					</div>
				)}
				{/* {wikipediaUrl && (
					<a
						href={wikipediaUrl}
						target='_blank'
						rel='noopener noreferrer'
						className='text-detail font-medium text-accent hover:underline'
					>
						Read more on Wikipedia →
					</a>
				)} */}
			</div>
		</Card>
	);
}
