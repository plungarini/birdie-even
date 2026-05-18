import { Badge, Card } from 'even-toolkit/web';
import { useEffect, useRef, useState } from 'react';
import type { BirdDetail, BirdDetailRequest, PersonalStats, RarityTier } from '../net/detail-types';
import { fetchBirdDetail } from '../net/bird-detail';
import { getBirdiePreferences } from '../preferences';

const RARITY_COLORS: Record<RarityTier, string> = {
	legendary: 'bg-indigo-500',
	rare: 'bg-amber-500',
	uncommon: 'bg-sky-500',
	common: 'bg-teal-500',
	very_common: 'bg-gray-500',
};

const RARITY_COLOR_RING: Record<RarityTier, string> = {
	legendary: 'ring-indigo-500/30',
	rare: 'ring-amber-500/30',
	uncommon: 'ring-sky-500/30',
	common: 'ring-teal-500/30',
	very_common: 'ring-gray-500/30',
};

function RarityDot({ tier, className = '' }: { tier: RarityTier; className?: string }) {
	return (
		<span
			className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${RARITY_COLORS[tier]} ${RARITY_COLOR_RING[tier]} ${className}`}
			aria-label={`Rarity: ${tier}`}
		/>
	);
}

export interface BirdDetailPopupProps {
	scientificName: string;
	userLocale?: string;
	userLat?: number;
	userLng?: number;
	personalStats?: PersonalStats | null;
	onClose: () => void;
}

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
	const abortRef = useRef<AbortController | null>(null);

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
					setError(err instanceof Error ? err.message : 'Failed to load details');
					setLoading(false);
				}
			});

		return () => {
			abort.abort();
			abortRef.current = null;
		};
	}, [scientificName, userLocale, userLat, userLng]);

	return (
		<div className='fixed inset-0 z-50 flex items-end justify-center'>
			<div
				className='absolute inset-0 bg-black/30 backdrop-blur-sm'
				onClick={onClose}
			/>
			<div className='relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl'>
				<div className='sticky top-0 z-20 flex items-center justify-between border-b border-border/20 bg-white/95 px-4 py-3 backdrop-blur-sm'>
					<p className='text-detail font-semibold text-text'>
						{scientificName}
					</p>
					<button
						type='button'
						onClick={onClose}
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

				{detail && !loading && <DetailContent detail={detail} personalStats={personalStats} />}
			</div>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className='flex animate-pulse flex-col gap-4 p-4'>
			<div className='h-40 w-full rounded-2xl bg-gray-200' />
			<div className='h-4 w-3/4 rounded-full bg-gray-200' />
			<div className='h-3 w-1/2 rounded-full bg-gray-200' />
			<div className='mt-2 h-20 w-full rounded-xl bg-gray-200' />
			<div className='h-3 w-full rounded-full bg-gray-200' />
			<div className='h-3 w-5/6 rounded-full bg-gray-200' />
			<div className='mt-2 h-16 w-full rounded-xl bg-gray-200' />
			<div className='h-16 w-full rounded-xl bg-gray-200' />
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
			<ConservationSection detail={detail} />
			{detail.rarity && <RaritySection detail={detail} />}
			<MapSection detail={detail} />
			<SoundsSection detail={detail} />
			<GallerySection detail={detail} />
			<StatsSection detail={detail} personalStats={personalStats} />
		</div>
	);
}

function HeroSection({ detail }: { detail: BirdDetail }) {
	const heroPhoto = detail.media.heroPhoto;
	return (
		<div className='flex flex-col gap-3'>
			{heroPhoto ?
				<div className='overflow-hidden rounded-2xl'>
					<img
						src={heroPhoto.url}
						alt={detail.identity.commonName ?? detail.identity.scientificName}
						className='h-40 w-full object-cover'
						onError={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = 'none';
						}}
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
							{detail.rarity.tier.replace('_', ' ')}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

function DescriptionSection({ detail }: { detail: BirdDetail }) {
	const { taglineShort, descriptionLong, descriptionIsFallback, wikipediaUrl } = detail.description;
	const hasDescription = descriptionLong || taglineShort;
	if (!hasDescription) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body flex flex-col gap-2'>
				{taglineShort && (
					<p className='text-normal-body text-text-dim italic leading-relaxed'>
						{taglineShort}
					</p>
				)}
				{descriptionLong && (
					<div>
						{descriptionLong.split('\n').filter(Boolean).map((para, i) => (
							<p key={i} className='text-normal-body text-text leading-relaxed'>
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
				{wikipediaUrl && (
					<a
						href={wikipediaUrl}
						target='_blank'
						rel='noopener noreferrer'
						className='text-detail font-medium text-accent hover:underline'
					>
						Read more on Wikipedia →
					</a>
				)}
			</div>
		</Card>
	);
}

function ConservationSection({ detail }: { detail: BirdDetail }) {
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

function RaritySection({ detail }: { detail: BirdDetail }) {
	if (!detail.rarity) return null;
	const r = detail.rarity;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body flex items-center gap-3'>
				<RarityDot tier={r.tier} className='h-4 w-4' />
				<div>
					<p className='text-normal-title text-text capitalize font-semibold'>
						{r.tier.replace('_', ' ')}
					</p>
					<p className='text-detail text-text-dim'>
						Seen {r.localCount90d} time{r.localCount90d !== 1 ? 's' : ''} nearby in the last 90 days
					</p>
					{r.lastSeenNearby && (
						<p className='text-detail text-text-dim mt-0.5'>
							Last seen {r.lastSeenNearby.date}
							{r.lastSeenNearby.placeName ? ` at ${r.lastSeenNearby.placeName}` : ''}
							{' · '}{r.lastSeenNearby.distanceKm} km away
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}

function MapSection({ detail }: { detail: BirdDetail }) {
	if (!detail.map) return null;
	const m = detail.map;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Sightings map</p>
				{m.nearbyPins.length > 0 && (
					<div className='flex flex-col gap-2'>
						{m.nearbyPins.slice(0, 5).map((pin, i) => (
							<div key={i} className='flex items-center gap-2 text-detail text-text-dim'>
								<span className='h-2 w-2 flex-none rounded-full bg-accent' />
								<span>{pin.date}</span>
								{pin.placeName && <span>· {pin.placeName}</span>}
							</div>
						))}
					</div>
				)}
				{m.globalTileUrlTemplate && (
					<p className='text-detail text-text-dim mt-2'>
						<a
							href={m.globalTileUrlTemplate.replace('{z}/{x}/{y}', '2/1/1')}
							target='_blank'
							rel='noopener noreferrer'
							className='text-accent hover:underline'
						>
							View global distribution →
						</a>
					</p>
				)}
			</div>
		</Card>
	);
}

function SoundsSection({ detail }: { detail: BirdDetail }) {
	if (detail.recordings.length === 0) {
		return (
			<Card padding='none' className='birdie-surface-card'>
				<div className='birdie-card-body'>
					<p className='birdie-section-kicker mb-1'>Sounds</p>
					<p className='text-detail text-text-dim'>No recordings available</p>
				</div>
			</Card>
		);
	}

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Sounds</p>
				<div className='flex flex-col gap-2'>
					{detail.recordings.map((r) => (
						<div key={r.id} className='flex flex-col gap-1 rounded-xl border border-border/10 bg-white/80 p-2.5'>
							<div className='flex items-center justify-between'>
								<div className='flex flex-wrap gap-1'>
									{r.types.map((t) => (
										<Badge key={t} variant='neutral' className='text-[0.6rem] px-1.5 py-0.5'>
											{t}
										</Badge>
									))}
								</div>
								{r.lengthSeconds !== null && (
									<span className='text-detail text-text-dim'>
										{Math.floor(r.lengthSeconds / 60)}:{String(r.lengthSeconds % 60).padStart(2, '0')}
									</span>
								)}
							</div>
							<audio controls src={r.audioUrl} className='mt-1 h-8 w-full' preload='none'>
								Your browser does not support audio.
							</audio>
							<div className='flex flex-wrap gap-x-3 gap-y-0.5 text-detail text-text-dim'>
								{r.recordist && <span>{r.recordist}</span>}
								{r.country && <span>{r.country}</span>}
								{r.date && <span>{r.date}</span>}
							</div>
						</div>
					))}
				</div>
			</div>
		</Card>
	);
}

function GallerySection({ detail }: { detail: BirdDetail }) {
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
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = 'none';
							}}
						/>
					))}
				</div>
			</div>
		</Card>
	);
}

function StatsSection({
	detail,
	personalStats,
}: {
	detail: BirdDetail;
	personalStats?: PersonalStats | null;
}) {
	const hasGlobalStats = detail.stats.globalObservationsCount !== null ||
		detail.stats.recordingsAvailable !== null;
	const hasPersonalStats = personalStats !== null && personalStats !== undefined;
	if (!hasGlobalStats && !hasPersonalStats) return null;

	return (
		<Card padding='none' className='birdie-surface-card'>
			<div className='birdie-card-body'>
				<p className='birdie-section-kicker mb-2'>Stats</p>
				<div className='flex flex-col gap-1.5'>
					{detail.stats.globalObservationsCount !== null && (
						<p className='text-detail text-text-dim'>
							Global observations: {detail.stats.globalObservationsCount.toLocaleString()}
						</p>
					)}
					{detail.stats.recordingsAvailable !== null && (
						<p className='text-detail text-text-dim'>
							Recordings available: {detail.stats.recordingsAvailable}
						</p>
					)}
					{hasPersonalStats && (
						<>
							<p className='text-detail text-text-dim'>
								You've spotted this species {personalStats!.detectionCount} time{personalStats!.detectionCount !== 1 ? 's' : ''}
							</p>
							<p className='text-detail text-text-dim'>
								First spotted: {new Date(personalStats!.firstIdentifiedAt).toLocaleDateString()}
							</p>
							<p className='text-detail text-text-dim'>
								Last spotted: {new Date(personalStats!.lastDetectedAt).toLocaleDateString()}
							</p>
						</>
					)}
				</div>
			</div>
		</Card>
	);
}
