import { IMG_H, IMG_W } from './constants';

const FETCH_TIMEOUT_MS = 8000;
const CORNER_RADIUS = 10;
const BRIGHTNESS = 0.78;
const CONTRAST = 1.32;
const GAMMA = 1.12;
const BLACK_POINT = 16;
const WHITE_POINT = 242;
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
    d[i] = g; d[i + 1] = g; d[i + 2] = g;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { console.error('[birdie] canvas.toBlob returned null'); resolve(null); return; }
      blob.arrayBuffer()
        .then((buf) => resolve(Array.from(new Uint8Array(buf))))
        .catch((err) => { console.error('[birdie] arrayBuffer failed', err); resolve(null); });
    }, 'image/png');
  });
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
  if (ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height); }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve([]); return; }
      blob.arrayBuffer().then((buf) => {
        const bytes = Array.from(new Uint8Array(buf));
        if (width === IMG_W && height === IMG_H) {
          blackImageCache = bytes;
        }
        resolve(bytes);
      }).catch(() => resolve([]));
    }, 'image/png');
  });
}
