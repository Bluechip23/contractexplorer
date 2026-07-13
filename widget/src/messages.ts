// Pure helpers: wire messages and unit conversions. Everything here
// mirrors the contract API in bluechip-osmosis-contract (creator-pool
// commit, committing_info / is_fully_commited queries) and is covered by
// unit tests — keep this file free of DOM, wallet, and network access.

/** Convert a user-entered decimal amount to micro-units via string math
 * (no float drift). Throws on malformed or non-positive input. */
export function toMicro(amount: string | number, decimals = 6): string {
    const s = String(amount).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) {
        throw new Error(`Invalid amount: "${s}"`);
    }
    const [whole, frac = ''] = s.split('.');
    if (frac.length > decimals) {
        throw new Error(`Too many decimal places (max ${decimals}): "${s}"`);
    }
    const micro = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
    if (micro <= 0n) throw new Error('Amount must be greater than zero');
    return micro.toString();
}

/** Micro-unit string -> display number (6 decimals unless told otherwise). */
export function fromMicro(micro: string | null | undefined, decimals = 6): number {
    if (!micro || !/^\d+$/.test(micro)) return 0;
    const n = BigInt(micro);
    const base = 10n ** BigInt(decimals);
    return Number(n / base) + Number(n % base) / Number(base);
}

/** Transaction deadline in nanoseconds-since-epoch, as the contracts
 * expect (cosmwasm Timestamp). */
export function deadlineNs(minutesFromNow = 20, nowMs = Date.now()): string {
    return ((nowMs + minutesFromNow * 60_000) * 1_000_000).toString();
}

/** The creator-pool `commit` execute message. Pre-threshold commits are
 * ledger entries (no AMM leg) so max_spread must be null; post-threshold
 * commits route through the AMM and take a spread guard.
 *
 * NOTE: the native side of the pair is wire-tagged `bluechip` — a legacy
 * serde rename kept by the contracts (`TokenType::Native` renamed to
 * "bluechip") — even though the denom inside it is `uosmo` on Osmosis. */
export function buildCommitMsg(opts: {
    denom: string;
    amountMicro: string;
    thresholdHit: boolean;
    maxSpread?: string;
    nowMs?: number;
}) {
    return {
        commit: {
            asset: {
                info: { bluechip: { denom: opts.denom } },
                amount: opts.amountMicro,
            },
            transaction_deadline: deadlineNs(20, opts.nowMs),
            belief_price: null,
            max_spread: opts.thresholdHit ? (opts.maxSpread ?? '0.05') : null,
        },
    };
}

/** Funds attached to the commit: exactly one coin of the chain's native
 * denom (`uosmo` on Osmosis; the contract validates with must_pay). */
export function commitFunds(denom: string, amountMicro: string) {
    return [{ denom, amount: amountMicro }];
}

export const COMMIT_GAS = '600000';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const IS_FULLY_COMMITED_QUERY = { is_fully_commited: {} } as const; // [sic] contract spelling

export function committingInfoQuery(wallet: string) {
    return { committing_info: { wallet } };
}

/** LCD smart-query URL: the query JSON is base64-encoded into the path. */
export function smartQueryUrl(rest: string, contract: string, query: unknown): string {
    const json = JSON.stringify(query);
    // btoa in browsers, Buffer under Node (tests).
    const b64 = typeof btoa === 'function'
        ? btoa(json)
        : Buffer.from(json, 'utf8').toString('base64');
    return `${rest.replace(/\/$/, '')}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(b64)}`;
}

/** On-chain per-wallet commit record (creator-pool `committing_info`).
 * The query returns null for wallets that never committed. */
export interface CommitRecord {
    committer: string;
    total_paid_usd: string;       // micro-USD
    total_paid_bluechip: string;  // native micro-units (uosmo) — legacy field name
    last_committed: string;       // nanoseconds
    last_payment_usd: string;
    last_payment_bluechip: string;
}

export interface GateResult {
    subscribed: boolean;
    /** Total lifetime USD committed (whole dollars). */
    totalUsd: number;
    /** Raw on-chain record, null if the wallet never committed. */
    record: CommitRecord | null;
}

export function evaluateGate(record: CommitRecord | null, minUsd = 0): GateResult {
    const totalUsd = fromMicro(record?.total_paid_usd);
    return {
        subscribed: record !== null && totalUsd >= minUsd,
        totalUsd,
        record,
    };
}
