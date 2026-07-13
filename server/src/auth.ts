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

import {
    encodeSecp256k1Pubkey,
    pubkeyToAddress,
    serializeSignDoc,
    StdSignDoc,
} from '@cosmjs/amino';
import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto';
import { fromBase64, toBase64, toHex, toUtf8 } from '@cosmjs/encoding';
import { consumeNonce, Db, getNonce, NONCE_TTL_SECONDS } from './db';

export const SIGN_PREFIX = 'bluechip-profiles';
export const BECH32_PREFIX = 'osmo';

export interface AuthFields {
    address: string;
    pub_key: string;    // base64 compressed secp256k1 (33 bytes)
    signature: string;  // base64 fixed-length r||s (64 bytes)
    nonce: string;
}

// Deterministic JSON: object keys sorted recursively so the client and
// server hash identical bytes for the same payload.
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${parts.join(',')}}`;
}

export function signDataFor(nonce: string, payload: unknown): string {
    const payloadHash = toHex(sha256(toUtf8(canonicalJson(payload))));
    return `${SIGN_PREFIX}:${nonce}:${payloadHash}`;
}

// ADR-36 SignDoc: chain_id "", account_number "0", sequence "0", zero fee,
// a single sign/MsgSignData message. This is exactly what Keplr/Leap build
// inside signArbitrary(); @cosmjs/amino 0.32 has no makeADR36AminoSignDoc
// helper, so it is constructed by hand.
export function makeAdr36SignDoc(signer: string, data: string): StdSignDoc {
    return {
        chain_id: '',
        account_number: '0',
        sequence: '0',
        fee: { gas: '0', amount: [] },
        msgs: [
            {
                type: 'sign/MsgSignData',
                value: { signer, data: toBase64(toUtf8(data)) },
            },
        ],
        memo: '',
    };
}

export interface AuthResult {
    ok: boolean;
    status?: number;   // HTTP status to respond with on failure
    error?: string;
}

export function extractAuth(body: unknown): AuthFields | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (
        typeof b.address !== 'string' || typeof b.pub_key !== 'string' ||
        typeof b.signature !== 'string' || typeof b.nonce !== 'string'
    ) return null;
    return { address: b.address, pub_key: b.pub_key, signature: b.signature, nonce: b.nonce };
}

/**
 * Verifies a signed write request. The nonce is consumed whether or not
 * the signature verifies, so a captured request can never be replayed.
 */
export async function verifySignedRequest(
    db: Db,
    auth: AuthFields,
    payload: unknown,
): Promise<AuthResult> {
    // 1. Nonce: must exist for this address, match, and be fresh.
    const row = getNonce(db, auth.address);
    if (!row || row.nonce !== auth.nonce) {
        return { ok: false, status: 401, error: 'unknown or stale nonce — request a new one from /auth/nonce' };
    }
    consumeNonce(db, auth.address);
    const ageSec = Math.floor(Date.now() / 1000) - row.issued_at;
    if (ageSec > NONCE_TTL_SECONDS) {
        return { ok: false, status: 401, error: 'nonce expired — request a new one from /auth/nonce' };
    }

    // 2. Pubkey must hash to the claimed address:
    //    bech32(ripemd160(sha256(compressed pubkey))).
    let pubkeyBytes: Uint8Array;
    try {
        pubkeyBytes = fromBase64(auth.pub_key);
    } catch {
        return { ok: false, status: 400, error: 'pub_key is not valid base64' };
    }
    let derivedAddress: string;
    try {
        derivedAddress = pubkeyToAddress(encodeSecp256k1Pubkey(pubkeyBytes), BECH32_PREFIX);
    } catch {
        return { ok: false, status: 400, error: 'pub_key is not a compressed secp256k1 key' };
    }
    if (derivedAddress !== auth.address) {
        return { ok: false, status: 401, error: 'pub_key does not match the claimed address' };
    }

    // 3. Signature must verify over the ADR-36 SignDoc for the sign-data
    //    string derived from this nonce + payload.
    let sigBytes: Uint8Array;
    try {
        sigBytes = fromBase64(auth.signature);
    } catch {
        return { ok: false, status: 400, error: 'signature is not valid base64' };
    }
    if (sigBytes.length !== 64) {
        return { ok: false, status: 400, error: 'signature must be 64 bytes (fixed-length r||s)' };
    }
    const signDoc = makeAdr36SignDoc(auth.address, signDataFor(auth.nonce, payload));
    const digest = sha256(serializeSignDoc(signDoc));
    let valid = false;
    try {
        valid = await Secp256k1.verifySignature(
            Secp256k1Signature.fromFixedLength(sigBytes),
            digest,
            pubkeyBytes,
        );
    } catch {
        valid = false;
    }
    if (!valid) {
        return { ok: false, status: 401, error: 'signature verification failed' };
    }
    return { ok: true };
}
