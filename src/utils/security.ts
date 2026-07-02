// SECURITY: Centralized security utility module for the BlueChip frontend.
// This module contains all pre-transaction validation, sanitization, and chain
// assertions used by the swap / pool / liquidity action modals. Keeping these
// checks in one place makes it much harder for a future developer to
// accidentally skip a validation step when adding a new MsgExecuteContract
// call, and it gives auditors a single file to review.

import type { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import type { Coin } from '@cosmjs/stargate';
import { compareMicro } from './bigintMath';

// SECURITY: The only chain this frontend is allowed to broadcast against.
// Any other chain ID reported by the wallet must block the transaction.
export const EXPECTED_CHAIN_ID = 'bluechip-3';
export const EXPECTED_BECH32_PREFIX = 'bluechip';

// SECURITY: Slippage bounds enforced on every swap/liquidity action to
// prevent sandwich attacks (too high) and guaranteed revert (too low).
export const SLIPPAGE_MIN_PCT = 0.1;   // 0.1%
export const SLIPPAGE_WARN_PCT = 5;    // warn above 5%
export const SLIPPAGE_MAX_PCT = 49;    // hard block above 49%

// SECURITY: idle session timeout for wallet auto-disconnect.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Amount validation
// ============================================================================

export interface AmountValidationResult {
    ok: boolean;
    error?: string;
    /** Micro-unit (e.g. u-denom) representation as an integer string. */
    micro?: string;
}

// SECURITY: Validates that a user-supplied token amount is:
//   - a real, finite, non-negative, non-zero number
//   - within the decimal precision of the token (never truncates silently)
//   - not exceeding the wallet's on-chain balance (when provided)
// Returns the value converted to integer micro-units for safe contract use.
export function validateTokenAmount(
    raw: string,
    decimals: number,
    maxBalanceMicro?: string,
): AmountValidationResult {
    if (raw === null || raw === undefined) {
        return { ok: false, error: 'Amount is required.' };
    }
    const trimmed = String(raw).trim();
    if (trimmed === '') {
        return { ok: false, error: 'Amount is required.' };
    }
    // SECURITY: strict numeric pattern — rejects exponents, hex, commas, whitespace, etc.
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        return { ok: false, error: 'Amount must be a positive decimal number.' };
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
        return { ok: false, error: 'Amount is not a finite number.' };
    }
    if (num <= 0) {
        return { ok: false, error: 'Amount must be greater than zero.' };
    }
    // SECURITY: reject precision overflow (e.g. 1.1234567 on a 6-decimal token)
    const dotIdx = trimmed.indexOf('.');
    const fractionLen = dotIdx === -1 ? 0 : trimmed.length - dotIdx - 1;
    if (fractionLen > decimals) {
        return {
            ok: false,
            error: `Too many decimal places. ${decimals} maximum for this token.`,
        };
    }
    // SECURITY: convert using string math to avoid floating-point drift.
    const [intPart, fracPartRaw = ''] = trimmed.split('.');
    const fracPart = (fracPartRaw + '0'.repeat(decimals)).slice(0, decimals);
    const microStr = (intPart + fracPart).replace(/^0+/, '') || '0';
    if (microStr === '0') {
        return { ok: false, error: 'Amount must be greater than zero.' };
    }
    if (maxBalanceMicro !== undefined) {
        try {
            if (compareMicro(microStr, maxBalanceMicro) > 0) {
                return {
                    ok: false,
                    error: 'Amount exceeds your wallet balance.',
                };
            }
        } catch {
            return { ok: false, error: 'Could not verify balance.' };
        }
    }
    return { ok: true, micro: microStr };
}

// ============================================================================
// Bech32 validation
// ============================================================================

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
        const b = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) {
            if ((b >> i) & 1) chk ^= GEN[i];
        }
    }
    return chk;
}

function bech32HrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
    ret.push(0);
    for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
    return ret;
}

function bech32VerifyChecksum(hrp: string, data: number[]): boolean {
    // SECURITY: accept both the original bech32 checksum constant (1) and the
    // bech32m constant (0x2bc830a3). Cosmos SDK currently uses plain bech32
    // but bech32m is included defensively for any future migration.
    const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data));
    return poly === 1 || poly === 0x2bc830a3;
}

export interface Bech32ValidationResult {
    ok: boolean;
    error?: string;
}

