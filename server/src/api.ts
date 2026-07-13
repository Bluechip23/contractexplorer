import { randomBytes } from 'crypto';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import { AuthFields, extractAuth, verifySignedRequest } from './auth';
import { queryCommittingInfo } from './chain';
import { Config } from './config';
import {
    countLinks, Db, deleteLink, getLink, getProfileByName, getProfileByPool,
    getProfileByWallet, insertLink, LinkRow, listLinks, maxPosition,
    ProfileRow, putNonce, searchProfiles, updateLink, upsertProfile,
} from './db';
import {
    isOsmoAddress, MAX_LINKS, validateBio, validateGated, validateName,
    validatePoolAddress, validatePosition, validateTitle, validateUrl,
} from './validate';

// ---------------------------------------------------------------------------
// Serialization. Public reads NEVER include the url of a gated link — the
// only paths that return gated urls are the owner's signed reads and the
// signed /links/unlock subscription check.
// ---------------------------------------------------------------------------

function publicLink(l: LinkRow): Record<string, unknown> {
    const base = { id: l.id, title: l.title, gated: !!l.gated, position: l.position };
    return l.gated ? base : { ...base, url: l.url };
}

function fullLink(l: LinkRow): Record<string, unknown> {
    return { id: l.id, title: l.title, url: l.url, gated: !!l.gated, position: l.position };
}

function publicProfile(p: ProfileRow): Record<string, unknown> {
    return {
        wallet_address: p.wallet_address,
        name: p.name,
        pool_address: p.pool_address,
        bio: p.bio,
        created_at: p.created_at,
        updated_at: p.updated_at,
    };
}

// :idOrName may be a wallet address, a profile name, or a pool address.
function resolveProfile(db: Db, idOrName: string): ProfileRow | undefined {
    if (isOsmoAddress(idOrName)) {
        return getProfileByWallet(db, idOrName) ?? getProfileByPool(db, idOrName);
    }
    return getProfileByName(db, idOrName);
}

// Fixed-window per-IP rate limiter (same shape as the indexer's — no
// external deps; set RATE_LIMIT_PER_MIN=0 behind a proxy that rate-limits).
function rateLimiter(maxPerMinute: number) {
    const windows = new Map<string, { windowStart: number; count: number }>();
    return (req: Request, res: Response, next: () => void) => {
        if (maxPerMinute <= 0 || req.path === '/health') return next();
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const w = windows.get(ip);
        if (!w || now - w.windowStart >= 60_000) {
            windows.set(ip, { windowStart: now, count: 1 });
            if (windows.size > 10_000) {
                for (const [k, v] of windows) {
                    if (now - v.windowStart >= 60_000) windows.delete(k);
                }
            }
            return next();
        }
        w.count += 1;
        if (w.count > maxPerMinute) {
            res.status(429).json({ error: 'rate limit exceeded' });
            return;
        }
        next();
    };
}

// Shared preamble for every signed endpoint: shape-check the auth fields,
// require a payload object with the expected `intent` (binding the signature
// to one specific endpoint), then verify nonce + pubkey + ADR-36 signature.
async function requireSigned(
    db: Db,
    req: Request,
    res: Response,
    intent: string,
): Promise<{ auth: AuthFields; payload: Record<string, unknown> } | null> {
    const auth = extractAuth(req.body);
    const payload = (req.body as Record<string, unknown> | undefined)?.payload;
    if (!auth || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.status(400).json({ error: 'expected { address, pub_key, signature, nonce, payload }' });
        return null;
    }
    if (!isOsmoAddress(auth.address)) {
        res.status(400).json({ error: 'address must be a valid osmo1... bech32 address' });
        return null;
    }
    const p = payload as Record<string, unknown>;
    if (p.intent !== intent) {
        res.status(400).json({ error: `payload.intent must be "${intent}"` });
        return null;
    }
    const check = await verifySignedRequest(db, auth, payload);
    if (!check.ok) {
        res.status(check.status ?? 401).json({ error: check.error });
        return null;
    }
    return { auth, payload: p };
}

