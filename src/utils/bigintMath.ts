// BigInt-based helpers for parsing and displaying on-chain integer amounts.
// Token amounts on Cosmos SDK are 256-bit integer strings; using JS `Number`
// or `parseInt` loses precision above 2^53 and can misparse strings with
// leading zeros (octal) or unexpected prefixes.

export function safeBigInt(value: string | number | bigint | null | undefined): bigint {
    if (value === null || value === undefined) return 0n;
    if (typeof value === 'bigint') return value;
    const s = typeof value === 'number' ? String(value) : value;
    if (!s) return 0n;
    // Strip a leading + and disallow anything that isn't a base-10 integer.
    const trimmed = s.trim();
    const negative = trimmed.startsWith('-');
    const digits = (negative || trimmed.startsWith('+')) ? trimmed.slice(1) : trimmed;
    if (!/^\d+$/.test(digits)) return 0n;
    try {
        const n = BigInt(digits);
        return negative ? -n : n;
    } catch {
        return 0n;
    }
}

// Compare two integer strings. Returns -1, 0, 1.
export function compareMicro(a: string | number | bigint | null | undefined, b: string | number | bigint | null | undefined): number {
    const aa = safeBigInt(a);
    const bb = safeBigInt(b);
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
}

// Convert a micro-denominated integer string into a human-readable decimal
// string with `displayDecimals` fractional digits, preserving full precision
// for the integer portion. `decimals` is the denom's native exponent (6 for
// ubluechip / uatom, 18 for wei-like, etc.).
export function formatMicroAmount(
    amount: string | number | bigint | null | undefined,
    decimals: number = 6,
    displayDecimals: number = 2,
): string {
    const n = safeBigInt(amount);
    const negative = n < 0n;
    const abs = negative ? -n : n;
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;

    // Left-pad fractional digits so e.g. 5 micros with 6 decimals → "000005".
    const fracStr = frac.toString().padStart(decimals, '0');
    // Trim to the requested display precision.
    const shownFrac = displayDecimals > 0 ? fracStr.slice(0, displayDecimals) : '';

    // Insert thousands separators in the whole part.
    const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    const sign = negative ? '-' : '';
    if (displayDecimals === 0) return `${sign}${wholeFormatted}`;
    return `${sign}${wholeFormatted}.${shownFrac}`;
}

// Format a micro-denominated integer as a PLAIN decimal string (no thousands
// separators, trailing zeros trimmed) — suitable for writing into a numeric
// <input>. `formatMicroAmount` is for display; this is for round-tripping
// through form fields.
export function microToPlainString(
    amount: string | number | bigint | null | undefined,
    decimals: number = 6,
): string {
    const n = safeBigInt(amount);
    const negative = n < 0n;
    const s = (negative ? -n : n).toString().padStart(decimals + 1, '0');
    const int = s.slice(0, s.length - decimals);
    const frac = s.slice(s.length - decimals).replace(/0+$/, '');
    return `${negative ? '-' : ''}${frac ? `${int}.${frac}` : int}`;
}

// USD <-> native (OSMO) conversion for commit inputs, using the factory's
// live TWAP `rate_used` (micro-USD per 1.0 native token; 1_000_000 = $1.00
// per OSMO): native_micro = usd_micro * 1e6 / rate_used, and the inverse.
// Inputs/outputs are human decimal strings; returns '' when the source
// amount is not a valid positive number or the rate is unusable, so the
// paired field clears rather than showing garbage. BigInt only — no floats.
function decimalToMicro(value: string, decimals: number): bigint | null {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    const [intPart, fracRaw = ''] = trimmed.split('.');
    if (fracRaw.length > decimals) return null;
    const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
    const micro = safeBigInt(`${intPart}${frac}`);
    return micro > 0n ? micro : null;
}

export function usdToNativeInput(usd: string, rateUsed: string | null, decimals: number = 6): string {
    if (!rateUsed) return '';
    const usdMicro = decimalToMicro(usd, decimals);
    const rate = safeBigInt(rateUsed);
    if (usdMicro === null || rate <= 0n) return '';
    return microToPlainString((usdMicro * 1_000_000n) / rate, decimals);
}

export function nativeToUsdInput(native: string, rateUsed: string | null, decimals: number = 6): string {
    if (!rateUsed) return '';
    const nativeMicro = decimalToMicro(native, decimals);
    const rate = safeBigInt(rateUsed);
    if (nativeMicro === null || rate <= 0n) return '';
    return microToPlainString((nativeMicro * rate) / 1_000_000n, decimals);
}

// Convert a micro-denominated integer string to a JS number for UI math that
// doesn't need integer precision (percentages, chart positions). Returns 0
// for malformed input. Callers must accept that values > 2^53 lose precision.
export function microToNumber(
    amount: string | number | bigint | null | undefined,
    decimals: number = 6,
): number {
    const n = safeBigInt(amount);
    // Split to avoid losing precision for values just above 2^53: scale first.
    const base = 10n ** BigInt(decimals);
    const whole = Number(n / base);
    const frac = Number(n % base) / Number(base);
    return whole + frac;
}
