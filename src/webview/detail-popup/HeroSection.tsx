import type { BirdDetail } from '../../net/detail-types';
import { RarityDot, formatRarityLabel, imgErrorHide } from './shared';

export function HeroSection({ detail }: { detail: BirdDetail }) {
	const heroPhoto = detail.media.heroPhoto;
	return (
		<div className='flex flex-col gap-3'>
			{heroPhoto ?
				<div className='overflow-hidden rounded-2xl'>
					<img
						src={heroPhoto.url}
						alt={detail.identity.commonName ?? detail.identity.scientificName}
						className='h-40 w-full object-cover'
						onError={imgErrorHide}
					/>
				</div>
			:	<div className='flex h-40 items-center justify-center rounded-2xl bg-gray-100'>
					<span className='text-4xl text-gray-300'>🐦</span>
				</div>
			}
			<div className='flex items-start justify-between gap-3'>
				<div className='min-w-0 flex-1'>
					<h2 className='text-xl font-semibold text-text leading-tight'>
						{detail.identity.commonName ?? detail.identity.scientificName}
					</h2>
					{detail.identity.commonName && (
						<p className='text-detail italic text-text-dim mt-0.5'>
							{detail.identity.scientificName}
						</p>
					)}
				</div>
				{detail.rarity && (
					<div className='flex items-center gap-2 rounded-full border border-border/20 bg-white/90 px-3 py-1.5'>
						<RarityDot tier={detail.rarity.tier} />
						<span className='text-detail font-semibold text-text capitalize'>
							{formatRarityLabel(detail.rarity.tier)}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
