import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { imgErrorHide } from './shared';

interface Photo {
	url: string;
	largeUrl?: string;
	attribution?: string;
}

interface LightboxViewerProps {
	photos: Photo[];
	initialIndex: number;
	onClose: () => void;
}

const ANIM_MS = 300;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function LightboxViewer({
	photos,
	initialIndex,
	onClose,
}: LightboxViewerProps) {
	const [index, setIndex] = useState(initialIndex);
	const [visible, setVisible] = useState(false);
	const [closing, setClosing] = useState(false);
	const [loaded, setLoaded] = useState(false);

	// pan + zoom state
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });

	// gesture refs (not state — no re-render needed mid-gesture)
	const lastPinchDist = useRef<number | null>(null);
	const lastPanPos = useRef<{ x: number; y: number } | null>(null);
	const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
	const imgRef = useRef<HTMLImageElement>(null);

	useEffect(() => {
		const raf = requestAnimationFrame(() => setVisible(true));
		return () => cancelAnimationFrame(raf);
	}, []);

	const handleClose = () => {
		setClosing(true);
		setTimeout(onClose, ANIM_MS + 20);
	};

	// Reset zoom/pan when changing photo
	const navigate = (delta: number) => {
		setIndex((i) => (i + delta + photos.length) % photos.length);
		setScale(1);
		setOffset({ x: 0, y: 0 });
		setLoaded(false);
	};

	// Keyboard nav
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose();
			if (e.key === 'ArrowRight') navigate(1);
			if (e.key === 'ArrowLeft') navigate(-1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// --- Touch gestures (pinch + pan) ---
	const clampOffset = (ox: number, oy: number, s: number) => {
		const img = imgRef.current;
		if (!img) return { x: ox, y: oy };
		const maxX = Math.max(0, (img.clientWidth * (s - 1)) / 2);
		const maxY = Math.max(0, (img.clientHeight * (s - 1)) / 2);
		return {
			x: Math.max(-maxX, Math.min(maxX, ox)),
			y: Math.max(-maxY, Math.min(maxY, oy)),
		};
	};

	const onTouchStart = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			lastPinchDist.current = Math.hypot(dx, dy);
			lastPanPos.current = null;
		} else if (e.touches.length === 1) {
			lastPanPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			lastPinchDist.current = null;
		}
	};

	const onTouchMove = (e: React.TouchEvent) => {
		e.preventDefault();
		if (e.touches.length === 2 && lastPinchDist.current !== null) {
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			const dist = Math.hypot(dx, dy);
			const ratio = dist / lastPinchDist.current;
			lastPinchDist.current = dist;
			setScale((s) => {
				const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * ratio));
				setOffset((o) => clampOffset(o.x, o.y, next));
				return next;
			});
		} else if (e.touches.length === 1 && lastPanPos.current !== null) {
			const dx = e.touches[0].clientX - lastPanPos.current.x;
			const dy = e.touches[0].clientY - lastPanPos.current.y;
			lastPanPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			if (scale <= 1) return;
			setOffset((o) => clampOffset(o.x + dx, o.y + dy, scale));
		}
	};

	const onTouchEnd = () => {
		lastPinchDist.current = null;
		lastPanPos.current = null;
		if (scale < 1.05) {
			setScale(1);
			setOffset({ x: 0, y: 0 });
		}
	};

	// --- Mouse drag (for desktop) ---
	const onMouseDown = (e: React.MouseEvent) => {
		if (scale <= 1) return;
		dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
	};
	const onMouseMove = (e: React.MouseEvent) => {
		if (!dragStart.current) return;
		const dx = e.clientX - dragStart.current.x;
		const dy = e.clientY - dragStart.current.y;
		setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale));
	};
	const onMouseUp = () => { dragStart.current = null; };

	// Double-tap to reset zoom
	const lastTap = useRef(0);
	const onImgClick = () => {
		const now = Date.now();
		if (now - lastTap.current < 300) {
			setScale(1);
			setOffset({ x: 0, y: 0 });
		}
		lastTap.current = now;
	};

	const isOpen = visible && !closing;
	const photo = photos[index];

	return createPortal(
		<div className='fixed inset-0 z-[9999] flex flex-col'>
			{/* Backdrop */}
			<div
				className={`absolute inset-0 bg-black transition-opacity duration-[300ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
				onClick={handleClose}
			/>

			{/* Top bar */}
			<div
				className={`relative z-10 flex items-center justify-between px-4 py-3 transition-opacity duration-[300ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
			>
				<span className='text-sm text-white/60'>
					{index + 1} / {photos.length}
				</span>
				<button
					type='button'
					onClick={handleClose}
					className='flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm'
					aria-label='Close'
				>
					✕
				</button>
			</div>

			{/* Image area */}
			<div
				className={`relative z-10 flex flex-1 items-center justify-center overflow-hidden transition-opacity duration-[300ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
				onTouchStart={onTouchStart}
				onTouchMove={onTouchMove}
				onTouchEnd={onTouchEnd}
				onMouseDown={onMouseDown}
				onMouseMove={onMouseMove}
				onMouseUp={onMouseUp}
				onMouseLeave={onMouseUp}
			>
				{/* Low-res placeholder shown blurred while large loads */}
				{!loaded && (
					<img
						key={`${photo.url}-thumb`}
						src={photo.url}
						alt=''
						aria-hidden
						className='absolute max-h-full max-w-full select-none object-contain blur-md'
						draggable={false}
					/>
				)}

				<img
					ref={imgRef}
					key={photo.url}
					src={photo.largeUrl ?? photo.url}
					alt=''
					onError={imgErrorHide}
					onLoad={() => setLoaded(true)}
					onClick={onImgClick}
					className={`relative max-h-full max-w-full select-none object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
					style={{
						transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
						transition: scale === 1 ? 'transform 0.25s ease-in-out, opacity 0.2s' : 'none',
						cursor: scale > 1 ? 'grab' : 'default',
						userSelect: 'none',
					}}
					draggable={false}
				/>

				{/* Spinner while loading */}
				{!loaded && (
					<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
						<div className='size-10 animate-spin rounded-full border-2 border-white/20 border-t-white' />
					</div>
				)}

				{/* Prev / Next arrows */}
				{photos.length > 1 && (
					<>
						<button
							type='button'
							onClick={() => navigate(-1)}
							className='absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-opacity hover:bg-black/60'
							aria-label='Previous'
						>
							‹
						</button>
						<button
							type='button'
							onClick={() => navigate(1)}
							className='absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-opacity hover:bg-black/60'
							aria-label='Next'
						>
							›
						</button>
					</>
				)}
			</div>

			{/* Attribution */}
			{photo.attribution && (
				<div
					className={`relative z-10 px-4 py-2 text-center text-xs text-white/40 transition-opacity duration-[300ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
				>
					{photo.attribution}
				</div>
			)}

			{/* Dot indicators */}
			{photos.length > 1 && (
				<div
					className={`relative z-10 flex justify-center gap-1.5 pb-4 transition-opacity duration-[300ms] ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
				>
					{photos.map((_, i) => (
						<button
							key={i}
							type='button'
							onClick={() => navigate(i - index)}
							className={`h-1.5 rounded-full transition-all duration-200 ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`}
							aria-label={`Go to photo ${i + 1}`}
						/>
					))}
				</div>
			)}
		</div>,
		document.body,
	);
}