// SECURITY: Verifies a Cosmos bech32 address against a known prefix.
// This protects against:
//   - typos (checksum catches 1-char edits)
//   - cross-chain confusion (e.g. a juno1... address being used against bluechip-3)
//   - empty / zero / whitespace inputs
// Callers should ALWAYS use this before building a MsgExecuteContract.
export function validateBech32Address(
    address: string,
    expectedPrefix: string = EXPECTED_BECH32_PREFIX,
): Bech32ValidationResult {
    if (!address || typeof address !== 'string') {
        return { ok: false, error: 'Address is required.' };
    }
    const a = address.trim();
    if (a.length === 0) {
        return { ok: false, error: 'Address is required.' };
    }
    if (a.length < 8 || a.length > 90) {
        return { ok: false, error: 'Address length is invalid.' };
    }
    // SECURITY: bech32 is case-insensitive but cannot mix cases in one string
    if (a !== a.toLowerCase() && a !== a.toUpperCase()) {
        return { ok: false, error: 'Address has mixed case, which is invalid.' };
    }
    const lower = a.toLowerCase();
    const sep = lower.lastIndexOf('1');
    if (sep < 1 || sep + 7 > lower.length) {
        return { ok: false, error: 'Address is malformed.' };
    }
    const hrp = lower.slice(0, sep);
    if (hrp !== expectedPrefix) {
        return {
            ok: false,
            error: `Wrong chain prefix. Expected "${expectedPrefix}", got "${hrp}".`,
        };
    }
    const dataPart = lower.slice(sep + 1);
    const data: number[] = [];
    for (const ch of dataPart) {
        const idx = BECH32_CHARSET.indexOf(ch);
        if (idx === -1) {
            return { ok: false, error: 'Address contains invalid characters.' };
        }
        data.push(idx);
    }
    if (!bech32VerifyChecksum(hrp, data)) {
        return { ok: false, error: 'Address checksum is invalid.' };
    }
    return { ok: true };
}

// ============================================================================
// Slippage validation
// ============================================================================

export interface SlippageValidationResult {
    ok: boolean;
    warn?: string;
    error?: string;
    /** Canonicalized slippage as a percentage number (e.g. 0.5 for 0.5%). */
    pct?: number;
}

// SECURITY: Enforces slippage bounds [0.1%, 49%] and warns above 5%.
// Values outside these bounds signal either a guaranteed-fail transaction
// (below 0.1%) or an obviously dangerous one (above 49%) that is almost
// always the result of a misunderstanding or a sandwich-attack trap.
export function validateSlippage(rawPct: string | number): SlippageValidationResult {
    const n = typeof rawPct === 'number' ? rawPct : Number(String(rawPct).trim());
    if (!Number.isFinite(n)) {
        return { ok: false, error: 'Slippage must be a number.' };
    }
    if (n < SLIPPAGE_MIN_PCT) {
        return {
            ok: false,
            error: `Slippage below ${SLIPPAGE_MIN_PCT}% will almost always fail. Please raise it.`,
        };
    }
    if (n > SLIPPAGE_MAX_PCT) {
        return {
            ok: false,
            error: `Slippage above ${SLIPPAGE_MAX_PCT}% is not allowed. You would be exposed to catastrophic loss.`,
        };
    }
    const result: SlippageValidationResult = { ok: true, pct: n };
    if (n > SLIPPAGE_WARN_PCT) {
        result.warn = `Slippage of ${n}% is unusually high. You may lose value to MEV bots.`;
    }
    return result;
}

// ============================================================================
// Chain ID assertion
// ============================================================================

// SECURITY: Before every transaction, check that the wallet is pointed at
// bluechip-3. If the user has the wrong network selected in Keplr/Leap the
// transaction must be blocked — never silently broadcast to the wrong chain.
export async function assertWalletOnExpectedChain(
    client: SigningCosmWasmClient | null,
): Promise<{ ok: boolean; actual?: string; error?: string }> {
    if (!client) {
        return { ok: false, error: 'Wallet is not connected.' };
    }
    try {
        // SigningCosmWasmClient exposes getChainId() on its base CometClient.
        const actual = await (client as unknown as { getChainId: () => Promise<string> }).getChainId();
        if (actual !== EXPECTED_CHAIN_ID) {
            return {
                ok: false,
                actual,
                error: `Wallet is connected to "${actual}". Please switch to ${EXPECTED_CHAIN_ID} before signing.`,
            };
        }
        return { ok: true, actual };
    } catch (err) {
        return {
            ok: false,
            error: 'Could not verify chain ID: ' + (err as Error).message,
        };
    }
}

// ============================================================================
// Funds verification
// ============================================================================

// SECURITY: Compares the `funds` array the UI claims to be sending with the
// actual array passed to the signer. If they diverge (bug, mutation, race
// condition, or manipulated state) the transaction is blocked before it
// reaches the wallet. This is a belt-and-braces defense against accidentally
// forwarding more tokens than the user approved.
export function verifyFundsMatch(
    expected: readonly Coin[],
    actual: readonly Coin[],
): { ok: boolean; error?: string } {
    if (expected.length !== actual.length) {
        return { ok: false, error: 'Funds list length mismatch.' };
    }
    for (let i = 0; i < expected.length; i++) {
        const e = expected[i];
        const a = actual[i];
        if (!a || e.denom !== a.denom || e.amount !== a.amount) {
            return {
                ok: false,
                error: `Funds mismatch at index ${i}: expected ${e.amount}${e.denom}, got ${a?.amount}${a?.denom}.`,
            };
        }
    }
    return { ok: true };
}

