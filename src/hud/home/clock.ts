// Minute-tick scheduler. Fires the callback at the next minute boundary,
// then every 60_000 ms after. The first interval is computed from the wall
// clock so ticks align with `HH:MM` flips instead of drifting by some
// arbitrary offset that depends on when the scheduler started.
export function onMinuteChange(cb: () => void): () => void {
	let intervalTimer: ReturnType<typeof setInterval> | null = null;
	let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleAlignedTick(): void {
		const now = new Date();
		const msToNextMinute =
			(60 - now.getSeconds()) * 1000 - now.getMilliseconds();
		timeoutTimer = setTimeout(() => {
			timeoutTimer = null;
			cb();
			intervalTimer = setInterval(cb, 60_000);
		}, Math.max(0, msToNextMinute));
	}

	scheduleAlignedTick();

	return () => {
		if (timeoutTimer) clearTimeout(timeoutTimer);
		if (intervalTimer) clearInterval(intervalTimer);
		timeoutTimer = null;
		intervalTimer = null;
	};
}
