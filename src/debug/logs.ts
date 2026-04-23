import { useEffect, useState } from 'react';

export interface DebugLogEntry {
	level: 'log' | 'warn' | 'error';
	msg: string;
	ts: number;
	details?: unknown[];
}

type DebugLogInput =
	| DebugLogEntry
	| {
			level: DebugLogEntry['level'];
			args?: unknown[];
			msg?: string;
			details?: unknown[];
	  };

declare global {
	var __birdieDebugInstalled: boolean | undefined;
	var __debugLogs: DebugLogEntry[] | undefined;
	var __refreshDebug: (() => void) | undefined;
}

const MAX_LOGS = 250;
const LOG_PREFIX_ALLOWLIST = ['[birdie]', '[capture]', '[birdie-proxy]'];
const DUPLICATE_WINDOW_MS = 250;

function refresh() {
	globalThis.__refreshDebug?.();
}

function isSdkNoise(level: DebugLogEntry['level'], msg: string): boolean {
	return (
		level === 'log' &&
		(msg.startsWith('[EvenAppBridge]') ||
			msg.includes('EvenHub event:') ||
			msg.includes('audioPcm') ||
			msg.includes('Captured audio') ||
			msg.includes('rawEventsCleared emitted without explicit MainE') ||
			msg.includes('eventManager') ||
			msg.includes('Explicit MainEventsCleared'))
	);
}

export function shouldDisplayDebugLog(entry: Pick<DebugLogEntry, 'level' | 'msg'>): boolean {
	const { level, msg } = entry;
	if (!msg.trim()) return false;
	if (isSdkNoise(level, msg)) return false;
	if (level === 'log') {
		if (!LOG_PREFIX_ALLOWLIST.some((prefix) => msg.startsWith(prefix))) {
			return false;
		}
		return !(
			msg.startsWith('[birdie] glasses layer starting') ||
			msg.startsWith('[birdie] bridge acquired') ||
			msg.startsWith('[birdie] glasses layer ready') ||
			msg.startsWith('[capture] first audioEvent shape:') ||
			msg.startsWith('[birdie] state transition') ||
			msg.startsWith('[birdie] click event accepted') ||
			msg.startsWith('[birdie] foreground enter') ||
			msg.startsWith('[birdie] foreground exit / abnormal exit') ||
			msg.startsWith('[birdie] stale analyze result ignored') ||
			msg.startsWith('[birdie] stale analyze error ignored')
		);
	}
	return true;
}

function push(input: DebugLogInput) {
	const level = input.level;
	const derivedArgs = 'args' in input ? input.args ?? [] : [];
	const msg = input.msg ?? deriveMessage(derivedArgs);
	const details = input.details ?? deriveDetails(derivedArgs);
	if (!shouldDisplayDebugLog({ level, msg })) return;
	const ts = Date.now();
	const existingLogs = globalThis.__debugLogs ?? [];
	const previous = existingLogs.length > 0 ? existingLogs[existingLogs.length - 1] : undefined;
	if (previous && isDuplicateLog(previous, { level, msg, details, ts })) return;
	const next = [...existingLogs, { level, msg, ts, details }];
	globalThis.__debugLogs = next.slice(-MAX_LOGS).filter(shouldDisplayDebugLog);
	refresh();
}

function serializeDetails(details?: unknown[]): string {
	try {
		return JSON.stringify(details ?? []);
	} catch {
		return String(details ?? []);
	}
}

function isDuplicateLog(previous: DebugLogEntry, next: DebugLogEntry): boolean {
	return (
		next.ts - previous.ts <= DUPLICATE_WINDOW_MS &&
		previous.level === next.level &&
		previous.msg === next.msg &&
		serializeDetails(previous.details) === serializeDetails(next.details)
	);
}

