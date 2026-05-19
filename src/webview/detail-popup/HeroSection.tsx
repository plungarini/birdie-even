import type { BirdDetail } from '../../net/detail-types';
import { RarityDot, formatRarityLabel, imgErrorHide } from './shared';

export function HeroSection({ detail }: { detail: BirdDetail }) {
	const heroPhoto = detail.media.heroPhoto;
	return (
		<div className='flex flex-col gap-3'>
			{heroPhoto && (
				<div className='absolute top-14 left-0 right-0 z-0 overflow-hidden'>
					<img
						src={heroPhoto.url}
						alt={detail.identity.commonName ?? detail.identity.scientificName}
						className='relative z-10 h-70 w-full object-cover'
						onError={imgErrorHide}
					/>

					<div className='pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-white from-5% to-transparent via-transparent' />
				</div>
			)}
			<div
				className={`flex items-start justify-between gap-3 relative z-30 ${heroPhoto ? 'pt-48' : ''}`}
			>
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
