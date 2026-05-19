import { useEffect, useRef, useState } from 'react';
import { fetchBirdDetail } from '../../net/bird-detail';
import type {
	BirdDetail,
	BirdDetailRequest,
	PersonalStats,
} from '../../net/detail-types';
import { getBirdiePreferences } from '../../preferences';
import { ConservationSection } from './ConservationSection';
import { DescriptionSection } from './DescriptionSection';
import { GallerySection } from './GallerySection';
import { HeroSection } from './HeroSection';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MapSection } from './MapSection';
import { RaritySection } from './RaritySection';
import { SoundsSection } from './SoundsSection';
import { StatsSection } from './StatsSection';

export interface BirdDetailPopupProps {
	scientificName: string;
	userLocale?: string;
	userLat?: number;
	userLng?: number;
	personalStats?: PersonalStats | null;
	onClose: () => void;
}

const ANIM_MS = 420;

export function BirdDetailPopup({
	scientificName,
	userLocale,
	userLat,
	userLng,
	personalStats,
	onClose,
}: BirdDetailPopupProps) {
	const [detail, setDetail] = useState<BirdDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [visible, setVisible] = useState(false);
	const [closing, setClosing] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		const raf = requestAnimationFrame(() => setVisible(true));
		return () => cancelAnimationFrame(raf);
	}, []);

	const handleClose = () => {
		setClosing(true);
		setTimeout(onClose, ANIM_MS + 20);
	};

	useEffect(() => {
		const abort = new AbortController();
		abortRef.current = abort;
		setLoading(true);
		setError(null);

		const locale = userLocale ?? getBirdiePreferences().locale;
		const lat = userLat ?? getBirdiePreferences().locationLat ?? undefined;
		const lng = userLng ?? getBirdiePreferences().locationLon ?? undefined;

		const request: BirdDetailRequest = { scientificName, locale };
		if (lat !== undefined && lng !== undefined) {
			request.lat = lat;
			request.lng = lng;
		}

		fetchBirdDetail(request, abort.signal)
			.then((data) => {
				if (!abort.signal.aborted) {
					setDetail(data);
					setLoading(false);
				}
			})
			.catch((err) => {
				if (!abort.signal.aborted) {
					setError(
						err instanceof Error ? err.message : 'Failed to load details',
					);
					setLoading(false);
				}
			});

		return () => {
			abort.abort();
			abortRef.current = null;
		};
	}, [scientificName, userLocale, userLat, userLng]);

	// Preload full-res gallery images during browser idle time
	// so the lightbox opens instantly on slow connections.
	useEffect(() => {
		if (!detail?.media.gallery.length) return;
		const urls = detail.media.gallery.map((p) => p.largeUrl);
		const w = window as Window & {
			requestIdleCallback?: (cb: () => void) => number;
			cancelIdleCallback?: (id: number) => void;
		};
		const schedule =
			w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
		const cancel = w.cancelIdleCallback ?? window.clearTimeout;
		const handle = schedule(() => {
			for (const url of urls) {
				const img = new Image();
				img.src = url;
			}
		});
		return () => cancel(handle as number);
	}, [detail]);

	const isOpen = visible && !closing;

	return (
		<div className='fixed inset-0 z-50 flex items-end justify-center'>
			<div
				className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-[420ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
				onClick={handleClose}
			/>
			<div
				className={`relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl transition-transform duration-[420ms] ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
			>
				<div className='sticky top-0 z-50 flex items-center justify-between border-b border-border/20 bg-white/75 px-4 py-3 backdrop-blur-sm'>
					<p className='text-detail font-semibold text-text'></p>
					<button
						type='button'
						onClick={handleClose}
						className='birdie-quiet-button flex h-8 w-8 items-center justify-center rounded-full p-0 text-sm'
						aria-label='Close'
					>
						✕
					</button>
				</div>

				{loading && <LoadingSkeleton />}

				{error && (
					<div className='p-4 text-center text-text-dim'>
						<p className='text-normal-body'>{error}</p>
					</div>
				)}

				{detail && !loading && (
					<DetailContent detail={detail} personalStats={personalStats} />
				)}
			</div>
		</div>
	);
}

function DetailContent({
	detail,
	personalStats,
}: {
	detail: BirdDetail;
	personalStats?: PersonalStats | null;
}) {
	return (
		<div className='flex flex-col gap-4 p-4'>
			<HeroSection detail={detail} />
			<DescriptionSection detail={detail} />
			<SoundsSection detail={detail} />
			<GallerySection detail={detail} />
			<ConservationSection detail={detail} />
			{detail.rarity && <RaritySection detail={detail} />}
			<MapSection detail={detail} />
			<StatsSection detail={detail} personalStats={personalStats} />
		</div>
	);
}
