import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

let bridge: EvenAppBridge | null = null;

export function setJournalBridge(next: EvenAppBridge): void {
	bridge = next;
}

export function getJournalBridge(): EvenAppBridge | null {
	return bridge;
}

export async function readJSON<T>(key: string): Promise<T | null> {
	if (!bridge) return null;
	try {
		const raw = await bridge.getLocalStorage(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch (err) {
		console.warn('[birdie] journal read failed', { key, err });
		return null;
	}
}

// Write with one retry on `setLocalStorage` returning false (mirrors preferences.ts retry).
export async function writeJSON(key: string, value: unknown): Promise<boolean> {
	if (!bridge) return false;
	const serialized = JSON.stringify(value);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const ok = await bridge.setLocalStorage(key, serialized);
			if (ok) return true;
			console.warn('[birdie] journal persist returned false', { key, attempt });
		} catch (err) {
			console.warn('[birdie] journal persist threw', { key, attempt, err });
		}
	}
	return false;
}

export async function removeKey(key: string): Promise<void> {
	if (!bridge) return;
	try {
		await bridge.setLocalStorage(key, '');
	} catch (err) {
		console.warn('[birdie] journal remove failed', { key, err });
	}
}
