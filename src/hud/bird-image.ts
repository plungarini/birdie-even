import { IMG_H, IMG_W } from './constants';

const FETCH_TIMEOUT_MS = 8000;
// Rounded-corner mask applied on our canvas before PNG encoding.
// Raise this for softer/more pronounced corners; lower it to keep more of the
// image square. Use small integer-like changes (about 1-2 px at a time),
// because the HUD image is only 128x128 and large jumps cut away visible area fast.
const CORNER_RADIUS = 14;
// Global brightness multiplier before remapping/quantization.
// Lower values darken the whole image and preserve highlight detail on the
// bright green HUD; higher values make the image pop more but can wash out
// feathers/edges after the host converts everything to 4-bit greyscale.
// Tune gently in ~0.03-0.08 steps.
const BRIGHTNESS = 0.65;
// Contrast stretch around mid-grey.
// Higher values make edges and silhouettes punchier, but too much creates harsh
// posterization once the host downsamples to 16 green levels. Lower values feel
// flatter and softer. Tune in small ~0.05-0.12 steps.
const CONTRAST = 1.4;
// Midtone curve after brightness + black/white point remap.
// Values above 1 darken midtones and help avoid a washed-out HUD image; values
// below 1 brighten mids. This is usually the most sensitive control, so prefer
// tiny ~0.03-0.08 adjustments.
const GAMMA = 1.2;
// Input luminance that should map to full black before quantization.
// Raising this clips more shadow detail and increases perceived contrast;
// lowering it preserves darker detail but can make the image look hazy because
// black pixels are the only fully "off" pixels on the micro-LED display.
// Adjust in small integer steps (about 4-8).
const BLACK_POINT = 16;
// Input luminance that should map to full white before quantization.
// Lowering this makes highlights hit maximum brightness sooner; raising it
// preserves bright detail but can make the whole image feel dimmer. Keep it
// above BLACK_POINT and tune in small integer steps (about 4-8).
const WHITE_POINT = 242;
// Final number of luminance buckets before we encode PNG bytes.
// The host app ultimately converts image containers to 4-bit greyscale (16
// levels), so 16 is the natural match. Lower values create chunkier banding;
// higher values do not buy much because the host will quantize again anyway.
const QUANTIZATION_LEVELS = 16;

// Per-session cache: url → PNG number[] bytes
const cache = new Map<string, number[]>();
let blackImageCache: number[] | null = null;

// Fetch a bird image URL, decode, resize to IMG_W×IMG_H, apply BT.601
// greyscale + brightness/contrast, and return as PNG bytes in number[].
// PNG bytes are required — raw pixel format is not reliably decoded by the
// SDK host on all firmware versions.
export async function loadBirdImageData(url: string): Promise<number[] | null> {
	if (!url) return null;
	const cached = cache.get(url);
	if (cached !== undefined) return cached;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	let blob: Blob;
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) {
			console.error('[birdie] image fetch non-ok', { url, status: res.status });
			return null;
		}
		blob = await res.blob();
	} catch (err) {
		console.error('[birdie] image fetch failed', { url, err: err instanceof Error ? err.message : err });
		return null;
	} finally {
		clearTimeout(timer);
	}

	const data = await decodeAndProcess(blob);
	if (data !== null) cache.set(url, data);
	return data;
}

function decodeAndProcess(blob: Blob): Promise<number[] | null> {
	return new Promise((resolve) => {
		const objectUrl = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(objectUrl);
			renderToPngBytes(img)
				.then(resolve)
				.catch((err) => {
					console.error('[birdie] image canvas processing failed', err);
					resolve(null);
				});
		};
		img.onerror = (err) => {
			URL.revokeObjectURL(objectUrl);
			console.error('[birdie] image decode failed', err);
			resolve(null);
		};
		img.src = objectUrl;
	});
}