// ============================================================================
// XSS / output sanitization
// ============================================================================

// SECURITY: Sanitizes an on-chain string (token name, pool label, tx memo)
// before rendering. React already HTML-escapes text nodes, so this function
// focuses on things React does NOT protect against:
//   - control characters that can hide phishing payloads (e.g. RTL override)
//   - zero-width characters used for homoglyph attacks
//   - abusively long strings that break layout
// The returned string is safe to drop into a React text node.
export function sanitizeOnChainString(input: unknown, maxLen: number = 128): string {
    if (input === null || input === undefined) return '';
    const s = String(input);
    // strip control chars, RTL overrides, and zero-width chars
    // eslint-disable-next-line no-control-regex
    const cleaned = s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen) + '…';
}

// ============================================================================
// Human-readable summary helpers
// ============================================================================

// SECURITY: Consistent human-readable summary string used in the final
// confirmation UI for any swap. Centralizing the wording ensures the user
// always sees the same "You are sending X / will receive Y (±Z%)" format,
// eliminating per-screen drift that could hide fee changes.
export function formatSwapSummary(args: {
    sendAmount: string;
    sendSymbol: string;
    receiveAmount: string;
    receiveSymbol: string;
    slippagePct: number;
}): string {
    const { sendAmount, sendSymbol, receiveAmount, receiveSymbol, slippagePct } = args;
    return `You are sending ${sendAmount} ${sanitizeOnChainString(sendSymbol, 16)}, you will receive approximately ${receiveAmount} ${sanitizeOnChainString(receiveSymbol, 16)} (±${slippagePct}% slippage).`;
}

export function formatLiquidityDepositSummary(args: {
    amount0: string;
    symbol0: string;
    amount1: string;
    symbol1: string;
    lpShares: string;
}): string {
    const { amount0, symbol0, amount1, symbol1, lpShares } = args;
    return `You are depositing ${amount0} ${sanitizeOnChainString(symbol0, 16)} + ${amount1} ${sanitizeOnChainString(symbol1, 16)} and will receive approximately ${lpShares} LP shares.`;
}

// ============================================================================
// Contract error humanization
// ============================================================================

// The pool emits two narrowly-scoped errors during the post-threshold MEV
// guard window that read as gibberish in the default raw-bubbled-up form:
//
//   1. `PostThresholdCooldownActive { until_block }` — every swap (and the
//      swap leg of post-threshold commits) reverts for ~2 blocks after a
//      threshold cross.
//   2. `PostThresholdSwapCapExceeded { offer, cap }` — for ~100 blocks after
//      the cooldown ends, per-tx offer size is bounded to a fraction of the
//      offer-side reserve that ramps from 0.5% up to 100%.
//
// We don't have a query for the ramp state, so the UX is: let the user
// submit, catch the error, swap the cryptic Rust-formatter output for a
// sentence that tells them what happened and what to do.
export function humanizeContractError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);

    const cooldownMatch = raw.match(/Post-threshold cooldown active:\s*trades resume at block\s+(\d+)/i);
    if (cooldownMatch) {
        const untilBlock = cooldownMatch[1];
        return `This pool just crossed its commit threshold and is in a brief no-trade cooldown. Trades resume at block ${untilBlock} — try again in a few seconds.`;
    }

    const capMatch = raw.match(/Post-threshold swap cap exceeded:\s*offer\s+(\d+)\s+exceeds the allowed cap\s+(\d+)/i);
    if (capMatch) {
        const offer = capMatch[1];
        const cap = capMatch[2];
        return `This pool just crossed its commit threshold and is in a 100-block trade-size ramp. Your trade (${offer}) is larger than the current per-tx cap (${cap}). Reduce the trade size or wait a few blocks for the cap to widen.`;
    }

    return raw;
}

// ============================================================================
// Key material sanity check
// ============================================================================

// SECURITY: Runtime assertion that no code path accidentally persists private
// keys or mnemonics in browser storage. Called from WalletContext on every
// connect / disconnect to catch regressions. This is NOT a security boundary
// on its own — it is a tripwire to fail loud if future code breaks the rule.
export function assertNoSecretsInStorage(): void {
    if (typeof window === 'undefined') return;
    const SENSITIVE_KEYS = /mnemonic|privateKey|private_key|priv_key|seed|signature/i;
    try {
        for (const storage of [window.localStorage, window.sessionStorage]) {
            if (!storage) continue;
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i);
                if (k && SENSITIVE_KEYS.test(k)) {
                    // eslint-disable-next-line no-console
                    console.error(`[SECURITY] Sensitive key "${k}" found in browser storage. Clearing.`);
                    storage.removeItem(k);
                }
            }
        }
    } catch {
        // Storage can throw in private-mode Safari; ignore.
    }
}