function summarizeAudioPayload(detail: unknown): { msg: string; detail: unknown } | null {
	if (typeof detail === 'string' && detail.includes('audioPcm')) {
		const sampleMatch = detail.match(/"audioPcm"\s*:\s*\[(.*?)\]/s);
		const values =
			sampleMatch?.[1]
				?.split(',')
				.map((part) => part.trim())
				.filter(Boolean) ?? [];
		return {
			msg: `[EvenAppBridge] Captured audio (${values.length} samples in preview)`,
			detail: '[audioPcm payload summarized]',
		};
	}

	if (!detail || typeof detail !== 'object') return null;
	const record = detail as Record<string, unknown>;
	const candidates = [
		record['audioPcm'],
		(record['jsonData'] as Record<string, unknown> | undefined)?.['audioPcm'],
		(record['audioEvent'] as Record<string, unknown> | undefined)?.['audioPcm'],
	];
	const audio = candidates.find((value) => Array.isArray(value));
	if (!Array.isArray(audio)) return null;

	return {
		msg: `[EvenAppBridge] Captured audio (${audio.length} samples)`,
		detail: { audioPcm: `[${audio.length} samples]` },
	};
}

function normalize(detail: unknown): string {
	if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`.trim();
	if (typeof detail === 'string') return detail;
	try {
		return JSON.stringify(detail, null, 2);
	} catch {
		return String(detail);
	}
}

function joinArgs(args: unknown[]): string {
	if (args.length === 0) return '';
	const audioSummary = args.map((arg) => summarizeAudioPayload(arg)).find(Boolean);
	if (audioSummary) return audioSummary.msg;
	return args.map((arg) => normalize(arg)).join(' ');
}

function sanitizeDetails(args: unknown[]): unknown[] {
	return args.map((arg) => {
		const audioSummary = summarizeAudioPayload(arg);
		if (audioSummary) return audioSummary.detail;
		return arg;
	});
}

function deriveMessage(args: unknown[]): string {
	if (args.length === 0) return '';
	if (typeof args[0] === 'string') return args[0];
	return joinArgs(args);
}

function deriveDetails(args: unknown[]): unknown[] | undefined {
	if (args.length === 0) return undefined;
	if (typeof args[0] === 'string') {
		const msg = args[0];
		const details = sanitizeDetails(args.slice(1)).filter((detail) => normalize(detail) !== msg);
		return details.length > 0 ? details : undefined;
	}
	const msg = deriveMessage(args);
	const details = sanitizeDetails(args).filter((detail) => normalize(detail) !== msg);
	return details.length > 0 ? details : undefined;
}

function installCapture() {
	if (globalThis.__birdieDebugInstalled) return;
	globalThis.__birdieDebugInstalled = true;
	globalThis.__debugLogs = globalThis.__debugLogs ?? [];

	const original = {
		log: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	console.log = (...args: unknown[]) => {
		push({ level: 'log', args });
		original.log(...args);
	};
	console.warn = (...args: unknown[]) => {
		push({ level: 'warn', args });
		original.warn(...args);
	};
	console.error = (...args: unknown[]) => {
		push({ level: 'error', args });
		original.error(...args);
	};

	window.addEventListener(
		'error',
		(event) => {
			const target = event.target as (EventTarget & { src?: string; href?: string; tagName?: string }) | null;
			if (target && target !== window) {
				push({
					level: 'error',
					msg: 'resource load error',
					details: [{ tagName: target.tagName, src: target.src, href: target.href }],
				});
				return;
			}
			const errorEvent = event as ErrorEvent;
			push({
				level: 'error',
				msg: errorEvent.message || 'window error',
				details: [errorEvent.error ?? errorEvent.filename, { lineno: errorEvent.lineno, colno: errorEvent.colno }],
			});
		},
		true,
	);

	window.addEventListener('unhandledrejection', (event) => {
		push({ level: 'error', msg: 'unhandled rejection', details: [event.reason] });
	});

	push({ level: 'log', msg: '[birdie] debug console capture installed' });
}

installCapture();

function cloneLogs() {
	return [...(globalThis.__debugLogs ?? [])].filter(shouldDisplayDebugLog);
}

export function useDebugLogs(): DebugLogEntry[] {
	const [logs, setLogs] = useState<DebugLogEntry[]>(cloneLogs());

	useEffect(() => {
		const previous = globalThis.__refreshDebug;
		const handleRefresh = () => {
			setLogs(cloneLogs());
			previous?.();
		};
		globalThis.__refreshDebug = handleRefresh;
		return () => {
			if (globalThis.__refreshDebug === handleRefresh) {
				globalThis.__refreshDebug = previous;
			}
		};
	}, []);

	return logs;
}

export {};