export function buildApi(db: Db, cfg: Config): Express {
    const app = express();
    // Behind a reverse proxy (Caddy/Nginx) in production, so honor
    // X-Forwarded-* for correct client IPs in the rate limiter.
    app.set('trust proxy', true);
    app.use(cors(cfg.allowedOrigins.length > 0 ? { origin: cfg.allowedOrigins } : undefined));
    app.use(express.json({ limit: '64kb' }));    // JSON only, small bodies
    app.use(rateLimiter(cfg.rateLimitPerMin));

    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });

    // ---- Auth -------------------------------------------------------------

    app.get('/auth/nonce', (req, res) => {
        const address = String(req.query.address || '');
        if (!isOsmoAddress(address)) {
            return res.status(400).json({ error: 'address must be a valid osmo1... bech32 address' });
        }
        const nonce = randomBytes(16).toString('hex');
        putNonce(db, address, nonce);
        res.json({ nonce });
    });

    // ---- Public reads -----------------------------------------------------

    app.get('/profiles/:idOrName', (req, res) => {
        const idOrName = String(req.params.idOrName || '').trim();
        if (!idOrName || idOrName.length > 90) {
            return res.status(400).json({ error: 'invalid profile identifier' });
        }
        const profile = resolveProfile(db, idOrName);
        if (!profile) return res.status(404).json({ error: 'profile not found' });
        res.json({
            profile: publicProfile(profile),
            links: listLinks(db, profile.wallet_address).map(publicLink),
        });
    });

    app.get('/search', (req, res) => {
        const q = String(req.query.q || '').trim();
        if (!q || q.length > 90) return res.json({ results: [] });
        const rows = searchProfiles(db, q, 20);
        res.json({
            results: rows.map((p) => ({
                name: p.name,
                wallet_address: p.wallet_address,
                pool_address: p.pool_address,
            })),
        });
    });

    // ---- Signed writes ----------------------------------------------------

    app.put('/profiles', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'put_profile');
        if (!signed) return;
        const { auth, payload } = signed;

        const name = validateName(payload.name);
        if (!name.ok) return res.status(400).json({ error: name.error });
        const bio = validateBio(payload.bio);
        if (!bio.ok) return res.status(400).json({ error: bio.error });
        const pool = validatePoolAddress(payload.pool_address);
        if (!pool.ok) return res.status(400).json({ error: pool.error });

        // Reject case-insensitive name collisions with other wallets.
        const existing = getProfileByName(db, name.value!);
        if (existing && existing.wallet_address !== auth.address) {
            return res.status(409).json({ error: 'that name is already taken' });
        }

        const profile = upsertProfile(db, {
            wallet_address: auth.address,
            name: name.value!,
            pool_address: pool.value ?? null,
            bio: bio.value ?? null,
        });
        res.json({ profile: publicProfile(profile), links: listLinks(db, auth.address).map(fullLink) });
    });

    app.post('/links', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'add_link');
        if (!signed) return;
        const { auth, payload } = signed;

        if (!getProfileByWallet(db, auth.address)) {
            return res.status(400).json({ error: 'create a profile first (PUT /profiles)' });
        }
        if (countLinks(db, auth.address) >= MAX_LINKS) {
            return res.status(400).json({ error: `at most ${MAX_LINKS} links per profile` });
        }

        const title = validateTitle(payload.title);
        if (!title.ok) return res.status(400).json({ error: title.error });
        const url = validateUrl(payload.url);
        if (!url.ok) return res.status(400).json({ error: url.error });
        const gated = validateGated(payload.gated);
        if (!gated.ok) return res.status(400).json({ error: gated.error });
        const position = validatePosition(payload.position);
        if (!position.ok) return res.status(400).json({ error: position.error });

        const link = insertLink(db, {
            wallet_address: auth.address,
            title: title.value!,
            url: url.value!,
            gated: gated.value!,
            position: position.value ?? maxPosition(db, auth.address) + 1,
        });
        res.json({ link: fullLink(link) });
    });

    app.put('/links/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'update_link');
        if (!signed) return;
        const { auth, payload } = signed;

        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the link id in the URL' });
        }
        const existing = getLink(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            // Same response for "missing" and "not yours" — don't leak ids.
            return res.status(404).json({ error: 'link not found' });
        }

        const patch: { title?: string; url?: string; gated?: number; position?: number } = {};
        if (payload.title !== undefined) {
            const title = validateTitle(payload.title);
            if (!title.ok) return res.status(400).json({ error: title.error });
            patch.title = title.value;
        }
        if (payload.url !== undefined) {
            const url = validateUrl(payload.url);
            if (!url.ok) return res.status(400).json({ error: url.error });
            patch.url = url.value;
        }
        if (payload.gated !== undefined) {
            const gated = validateGated(payload.gated);
            if (!gated.ok) return res.status(400).json({ error: gated.error });
            patch.gated = gated.value;
        }
        if (payload.position !== undefined) {
            const position = validatePosition(payload.position);
            if (!position.ok) return res.status(400).json({ error: position.error });
            patch.position = position.value;
        }

        const link = updateLink(db, id, patch);
        res.json({ link: fullLink(link!) });
    });

    app.delete('/links/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'delete_link');
        if (!signed) return;
        const { auth, payload } = signed;

        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the link id in the URL' });
        }
        const existing = getLink(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            return res.status(404).json({ error: 'link not found' });
        }
        deleteLink(db, id);
        res.json({ ok: true });
    });

    // ---- Subscription-gated unlock -----------------------------------------
    //
    // The real enforcement point for gated links: verify the caller's
    // identity (ADR-36), then check the profile owner's pool on-chain for a
    // committing_info record for the CALLER. Owners always see their own
    // gated links.

    app.post('/links/unlock', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'unlock_links');
        if (!signed) return;
        const { auth, payload } = signed;

        const ownerKey = typeof payload.owner === 'string' ? payload.owner.trim() : '';
        if (!ownerKey || ownerKey.length > 90) {
            return res.status(400).json({ error: 'payload.owner (wallet, name, or pool address) is required' });
        }
        const profile = resolveProfile(db, ownerKey);
        if (!profile) return res.status(404).json({ error: 'profile not found' });

        const gatedLinks = listLinks(db, profile.wallet_address).filter((l) => l.gated);

        if (profile.wallet_address !== auth.address) {
            if (!profile.pool_address) {
                return res.status(403).json({ error: 'this creator has no pool configured — gated links cannot be unlocked' });
            }
            let info;
            try {
                info = await queryCommittingInfo(cfg.rpcUrl, profile.pool_address, auth.address);
            } catch (err) {
                console.error('[unlock] committing_info query failed:', err);
                return res.status(502).json({ error: 'could not verify subscription on-chain — try again' });
            }
            if (!info) {
                return res.status(403).json({ error: 'no subscription found — commit to this creator\'s pool to unlock' });
            }
        }

        res.json({ links: gatedLinks.map(fullLink) });
    });

    return app;
}
