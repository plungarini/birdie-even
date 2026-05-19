import { Button, Card, StatusDot, allIcons } from 'even-toolkit/web';
import React, { useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { requestCaptureControl } from '../control';
import {
	getJournalIndex,
	isNewToday,
	subscribeJournal,
	getJournalState,
} from '../journal';
import { birdieStore, selectOrderedDetections } from '../store';
import type { AggregatedDetection, BirdieStoreState } from '../store';
import { DetectionCard, type DetectionCardData } from './DetectionCard';
import { BirdDetailPopup } from './detail-popup';
import { buildBirdDetailsUrl, copyTextWithExecCommand, displayCommonName } from './utils';
import type { PersonalStats } from '../net/detail-types';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;
const IcBird = allIcons['feat-message'] as SvgIcon;

function useStore(): BirdieStoreState {
	return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

function useJournal() {
	return useSyncExternalStore(subscribeJournal, getJournalState, getJournalState);
}

const BLIMP_DURATION_MS = 4500;

function LiveWaveform({ peaks, active }: { peaks: number[]; active: boolean }) {
	const width = 100;
	const height = 30;
	const gap = 1.15;
	const barWidth = Math.max(0.75, (width - gap * (peaks.length - 1)) / peaks.length);

	return (
		<div className="birdie-waveform-shell">
			<div className="flex items-center justify-between gap-3">
				<p className="birdie-section-kicker">Live audio</p>
				<p className="text-detail text-text-dim">{active ? 'Realtime mic preview' : 'Starts with the next listening pass'}</p>
			</div>
			<div className="birdie-waveform mt-3">
				<svg viewBox={`0 0 ${width} ${height}`} className="h-[60px] w-full" preserveAspectRatio="none" aria-hidden="true">
					{peaks.map((peak, index) => {
						const normalized = active ? Math.max(0.08, peak) : Math.max(0.04, peak * 0.45);
						const barHeight = Math.max(2, normalized * (height - 4));
						const x = index * (barWidth + gap);
						const y = (height - barHeight) / 2;
						return (
							<rect
								key={index}
								x={x}
								y={y}
								width={barWidth}
								height={barHeight}
								rx={barWidth / 2}
								fill={active ? 'rgba(43, 58, 42, 0.9)' : 'rgba(92, 108, 87, 0.36)'}
							/>
						);
					})}
				</svg>
			</div>
		</div>
	);
}

export function HomeView() {
	const state = useStore();
	useJournal(); // re-render when life list updates
	const { hudStateType, lastError, isCaptureActive, waveformPeaks, latestBirdKeys, latestBirdUpdatedAt } = state;
	const ordered = selectOrderedDetections(state);
	const featured = ordered[0] ?? null;
	const modeToneClass = hudStateType === 'LISTENING' || hudStateType === 'ANALYZING' ? 'birdie-subtle-shimmer' : '';

	const [blimpingKeys, setBlimpingKeys] = useState<ReadonlySet<string>>(new Set());
	const blimpTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const [popupSpecies, setPopupSpecies] = useState<DetectionCardData | null>(null);
	const [toast, setToast] = useState('');
	const toastTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		if (!latestBirdKeys.length || !latestBirdUpdatedAt) return;
		setBlimpingKeys((prev) => new Set([...prev, ...latestBirdKeys]));
		for (const key of latestBirdKeys) {
			const existing = blimpTimers.current.get(key);
			if (existing) clearTimeout(existing);
			blimpTimers.current.set(key, setTimeout(() => {
				setBlimpingKeys((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
				blimpTimers.current.delete(key);
			}, BLIMP_DURATION_MS));
		}
	}, [latestBirdKeys, latestBirdUpdatedAt]);

	useEffect(() => {
		return () => {
			if (toastTimeoutRef.current !== null) {
				window.clearTimeout(toastTimeoutRef.current);
			}
		};
	}, []);

	function showToast(message: string) {
		setToast(message);
		if (toastTimeoutRef.current !== null) {
			window.clearTimeout(toastTimeoutRef.current);
		}
		toastTimeoutRef.current = window.setTimeout(() => {
			setToast('');
			toastTimeoutRef.current = null;
		}, 2200);
	}

	function handleCopyBirdUrl(detection: DetectionCardData) {
		const url = buildBirdDetailsUrl(detection);
		if (!url) {
			showToast('Bird details URL unavailable');
			return;
		}
		const copied = copyTextWithExecCommand(url);
		showToast(copied ? 'Copied bird details URL' : 'Copy failed');
	}

	function handleTapDetection(d: DetectionCardData) {
		setPopupSpecies(d);
	}

	function popupPersonalStats(d: AggregatedDetection): PersonalStats {
		return {
			firstIdentifiedAt: d.firstDetectedAt,
			lastDetectedAt: d.lastDetectedAt,
			detectionCount: d.count,
		};
	}

	function isCardNewToday(d: AggregatedDetection): boolean {
		const entry = getJournalIndex().lifeList[d.scientific_name];
		// Prefer life-list firstIdentifiedAt (persistent). Fall back to in-memory firstDetectedAt
		// for detections that haven't been committed yet (mid-session).
		return isNewToday(entry?.firstIdentifiedAt ?? d.firstDetectedAt);
	}

	const statusLine =
		isCaptureActive
			? 'Click to stop a listening session.'
			: 'Click to start a listening session.';

	return (
		<div className="birdie-scroll-panel">
			<div className="flex flex-col gap-5 pb-6">
				<Card padding="none" className={`birdie-surface-card birdie-hero ${modeToneClass}`}>
					<div className="birdie-card-body birdie-card-body--hero relative flex flex-col gap-5">
						<div className="flex items-start justify-between gap-4">
							<div className="flex min-w-0 flex-col gap-2">
								<p className="birdie-section-kicker">birdie companion</p>
								<h2 className="text-[1.9rem] leading-[1.02] tracking-[-0.04em] text-text">
									Listen for the next bird.
								</h2>
							</div>
							<div className={isCaptureActive ? 'birdie-hero__pulse' : ''}>
								<StatusDot connected={isCaptureActive} />
							</div>
						</div>
						<p className="max-w-[30ch] text-normal-body leading-snug text-text-dim">{statusLine}</p>

						<div className="flex flex-col gap-3">
							{isCaptureActive ? <LiveWaveform peaks={waveformPeaks} active={isCaptureActive} /> : null}
							<Button
								variant={isCaptureActive ? 'danger' : 'default'}
								onClick={() => requestCaptureControl(isCaptureActive ? 'stop' : 'start')}
								className={`birdie-listen-button ${isCaptureActive ? 'birdie-listen-button--stop' : ''}`}
							>
								{isCaptureActive ? 'Stop listening' : 'Start listening'}
							</Button>
						</div>

						{!featured ? (
							<div className="rounded-[18px] border border-dashed border-border bg-white px-4 py-5">
								<div className="flex flex-col items-center gap-3 text-center">
									<IcBird width={30} height={30} className="text-text-dim" />
									<div className="space-y-1">
										<p className="text-normal-title text-text">No detections yet</p>
										<p className="mx-auto max-w-[24ch] text-normal-body text-text-dim">
											Start listening near an open window or outside.
										</p>
									</div>
								</div>
							</div>
						) : null}
					</div>
				</Card>

				{lastError && hudStateType === 'ERROR' && (
					<Card padding="none" className="birdie-surface-card border-negative/30 bg-negative/5">
						<div className="birdie-card-body">
							<p className="text-detail text-text-dim uppercase tracking-[0.28em] mb-2">Recovery note</p>
							<p className="text-normal-body text-negative">{lastError}</p>
						</div>
					</Card>
				)}

				{ordered.length > 0 ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-center justify-between gap-3">
							<p className="birdie-section-title">Birds heard</p>
							<p className="text-detail text-text-dim">{ordered.length} species tracked</p>
						</div>
						{ordered.map((d) => (
							<DetectionCard
								key={d.scientific_name}
								detection={d}
								isBlimping={blimpingKeys.has(d.scientific_name)}
								isNewToday={isCardNewToday(d)}
								onCopyUrl={handleCopyBirdUrl}
								onTap={handleTapDetection}
							/>
						))}
					</section>
				) : null}
			</div>

			{toast && (
				<div className="fixed bottom-24 left-4 right-4 z-50">
					<div className="birdie-surface-card birdie-card-body text-center">
						<p className="birdie-section-title">{toast}</p>
						<p className="mt-1 text-detail text-text-dim">
							{toast === 'Copied bird details URL'
								? 'An eBird species page link is now on the clipboard.'
								: toast === 'Bird details URL unavailable'
									? 'This bird has no resolved eBird species code yet.'
									: 'Birdie could not copy the current eBird details link.'}
						</p>
					</div>
				</div>
			)}

			{popupSpecies && (
				<BirdDetailPopup
					scientificName={popupSpecies.scientific_name}
					onClose={() => setPopupSpecies(null)}
					personalStats={popupPersonalStats(
						state.detectionsByKey[popupSpecies.scientific_name],
					)}
					birdUrl={buildBirdDetailsUrl(popupSpecies)}
					fallback={{
						commonName: displayCommonName(popupSpecies),
						imageUrl: popupSpecies.image_url || null,
					}}
				/>
			)}
		</div>
	);
}
