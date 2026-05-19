import { Card } from 'even-toolkit/web';
import { useState } from 'react';
import type { BirdDetail } from '../../net/detail-types';
import { LightboxViewer } from './LightboxViewer';
import { imgErrorHide } from './shared';

export function GallerySection({ detail }: { detail: BirdDetail }) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

	if (detail.media.gallery.length === 0) return null;

	const photos = detail.media.gallery.map((p) => ({
		url: p.url,
		largeUrl: p.largeUrl,
		attribution: p.attribution ?? undefined,
	}));

	return (
		<>
			<Card padding='none' className='birdie-surface-card'>
				<div className='birdie-card-body'>
					<p className='birdie-section-kicker mb-2'>
						Gallery · {photos.length}
					</p>
					<div className='flex gap-2 overflow-x-auto pb-1'>
						{photos.map((photo, i) => (
							<button
								key={i}
								type='button'
								onClick={() => setLightboxIndex(i)}
								className='flex-none overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
								aria-label={`View photo ${i + 1}`}
							>
								<img
									src={photo.url}
									alt=''
									className='size-36 object-cover transition-transform duration-200 hover:scale-105 active:scale-95'
									onError={imgErrorHide}
								/>
							</button>
						))}
					</div>
				</div>
			</Card>

			{lightboxIndex !== null && (
				<LightboxViewer
					photos={photos}
					initialIndex={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
				/>
			)}
		</>
	);
}
