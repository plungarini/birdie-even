import { Card } from 'even-toolkit/web';
import type { BirdDetail } from '../../net/detail-types';
import { imgErrorHide } from './shared';

export function GallerySection({ detail }: { detail: BirdDetail }) {
	if (detail.media.gallery.length === 0) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Gallery</p>
				<div className='flex gap-2 overflow-x-auto'>
					{detail.media.gallery.map((photo, i) => (
						<img
							key={i}
							src={photo.url}
							alt=''
							className='h-20 w-20 flex-none rounded-xl object-cover'
							onError={imgErrorHide}
						/>
					))}
				</div>
			</div>
		</Card>
	);
}
