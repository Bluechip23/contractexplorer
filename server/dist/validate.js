"use strict";
// Input validation for user-supplied profile fields. Everything stored in
// the database has passed through here, so the read endpoints can serve
// rows without re-checking.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LINK_TIERS = exports.PRICE_USD_MAX = exports.TIER_NAME_MAX = exports.MAX_TIERS = exports.MAX_LINKS = exports.URL_MAX = exports.TITLE_MAX = exports.BIO_MAX = exports.NAME_MAX = exports.NAME_MIN = void 0;
exports.isOsmoAddress = isOsmoAddress;
exports.validateName = validateName;
exports.validateBio = validateBio;
exports.validatePoolAddress = validatePoolAddress;
exports.validateTitle = validateTitle;
exports.validateUrl = validateUrl;
exports.validateGated = validateGated;
exports.validatePosition = validatePosition;
exports.validateTierName = validateTierName;
exports.validatePriceUsd = validatePriceUsd;
exports.validateTierIds = validateTierIds;
const encoding_1 = require("@cosmjs/encoding");
exports.NAME_MIN = 3;
exports.NAME_MAX = 32;
exports.BIO_MAX = 280;
exports.TITLE_MAX = 80;
exports.URL_MAX = 2048;
exports.MAX_LINKS = 50;
// Max subscription tiers a single wallet may define, across all its pools.
exports.MAX_TIERS = 5;
exports.TIER_NAME_MAX = 40;
// Sane upper bound on a tier price: 1e15 micro-USD = $1,000,000,000.
exports.PRICE_USD_MAX = 1000000000000000n;
// Max tier ids that may gate a single link.
exports.MAX_LINK_TIERS = 20;
const NAME_PATTERN = /^[a-zA-Z0-9 _.-]+$/;
function isOsmoAddress(value) {
    if (typeof value !== 'string')
        return false;
    try {
        return (0, encoding_1.fromBech32)(value).prefix === 'osmo';
    }
    catch {
        return false;
    }
}
function validateName(raw) {
    if (typeof raw !== 'string')
        return { ok: false, error: 'name is required' };
    const name = raw.trim();
    if (name.length < exports.NAME_MIN || name.length > exports.NAME_MAX) {
        return { ok: false, error: `name must be ${exports.NAME_MIN}-${exports.NAME_MAX} characters` };
    }
    if (!NAME_PATTERN.test(name)) {
        return { ok: false, error: 'name may only contain letters, digits, spaces, "_", "." and "-"' };
    }
    return { ok: true, value: name };
}
function validateBio(raw) {
    if (raw === undefined || raw === null || raw === '')
        return { ok: true, value: null };
    if (typeof raw !== 'string')
        return { ok: false, error: 'bio must be a string' };
    const bio = raw.trim();
    if (bio.length > exports.BIO_MAX)
        return { ok: false, error: `bio must be at most ${exports.BIO_MAX} characters` };
    return { ok: true, value: bio || null };
}
function validatePoolAddress(raw) {
    if (raw === undefined || raw === null || raw === '')
        return { ok: true, value: null };
    if (!isOsmoAddress(raw))
        return { ok: false, error: 'pool_address must be a valid osmo1... bech32 address' };
    return { ok: true, value: raw };
}
function validateTitle(raw) {
    if (typeof raw !== 'string')
        return { ok: false, error: 'title is required' };
    const title = raw.trim();
    if (title.length === 0)
        return { ok: false, error: 'title is required' };
    if (title.length > exports.TITLE_MAX)
        return { ok: false, error: `title must be at most ${exports.TITLE_MAX} characters` };
    return { ok: true, value: title };
}
function validateUrl(raw) {
    if (typeof raw !== 'string')
        return { ok: false, error: 'url is required' };
    const url = raw.trim();
    if (url.length === 0 || url.length > exports.URL_MAX) {
        return { ok: false, error: `url must be 1-${exports.URL_MAX} characters` };
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return { ok: false, error: 'url must be a valid absolute URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'url must use http or https' };
    }
    return { ok: true, value: url };
}
function validateGated(raw) {
    if (raw === undefined || raw === null)
        return { ok: true, value: 0 };
    if (typeof raw === 'boolean')
        return { ok: true, value: raw ? 1 : 0 };
    if (raw === 0 || raw === 1)
        return { ok: true, value: raw };
    return { ok: false, error: 'gated must be a boolean (or 0/1)' };
}
function validatePosition(raw) {
    if (raw === undefined || raw === null)
        return { ok: true, value: undefined };
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 1_000_000) {
        return { ok: false, error: 'position must be a non-negative integer' };
    }
    return { ok: true, value: raw };
}
// ---------------------------------------------------------------------------
// Subscription tiers
// ---------------------------------------------------------------------------
// Control, zero-width, and bidirectional-override characters that must never
// appear in a tier name (they can hide or spoof text in the checkbox labels).
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
function validateTierName(raw) {
    if (typeof raw !== 'string')
        return { ok: false, error: 'tier name is required' };
    const name = raw.trim();
    if (name.length < 1 || name.length > exports.TIER_NAME_MAX) {
        return { ok: false, error: `tier name must be 1-${exports.TIER_NAME_MAX} characters` };
    }
    if (UNSAFE_TEXT.test(name)) {
        return { ok: false, error: 'tier name contains disallowed characters' };
    }
    return { ok: true, value: name };
}
// Prices are micro-USD (6 decimals) to match committing_info.total_paid_usd.
// Accept a non-negative integer string only — never a float, never scientific
// notation — so the money value survives end-to-end without drift.
function validatePriceUsd(raw) {
    const s = typeof raw === 'number' && Number.isInteger(raw) ? String(raw)
        : typeof raw === 'string' ? raw.trim() : null;
    if (s === null || !/^\d+$/.test(s)) {
        return { ok: false, error: 'price_usd must be an integer micro-USD string' };
    }
    // Normalize leading zeros.
    const normalized = s.replace(/^0+(?=\d)/, '');
    let n;
    try {
        n = BigInt(normalized);
    }
    catch {
        return { ok: false, error: 'price_usd must be an integer micro-USD string' };
    }
    if (n <= 0n)
        return { ok: false, error: 'price_usd must be greater than zero' };
    if (n > exports.PRICE_USD_MAX)
        return { ok: false, error: 'price_usd is too large' };
    return { ok: true, value: normalized };
}
// Tier ids gating a link: an array of positive integers, deduped, capped.
function validateTierIds(raw) {
    if (raw === undefined || raw === null)
        return { ok: true, value: [] };
    if (!Array.isArray(raw))
        return { ok: false, error: 'tier_ids must be an array of tier ids' };
    if (raw.length > exports.MAX_LINK_TIERS) {
        return { ok: false, error: `at most ${exports.MAX_LINK_TIERS} tiers per link` };
    }
    const out = new Set();
    for (const v of raw) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
            return { ok: false, error: 'tier_ids must be positive integers' };
        }
        out.add(v);
    }
    return { ok: true, value: [...out] };
}
//# sourceMappingURL=validate.js.map