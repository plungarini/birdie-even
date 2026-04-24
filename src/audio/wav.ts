// Pure TypeScript WAV builder. No dependencies.
// Produces a valid RIFF/WAVE file from raw PCM bytes (s16le, any rate/channels).

export function buildWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bitDepth: number,
): Blob {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcm.byteLength;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);

  const enc = new TextEncoder();
  const write4 = (offset: number, s: string) => enc.encode(s).forEach((b, i) => v.setUint8(offset + i, b));

  write4(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  write4(8, 'WAVE');
  write4(12, 'fmt ');
  v.setUint32(16, 16, true);        // PCM chunk size
  v.setUint16(20, 1, true);         // audioFormat = PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  write4(36, 'data');
  v.setUint32(40, dataSize, true);

  return new Blob([header, pcm], { type: 'audio/wav' });
}
