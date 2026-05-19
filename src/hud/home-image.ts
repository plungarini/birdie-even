// Pre-renders the home/IDLE TL mark: just the bird icon (no wordmark).
//
// The wire bottleneck is the phone→glasses BLE leg, which streams 4-bit
// greyscale at width×height/2 bytes regardless of how compactly we encode
// the PNG. The icon-only mark fits in a 28×28 canvas (≈ 392 bytes on the
// wire) so first paint is effectively instant.

// Canvas dimensions. The icon bbox is 23×24 — we pad to 28×28 so the
// rendered icon roughly matches the HUD text line height (~27 px) and has
// a sliver of horizontal breathing room on the right.
export const HOME_IMG_W = 28;
export const HOME_IMG_H = 28;

const ICON_PATH =
	'M12 0h6v2h-6ZM10 2h2v2h-2ZM18 2h2v2h-2ZM9 4h2v4h-2ZM15 4h2v2h-2ZM19 4h2v2h-2ZM20 6h3v2h-3ZM8 8h2v2h-2ZM19 8h3v1h-3ZM19 9h2v2h-2ZM6 10h2v2h-2ZM17 10h4v1h-4ZM11 11h2v3h-2ZM17 11h3v1h-3ZM5 12h2v2h-2ZM18 12h2v4h-2ZM10 13h3v1h-3ZM4 14h2v3h-2ZM9 14h3v1h-3ZM6 15h5v1h-5ZM17 15h3v1h-3ZM3 16h6v1h-6ZM16 16h3v1h-3ZM3 17h2v1h-2ZM15 17h3v1h-3ZM2 18h2v2h-2ZM15 18h2v1h-2ZM8 19h8v2h-8ZM1 20h2v4h-2ZM6 20h10v1h-10ZM5 21h3v1h-3ZM10 21h2v3h-2ZM14 21h2v3h-2ZM0 22h7v1h-7ZM9 22h3v2h-3ZM16 22h1v2h-1ZM0 23h6v1h-6Z';

// Painted bounding box of the icon path. The bird pixels span 23 columns
// × 24 rows; cropping to this bbox means ICON_SIZE = actual painted
// height on canvas (no phantom right padding from the SVG).
const ICON_BBOX = { xMin: 0, yMin: 0, xMax: 23, yMax: 24 } as const;
const ICON_BBOX_H = ICON_BBOX.yMax - ICON_BBOX.yMin;

// Rendered painted height of the icon, in canvas px. The width is derived
// from the bbox aspect ratio so the icon fills the canvas vertically with
// a 1-px sliver on the right.
const ICON_SIZE = HOME_IMG_H;

let cachedBytes: number[] | null = null;
let cachedRenderPromise: Promise<number[] | null> | null = null;

export function generateHomeImageData(): Promise<number[] | null> {
	if (cachedBytes) return Promise.resolve(cachedBytes);
	if (cachedRenderPromise) return cachedRenderPromise;
	cachedRenderPromise = renderHomeImage().then((bytes) => {
		if (bytes) cachedBytes = bytes;
		cachedRenderPromise = null;
		return bytes;
	});
	return cachedRenderPromise;
}

async function renderHomeImage(): Promise<number[] | null> {
	const canvas = document.createElement('canvas');
	canvas.width = HOME_IMG_W;
	canvas.height = HOME_IMG_H;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		console.error('[birdie] home canvas 2d context unavailable');
		return null;
	}

	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, HOME_IMG_W, HOME_IMG_H);

	const iconScale = ICON_SIZE / ICON_BBOX_H;
	const iconRenderH = ICON_SIZE;
	const iconTop = Math.round((HOME_IMG_H - iconRenderH) / 2);

	ctx.fillStyle = '#ffffff';
	ctx.save();
	ctx.translate(0, iconTop);
	ctx.scale(iconScale, iconScale);
	// Compensate for any non-zero bbox origin — keeps this robust if the
	// icon path is ever swapped for one whose painted bounds don't start
	// at (0,0).
	ctx.translate(-ICON_BBOX.xMin, -ICON_BBOX.yMin);
	ctx.fill(new Path2D(ICON_PATH));
	ctx.restore();

	const grey = canvasToGrey8Bytes(ctx, HOME_IMG_W, HOME_IMG_H);
	try {
		const png = await encodeGrey8Png(HOME_IMG_W, HOME_IMG_H, grey);
		return Array.from(png);
	} catch (err) {
		console.error('[birdie] grayscale PNG encode failed', err);
		return null;
	}
}

// Reduce the RGBA buffer to a single luminance byte per pixel. We keep the
// 8-bit grey ramp so the host's imageToGray4 quantizer chooses cleanly
// anti-aliased edges instead of jaggy 1-bit ones.
function canvasToGrey8Bytes(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
): Uint8Array {
	const data = ctx.getImageData(0, 0, width, height).data;
	const out = new Uint8Array(width * height);
	for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
		out[j] = Math.round(
			0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
		);
	}
	return out;
}

// --- minimal 8-bit grayscale PNG encoder ---------------------------------
//
// Browsers always emit 32-bpp RGBA PNGs from `canvas.toBlob('image/png')`.
// Writing the chunks ourselves lets us emit colour-type 0 (grayscale) at
// 8 bpp — 4× smaller pre-deflate input than RGBA, which the host then
// decodes and forwards to its quantizer.

const PNG_SIGNATURE = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC32_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i += 1)
		c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
	const buf = new Uint8Array(12 + data.length);
	const view = new DataView(buf.buffer);
	view.setUint32(0, data.length);
	buf[4] = type.charCodeAt(0);
	buf[5] = type.charCodeAt(1);
	buf[6] = type.charCodeAt(2);
	buf[7] = type.charCodeAt(3);
	buf.set(data, 8);
	view.setUint32(8 + data.length, crc32(buf.subarray(4, 8 + data.length)));
	return buf;
}

async function deflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as unknown as BlobPart])
		.stream()
		.pipeThrough(new CompressionStream('deflate'));
	const blob = await new Response(stream).blob();
	return new Uint8Array(await blob.arrayBuffer());
}

async function encodeGrey8Png(
	width: number,
	height: number,
	grey: Uint8Array,
): Promise<Uint8Array> {
	// Filter byte 0 (None) prepended to each scanline. Slight savings would be
	// possible by trying Sub/Up/Avg/Paeth and picking the best, but the image
	// is small enough that the deflate cost dominates already.
	const filtered = new Uint8Array((width + 1) * height);
	for (let y = 0; y < height; y += 1) {
		filtered[y * (width + 1)] = 0;
		filtered.set(
			grey.subarray(y * width, (y + 1) * width),
			y * (width + 1) + 1,
		);
	}
	const compressed = await deflateZlib(filtered);

	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, width);
	ihdrView.setUint32(4, height);
	ihdr[8] = 8; // bit depth = 8
	ihdr[9] = 0; // colour type = 0 (grayscale)
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace = none

	const ihdrChunk = makeChunk('IHDR', ihdr);
	const idatChunk = makeChunk('IDAT', compressed);
	const iendChunk = makeChunk('IEND', new Uint8Array(0));

	const out = new Uint8Array(
		PNG_SIGNATURE.length +
			ihdrChunk.length +
			idatChunk.length +
			iendChunk.length,
	);
	let offset = 0;
	out.set(PNG_SIGNATURE, offset);
	offset += PNG_SIGNATURE.length;
	out.set(ihdrChunk, offset);
	offset += ihdrChunk.length;
	out.set(idatChunk, offset);
	offset += idatChunk.length;
	out.set(iendChunk, offset);
	return out;
}
