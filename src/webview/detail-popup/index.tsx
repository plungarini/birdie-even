import React, { useEffect, useRef, useState } from 'react';
import { fetchBirdDetail } from '../../net/bird-detail';
import type {
	BirdDetail,
	BirdDetailRequest,
	PersonalStats,
} from '../../net/detail-types';
import { getBirdiePreferences } from '../../preferences';
import { copyTextWithExecCommand } from '../utils';
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
	birdUrl?: string | null;
	onClose: () => void;
}

const ANIM_MS = 420;

export function BirdDetailPopup({
	scientificName,
	userLocale,
	userLat,
	userLng,
	personalStats,
	birdUrl,
	onClose,
}: BirdDetailPopupProps) {
	const [detail, setDetail] = useState<BirdDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [visible, setVisible] = useState(false);
	const [closing, setClosing] = useState(false);
	const [copied, setCopied] = useState(false);
	const copiedTimeoutRef = useRef<number | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
		};
	}, []);

	function handleCopyUrl() {
		if (!birdUrl) return;
		copyTextWithExecCommand(birdUrl);
		setCopied(true);
		if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
		copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1800);
	}

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
				className={`relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl transition-transform duration-[420ms] ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
			>
				<div className='sticky top-0 z-50 flex items-center justify-between border-b border-border/20 bg-white/75 px-4 py-3 backdrop-blur-sm'>
					{birdUrl ? (
						<button
							type='button'
							onClick={handleCopyUrl}
							className={`birdie-copy-icon-button inline-flex h-8 w-auto min-w-0 items-center gap-1.5 rounded-full px-2.5 text-detail font-medium ${copied ? 'birdie-copy-icon-button--copied' : ''}`}
							aria-label={copied ? 'eBird link copied' : 'Copy eBird link'}
							title={copied ? 'eBird link copied' : 'Copy eBird link'}
						>
							{copied ? (
								<CheckIcon width={16} height={16} className='shrink-0' />
							) : (
								<GlobeIcon width={16} height={16} className='shrink-0' />
							)}
							<span className='shrink-0 whitespace-nowrap'>
								{copied ? 'Copied' : 'Copy eBird link'}
							</span>
						</button>
					) : (
						<span className='h-8 w-8' aria-hidden />
					)}
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

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.85'
			strokeLinecap='round'
			strokeLinejoin='round'
			{...props}
		>
			<circle cx='12' cy='12' r='8.5' />
			<path d='M3.9 9h16.2' />
			<path d='M3.9 15h16.2' />
			<path d='M12 3.5c2.5 2.2 4 5.2 4 8.5s-1.5 6.3-4 8.5c-2.5-2.2-4-5.2-4-8.5s1.5-6.3 4-8.5Z' />
		</svg>
	);
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			{...props}
		>
			<path d='m6.5 12.5 3.4 3.4 7.6-8.1' />
		</svg>
	);
}