function renderToPngBytes(img: HTMLImageElement): Promise<number[] | null> {
	const canvas = document.createElement('canvas');
	canvas.width = IMG_W;
	canvas.height = IMG_H;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		console.error('[birdie] canvas 2d context unavailable');
		return Promise.resolve(null);
	}

	// Black background (= off on micro-LED).
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, IMG_W, IMG_H);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';

	// Rounded-corner clip.
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(0, 0, IMG_W, IMG_H, CORNER_RADIUS);
	ctx.clip();

	// Scale to fit preserving aspect ratio, centred.
	const scale = Math.min(IMG_W / img.naturalWidth, IMG_H / img.naturalHeight);
	const dw = Math.round(img.naturalWidth * scale);
	const dh = Math.round(img.naturalHeight * scale);
	const dx = Math.round((IMG_W - dw) / 2);
	const dy = Math.round((IMG_H - dh) / 2);
	ctx.drawImage(img, dx, dy, dw, dh);
	ctx.restore();

	// BT.601 greyscale + brightness + contrast in-place.
	const imageData = ctx.getImageData(0, 0, IMG_W, IMG_H);
	const d = imageData.data;
	const quantizationStep = 255 / Math.max(1, QUANTIZATION_LEVELS - 1);
	for (let i = 0; i < d.length; i += 4) {
		let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
		g = g * BRIGHTNESS;
		g = ((g - BLACK_POINT) / Math.max(1, WHITE_POINT - BLACK_POINT)) * 255;
		g = Math.max(0, Math.min(255, g));
		g = 255 * Math.pow(g / 255, GAMMA);
		g = (g - 128) * CONTRAST + 128;
		g = Math.round(g / quantizationStep) * quantizationStep;
		g = Math.max(0, Math.min(255, Math.round(g)));
		d[i] = g;
		d[i + 1] = g;
		d[i + 2] = g;
	}

	applyRoundedMask(d, IMG_W, IMG_H, CORNER_RADIUS);
	ctx.putImageData(imageData, 0, 0);

	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				console.error('[birdie] canvas.toBlob returned null');
				resolve(null);
				return;
			}
			blob
				.arrayBuffer()
				.then((buf) => resolve(Array.from(new Uint8Array(buf))))
				.catch((err) => {
					console.error('[birdie] arrayBuffer failed', err);
					resolve(null);
				});
		}, 'image/png');
	});
}

function applyRoundedMask(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixelIndex = (y * width + x) * 4;
			const outsideOuter = !isInsideRoundedRect(x + 0.5, y + 0.5, 0, 0, width, height, radius);

			if (outsideOuter) {
				data[pixelIndex] = 0;
				data[pixelIndex + 1] = 0;
				data[pixelIndex + 2] = 0;
			}
		}
	}
}

function isInsideRoundedRect(
	x: number,
	y: number,
	left: number,
	top: number,
	right: number,
	bottom: number,
	radius: number,
): boolean {
	if (x < left || x >= right || y < top || y >= bottom) {
		return false;
	}

	const innerLeft = left + radius;
	const innerRight = right - radius;
	const innerTop = top + radius;
	const innerBottom = bottom - radius;

	if ((x >= innerLeft && x < innerRight) || (y >= innerTop && y < innerBottom)) {
		return true;
	}

	const cx = x < innerLeft ? innerLeft : innerRight;
	const cy = y < innerTop ? innerTop : innerBottom;
	const dx = x - cx;
	const dy = y - cy;
	return dx * dx + dy * dy <= radius * radius;
}

// Solid black PNG bytes for clearing the image container.
export function generateBlackImageData(width: number, height: number): Promise<number[]> {
	if (width === IMG_W && height === IMG_H && blackImageCache) {
		return Promise.resolve(blackImageCache);
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, width, height);
	}
	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				resolve([]);
				return;
			}
			blob
				.arrayBuffer()
				.then((buf) => {
					const bytes = Array.from(new Uint8Array(buf));
					if (width === IMG_W && height === IMG_H) {
						blackImageCache = bytes;
					}
					resolve(bytes);
				})
				.catch(() => resolve([]));
		}, 'image/png');
	});
}
