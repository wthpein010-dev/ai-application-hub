export function getBufferedPercent(bufferedEnd, duration, ready = false) {
  if (ready) return 100;
  if (!Number.isFinite(bufferedEnd) || !Number.isFinite(duration) || bufferedEnd <= 0 || duration <= 0) {
    return 8;
  }
  return Math.min(95, Math.max(8, Math.round(bufferedEnd / duration * 100)));
}
