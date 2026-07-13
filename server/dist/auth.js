"use strict";
// ADR-36 (Keplr/Leap signArbitrary) verification, fully server-side.
//
// Write requests carry { address, pub_key, signature, nonce } alongside a
// `payload` object. The wallet signed the ADR-36 SignDoc over the string
//
//     bluechip-profiles:<nonce>:<sha256hex of canonical JSON payload>
//
// so the server can verify (a) the caller controls the claimed address,
// (b) the request is fresh (nonce, 5-minute TTL, consumed on use), and
// (c) the signed bytes bind to exactly this payload — no field can be
// swapped after signing.
Object.defineProperty(exports, "__esModule", { value: true });
exports.BECH32_PREFIX = exports.SIGN_PREFIX = void 0;
exports.canonicalJson = canonicalJson;
exports.signDataFor = signDataFor;
exports.makeAdr36SignDoc = makeAdr36SignDoc;
exports.extractAuth = extractAuth;
exports.verifySignedRequest = verifySignedRequest;
const amino_1 = require("@cosmjs/amino");
const crypto_1 = require("@cosmjs/crypto");
const encoding_1 = require("@cosmjs/encoding");
const db_1 = require("./db");
exports.SIGN_PREFIX = 'bluechip-profiles';
exports.BECH32_PREFIX = 'osmo';
// Deterministic JSON: object keys sorted recursively so the client and
// server hash identical bytes for the same payload.
function canonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value).sort();
    const parts = keys
        .filter((k) => value[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${parts.join(',')}}`;
}
function signDataFor(nonce, payload) {
    const payloadHash = (0, encoding_1.toHex)((0, crypto_1.sha256)((0, encoding_1.toUtf8)(canonicalJson(payload))));
    return `${exports.SIGN_PREFIX}:${nonce}:${payloadHash}`;
}
// ADR-36 SignDoc: chain_id "", account_number "0", sequence "0", zero fee,
// a single sign/MsgSignData message. This is exactly what Keplr/Leap build
// inside signArbitrary(); @cosmjs/amino 0.32 has no makeADR36AminoSignDoc
// helper, so it is constructed by hand.
function makeAdr36SignDoc(signer, data) {
    return {
        chain_id: '',
        account_number: '0',
        sequence: '0',
        fee: { gas: '0', amount: [] },
        msgs: [
            {
                type: 'sign/MsgSignData',
                value: { signer, data: (0, encoding_1.toBase64)((0, encoding_1.toUtf8)(data)) },
            },
        ],
        memo: '',
    };
}
function extractAuth(body) {
    if (!body || typeof body !== 'object')
        return null;
    const b = body;
    if (typeof b.address !== 'string' || typeof b.pub_key !== 'string' ||
        typeof b.signature !== 'string' || typeof b.nonce !== 'string')
        return null;
    return { address: b.address, pub_key: b.pub_key, signature: b.signature, nonce: b.nonce };
}
/**
 * Verifies a signed write request. The nonce is consumed whether or not
 * the signature verifies, so a captured request can never be replayed.
 */
async function verifySignedRequest(db, auth, payload) {
    // 1. Nonce: must exist for this address, match, and be fresh.
    const row = (0, db_1.getNonce)(db, auth.address);
    if (!row || row.nonce !== auth.nonce) {
        return { ok: false, status: 401, error: 'unknown or stale nonce — request a new one from /auth/nonce' };
    }
    (0, db_1.consumeNonce)(db, auth.address);
    const ageSec = Math.floor(Date.now() / 1000) - row.issued_at;
    if (ageSec > db_1.NONCE_TTL_SECONDS) {
        return { ok: false, status: 401, error: 'nonce expired — request a new one from /auth/nonce' };
    }
    // 2. Pubkey must hash to the claimed address:
    //    bech32(ripemd160(sha256(compressed pubkey))).
    let pubkeyBytes;
    try {
        pubkeyBytes = (0, encoding_1.fromBase64)(auth.pub_key);
    }
    catch {
        return { ok: false, status: 400, error: 'pub_key is not valid base64' };
    }
    let derivedAddress;
    try {
        derivedAddress = (0, amino_1.pubkeyToAddress)((0, amino_1.encodeSecp256k1Pubkey)(pubkeyBytes), exports.BECH32_PREFIX);
    }
    catch {
        return { ok: false, status: 400, error: 'pub_key is not a compressed secp256k1 key' };
    }
    if (derivedAddress !== auth.address) {
        return { ok: false, status: 401, error: 'pub_key does not match the claimed address' };
    }
    // 3. Signature must verify over the ADR-36 SignDoc for the sign-data
    //    string derived from this nonce + payload.
    let sigBytes;
    try {
        sigBytes = (0, encoding_1.fromBase64)(auth.signature);
    }
    catch {
        return { ok: false, status: 400, error: 'signature is not valid base64' };
    }
    if (sigBytes.length !== 64) {
        return { ok: false, status: 400, error: 'signature must be 64 bytes (fixed-length r||s)' };
    }
    const signDoc = makeAdr36SignDoc(auth.address, signDataFor(auth.nonce, payload));
    const digest = (0, crypto_1.sha256)((0, amino_1.serializeSignDoc)(signDoc));
    let valid = false;
    try {
        valid = await crypto_1.Secp256k1.verifySignature(crypto_1.Secp256k1Signature.fromFixedLength(sigBytes), digest, pubkeyBytes);
    }
    catch {
        valid = false;
    }
    if (!valid) {
        return { ok: false, status: 401, error: 'signature verification failed' };
    }
    return { ok: true };
}
//# sourceMappingURL=auth.js.map