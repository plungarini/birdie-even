import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BirdDetail } from '../../net/detail-types';

type Recording = BirdDetail['recordings'][number];

interface RecordingCardProps {
	r: Recording;
	playingId: string | null;
	onPlayingChange: (id: string | null) => void;
	onPlayNext?: () => void;
}

function formatDuration(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function capitalizeType(t: string): string {
	return t
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export function RecordingCard({
	r,
	playingId,
	onPlayingChange,
	onPlayNext,
}: RecordingCardProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const prevPlayingIdRef = useRef(playingId);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(r.lengthSeconds ?? 0);

	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		if (prevPlayingIdRef.current !== playingId) {
			prevPlayingIdRef.current = playingId;
			if (playingId === r.id && audio.paused) {
				audio.play().catch(() => {});
			}
		}

		if (playingId !== r.id && !audio.paused) {
			audio.pause();
		}
	}, [playingId, r.id]);

	const toggle = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (isPlaying) {
			audio.pause();
			onPlayingChange(null);
		} else {
			onPlayingChange(r.id);
			audio.play().catch(() => {
				onPlayingChange(null);
			});
		}
	};

	const seek = (e: React.MouseEvent<HTMLDivElement>) => {
		const audio = audioRef.current;
		if (!audio || !duration) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const ratio = Math.max(
			0,
			Math.min(1, (e.clientX - rect.left) / rect.width),
		);
		audio.currentTime = ratio * duration;
	};

	const primaryType = r.types[0] ? capitalizeType(r.types[0]) : 'Recording';

	return (
		<div className='border-b border-border px-3 py-2.5 last:border-b-0'>
			<div className='flex items-center gap-1.5 text-sm'>
				<span className='font-medium text-text'>{primaryType}</span>
				<span className='text-text-dim'>·</span>
				<span className='truncate text-text-dim'>
					{r.recordist || 'Unknown'}
				</span>
			</div>

			<div className='mt-0.5 text-xs text-text-dim'>
				{r.country && <span>{r.country}</span>}
				{r.date && <span>· {r.date}</span>}
			</div>

			<div className='mt-1.5 flex items-center gap-2'>
				<button
					type='button'
					onClick={toggle}
					aria-label={isPlaying ? 'Pause' : 'Play'}
					className='flex shrink-0 items-center justify-center rounded-full bg-primary p-1.5 text-on-primary transition-transform hover:scale-105 active:scale-95'
				>
					{isPlaying ?
						<Pause size={14} />
					:	<Play size={14} className='ml-0.5' />}
				</button>

				<div
					className='relative flex h-4 flex-1 cursor-pointer items-center'
					onClick={seek}
				>
					<div className='h-1.5 w-full overflow-hidden rounded-full bg-border/10'>
						<div
							className='h-full rounded-full bg-blue-500 transition-all'
							style={{ width: `${progress}%` }}
						/>
					</div>
					{(isPlaying || progress > 0) && (
						<div
							className='absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-md'
							style={{ left: `calc(${progress}% - 6px)` }}
						/>
					)}
				</div>

				<span className='shrink-0 text-[0.6rem] tabular-nums text-text-dim'>
					{formatDuration(currentTime)}/{formatDuration(duration)}
				</span>
			</div>

			<audio
				ref={audioRef}
				src={r.audioUrl}
				preload='none'
				className='hidden'
				onPlay={() => setIsPlaying(true)}
				onPause={() => setIsPlaying(false)}
				onEnded={() => {
					setIsPlaying(false);
					setCurrentTime(0);
					if (onPlayNext) onPlayNext();
					else onPlayingChange(null);
				}}
				onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
				onLoadedMetadata={(e) => {
					const d = e.currentTarget.duration;
					if (isFinite(d) && d > 0) setDuration(d);
				}}
			>
				Your browser does not support audio.
			</audio>
		</div>
	);
}