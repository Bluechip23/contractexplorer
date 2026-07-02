// Shared timestamp helpers. The chain uses two different clock encodings:
// commit `last_committed` is a Timestamp serialized as NANOSECONDS, while
// position `created_at` / `last_fee_collection` are block-time SECONDS
// (`env.block.time.seconds()`). Convert each with the right unit.

import { safeBigInt } from './bigintMath';

/** Nanosecond timestamp → Date, or null for zero/malformed input. */
export function nsToDate(ns: string | number | null | undefined): Date | null {
    const n = safeBigInt(ns);
    if (n === 0n) return null;
    const d = new Date(Number(n / 1_000_000n));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Nanosecond timestamp → locale date-time string, or '-'. */
export function formatNsTimestamp(ns: string | number | null | undefined): string {
    return nsToDate(ns)?.toLocaleString() ?? '-';
}

/** Block-time seconds → locale date-time string, or '-'. */
export function formatSecondsTimestamp(secs: string | number | null | undefined): string {
    const n = safeBigInt(secs);
    if (n === 0n) return '-';
    const d = new Date(Number(n) * 1000);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

/** Block-time seconds → locale date string (no time component), or '-'. */
export function formatSecondsDate(secs: string | number | null | undefined): string {
    const n = safeBigInt(secs);
    if (n === 0n) return '-';
    const d = new Date(Number(n) * 1000);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

/** Unix-seconds timestamp → compact relative string ("42s ago", "3h ago"). */
export function timeAgo(unixSeconds: number): string {
    const secondsAgo = Math.floor(Date.now() / 1000) - unixSeconds;
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    return `${Math.floor(secondsAgo / 86400)}d ago`;
}

/**
 * Transaction deadline `minutes` from now, as the nanosecond string the
 * pool contracts expect. Returns null for empty/non-positive input so it
 * can be passed straight into `transaction_deadline`.
 */
export function deadlineNs(minutes: string | number | null | undefined): string | null {
    const m = typeof minutes === 'number' ? minutes : parseFloat(minutes ?? '');
    if (!Number.isFinite(m) || m <= 0) return null;
    return ((Date.now() + m * 60000) * 1_000_000).toString();
}
