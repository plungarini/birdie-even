import { getTextWidth } from '@evenrealities/pretext';

const SPACE_WIDTH = getTextWidth(' ') || 5;
const WRAP_SAFETY_PX = 4;

function spacesForPx(targetPx: number): string {
  if (targetPx <= 0) return '';
  const count = Math.floor(targetPx / SPACE_WIDTH);
  return count > 0 ? ' '.repeat(count) : '';
}

export function alignRow(left: string, right: string, innerWidthPx: number): string {
  const available = innerWidthPx - WRAP_SAFETY_PX - getTextWidth(left) - getTextWidth(right);
  if (available <= 0) return `${left} ${right}`;
  return `${left}${spacesForPx(available)}${right}`;
}

export function centerLine(text: string, innerWidthPx: number): string {
  const leftPx = Math.max(0, (innerWidthPx - WRAP_SAFETY_PX - getTextWidth(text)) / 2);
  return `${spacesForPx(leftPx)}${text}`;
}
