"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApi = buildApi;
const crypto_1 = require("crypto");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const chain_1 = require("./chain");
const db_1 = require("./db");
const gate_1 = require("./gate");
const validate_1 = require("./validate");
// ---------------------------------------------------------------------------
// Serialization. Public reads NEVER include the url of a gated link — the
// only paths that return gated urls are the owner's signed reads and the
// signed /links/unlock subscription check.
// ---------------------------------------------------------------------------
function publicLink(l, tierIds) {
    const base = { id: l.id, title: l.title, gated: !!l.gated, position: l.position, tier_ids: tierIds };
    return l.gated ? base : { ...base, url: l.url };
}
function fullLink(l, tierIds) {
    return { id: l.id, title: l.title, url: l.url, gated: !!l.gated, position: l.position, tier_ids: tierIds };
}
// Public tier fields — safe to serve on the unauthenticated profile read so
// followers know what each tier is called, which pool it belongs to, and its
// price (micro-USD string).
function publicTier(t) {
    return {
        id: t.id,
        pool_address: t.pool_address,
        name: t.name,
        price_usd: t.price_usd,
        position: t.position,
    };
}
// Serialize every link for a wallet with its tier ids attached (one query per
// link; link counts are small — capped at MAX_LINKS).
function linksWith(db, wallet, serialize) {
    return (0, db_1.listLinks)(db, wallet).map((l) => serialize(l, (0, db_1.getLinkTierIds)(db, l.id)));
}
function publicProfile(p) {
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
function resolveProfile(db, idOrName) {
    if ((0, validate_1.isOsmoAddress)(idOrName)) {
        return (0, db_1.getProfileByWallet)(db, idOrName) ?? (0, db_1.getProfileByPool)(db, idOrName);
    }
    return (0, db_1.getProfileByName)(db, idOrName);
}
// Fixed-window per-IP rate limiter (same shape as the indexer's — no
// external deps; set RATE_LIMIT_PER_MIN=0 behind a proxy that rate-limits).
function rateLimiter(maxPerMinute) {
    const windows = new Map();
    return (req, res, next) => {
        if (maxPerMinute <= 0 || req.path === '/health')
            return next();
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const w = windows.get(ip);
        if (!w || now - w.windowStart >= 60_000) {
            windows.set(ip, { windowStart: now, count: 1 });
            if (windows.size > 10_000) {
                for (const [k, v] of windows) {
                    if (now - v.windowStart >= 60_000)
                        windows.delete(k);
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
async function requireSigned(db, req, res, intent) {
    const auth = (0, auth_1.extractAuth)(req.body);
    const payload = req.body?.payload;
    if (!auth || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.status(400).json({ error: 'expected { address, pub_key, signature, nonce, payload }' });
        return null;
    }
    if (!(0, validate_1.isOsmoAddress)(auth.address)) {
        res.status(400).json({ error: 'address must be a valid osmo1... bech32 address' });
        return null;
    }
    const p = payload;
    if (p.intent !== intent) {
        res.status(400).json({ error: `payload.intent must be "${intent}"` });
        return null;
    }
    const check = await (0, auth_1.verifySignedRequest)(db, auth, payload);
    if (!check.ok) {
        res.status(check.status ?? 401).json({ error: check.error });
        return null;
    }
    return { auth, payload: p };
}
// On-chain pool-ownership gate shared by PUT /profiles and POST /tiers.
// Returns true when the signer is the pool's creator. On any other outcome it
// has already written the response (403 not owner, 502 RPC failure) and
// returns false — callers must `return` immediately when it is not true.
async function verifyPoolOwnership(cfg, res, poolAddress, wallet) {
    let creator;
    try {
        creator = await (0, chain_1.queryPoolCreator)(cfg.rpcUrl, poolAddress);
    }
    catch (err) {
        console.error('[pool-ownership] fee_info query failed:', err);
        res.status(502).json({ error: 'could not verify pool ownership on-chain — try again' });
        return false;
    }
    if (creator !== wallet) {
        res.status(403).json({ error: 'that pool was not created by your wallet' });
        return false;
    }
    return true;
}
// Validate a link write's `tier_ids` and confirm every referenced tier belongs
// to the caller. Returns the (deduped) id list, or null after writing a 400 —
// callers must `return` when it is null. An absent field yields [].
function resolveOwnedTiers(db, res, wallet, payload) {
    const parsed = (0, validate_1.validateTierIds)(payload.tier_ids);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return null;
    }
    for (const id of parsed.value) {
        const tier = (0, db_1.getTier)(db, id);
        if (!tier || tier.wallet_address !== wallet) {
            res.status(400).json({ error: `tier ${id} does not exist or is not yours` });
            return null;
        }
    }
    return parsed.value;
}
function buildApi(db, cfg) {
    const app = (0, express_1.default)();
    // Behind a reverse proxy (Caddy/Nginx) in production, so honor
    // X-Forwarded-* for correct client IPs in the rate limiter.
    app.set('trust proxy', true);
    app.use((0, cors_1.default)(cfg.allowedOrigins.length > 0 ? { origin: cfg.allowedOrigins } : undefined));
    app.use(express_1.default.json({ limit: '64kb' })); // JSON only, small bodies
    app.use(rateLimiter(cfg.rateLimitPerMin));
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    // ---- Auth -------------------------------------------------------------
    app.get('/auth/nonce', (req, res) => {
        const address = String(req.query.address || '');
        if (!(0, validate_1.isOsmoAddress)(address)) {
            return res.status(400).json({ error: 'address must be a valid osmo1... bech32 address' });
        }
        const nonce = (0, crypto_1.randomBytes)(16).toString('hex');
        (0, db_1.putNonce)(db, address, nonce);
        res.json({ nonce });
    });
    // ---- Public reads -----------------------------------------------------
    app.get('/profiles/:idOrName', (req, res) => {
        const idOrName = String(req.params.idOrName || '').trim();
        if (!idOrName || idOrName.length > 90) {
            return res.status(400).json({ error: 'invalid profile identifier' });
        }
        const profile = resolveProfile(db, idOrName);
        if (!profile)
            return res.status(404).json({ error: 'profile not found' });
        res.json({
            profile: publicProfile(profile),
            links: linksWith(db, profile.wallet_address, publicLink),
            tiers: (0, db_1.listTiers)(db, profile.wallet_address).map(publicTier),
        });
    });
    app.get('/search', (req, res) => {
        const q = String(req.query.q || '').trim();
        if (!q || q.length > 90)
            return res.json({ results: [] });
        const rows = (0, db_1.searchProfiles)(db, q, 20);
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
        if (!signed)
            return;
        const { auth, payload } = signed;
        const name = (0, validate_1.validateName)(payload.name);
        if (!name.ok)
            return res.status(400).json({ error: name.error });
        const bio = (0, validate_1.validateBio)(payload.bio);
        if (!bio.ok)
            return res.status(400).json({ error: bio.error });
        const pool = (0, validate_1.validatePoolAddress)(payload.pool_address);
        if (!pool.ok)
            return res.status(400).json({ error: pool.error });
        // Reject case-insensitive name collisions with other wallets.
        const existing = (0, db_1.getProfileByName)(db, name.value);
        if (existing && existing.wallet_address !== auth.address) {
            return res.status(409).json({ error: 'that name is already taken' });
        }
        // A featured pool must actually belong to the signer on-chain — this
        // closes the "point your profile at someone else's pool" trust gap.
        if (pool.value) {
            const owned = await verifyPoolOwnership(cfg, res, pool.value, auth.address);
            if (owned !== true)
                return; // response already sent (403 / 502)
        }
        const profile = (0, db_1.upsertProfile)(db, {
            wallet_address: auth.address,
            name: name.value,
            pool_address: pool.value ?? null,
            bio: bio.value ?? null,
        });
        res.json({ profile: publicProfile(profile), links: linksWith(db, auth.address, fullLink) });
    });
    app.post('/links', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'add_link');
        if (!signed)
            return;
        const { auth, payload } = signed;
        if (!(0, db_1.getProfileByWallet)(db, auth.address)) {
            return res.status(400).json({ error: 'create a profile first (PUT /profiles)' });
        }
        if ((0, db_1.countLinks)(db, auth.address) >= validate_1.MAX_LINKS) {
            return res.status(400).json({ error: `at most ${validate_1.MAX_LINKS} links per profile` });
        }
        const title = (0, validate_1.validateTitle)(payload.title);
        if (!title.ok)
            return res.status(400).json({ error: title.error });
        const url = (0, validate_1.validateUrl)(payload.url);
        if (!url.ok)
            return res.status(400).json({ error: url.error });
        const position = (0, validate_1.validatePosition)(payload.position);
        if (!position.ok)
            return res.status(400).json({ error: position.error });
        // Gating is driven by tier_ids: a link with ≥1 tier is gated. When no
        // tier_ids field is present at all, fall back to the legacy `gated`
        // boolean so older clients still work.
        const ownedTiers = resolveOwnedTiers(db, res, auth.address, payload);
        if (ownedTiers === null)
            return; // response already sent
        let gatedValue;
        if (payload.tier_ids !== undefined) {
            gatedValue = ownedTiers.length > 0 ? 1 : 0;
        }
        else {
            const gated = (0, validate_1.validateGated)(payload.gated);
            if (!gated.ok)
                return res.status(400).json({ error: gated.error });
            gatedValue = gated.value;
        }
        const link = (0, db_1.insertLink)(db, {
            wallet_address: auth.address,
            title: title.value,
            url: url.value,
            gated: gatedValue,
            position: position.value ?? (0, db_1.maxPosition)(db, auth.address) + 1,
        });
        (0, db_1.setLinkTiers)(db, link.id, ownedTiers);
        res.json({ link: fullLink(link, ownedTiers) });
    });
    app.put('/links/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'update_link');
        if (!signed)
            return;
        const { auth, payload } = signed;
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the link id in the URL' });
        }
        const existing = (0, db_1.getLink)(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            // Same response for "missing" and "not yours" — don't leak ids.
            return res.status(404).json({ error: 'link not found' });
        }
        const patch = {};
        if (payload.title !== undefined) {
            const title = (0, validate_1.validateTitle)(payload.title);
            if (!title.ok)
                return res.status(400).json({ error: title.error });
            patch.title = title.value;
        }
        if (payload.url !== undefined) {
            const url = (0, validate_1.validateUrl)(payload.url);
            if (!url.ok)
                return res.status(400).json({ error: url.error });
            patch.url = url.value;
        }
        if (payload.position !== undefined) {
            const position = (0, validate_1.validatePosition)(payload.position);
            if (!position.ok)
                return res.status(400).json({ error: position.error });
            patch.position = position.value;
        }
        // When tier_ids is present, it replaces the link's tier set and drives
        // the gated flag; when absent, tiers are left untouched and the legacy
        // `gated` boolean (if present) still applies.
        let newTierIds = null;
        if (payload.tier_ids !== undefined) {
            newTierIds = resolveOwnedTiers(db, res, auth.address, payload);
            if (newTierIds === null)
                return; // response already sent
            patch.gated = newTierIds.length > 0 ? 1 : 0;
        }
        else if (payload.gated !== undefined) {
            const gated = (0, validate_1.validateGated)(payload.gated);
            if (!gated.ok)
                return res.status(400).json({ error: gated.error });
            patch.gated = gated.value;
        }
        const link = (0, db_1.updateLink)(db, id, patch);
        if (newTierIds !== null)
            (0, db_1.setLinkTiers)(db, id, newTierIds);
        res.json({ link: fullLink(link, (0, db_1.getLinkTierIds)(db, id)) });
    });
    app.delete('/links/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'delete_link');
        if (!signed)
            return;
        const { auth, payload } = signed;
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the link id in the URL' });
        }
        const existing = (0, db_1.getLink)(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            return res.status(404).json({ error: 'link not found' });
        }
        (0, db_1.deleteLink)(db, id);
        res.json({ ok: true });
    });
    // ---- Subscription tiers ------------------------------------------------
    // Create a tier. Requires a profile, enforces the MAX_TIERS-per-wallet cap,
    // and verifies on-chain that the signer created the target pool.
    app.post('/tiers', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'add_tier');
        if (!signed)
            return;
        const { auth, payload } = signed;
        if (!(0, db_1.getProfileByWallet)(db, auth.address)) {
            return res.status(400).json({ error: 'create a profile first (PUT /profiles)' });
        }
        if ((0, db_1.countTiers)(db, auth.address) >= validate_1.MAX_TIERS) {
            return res.status(400).json({ error: `at most ${validate_1.MAX_TIERS} subscription tiers per creator` });
        }
        if (!(0, validate_1.isOsmoAddress)(payload.pool_address)) {
            return res.status(400).json({ error: 'pool_address must be a valid osmo1... bech32 address' });
        }
        const poolAddress = payload.pool_address;
        const name = (0, validate_1.validateTierName)(payload.name);
        if (!name.ok)
            return res.status(400).json({ error: name.error });
        const price = (0, validate_1.validatePriceUsd)(payload.price_usd);
        if (!price.ok)
            return res.status(400).json({ error: price.error });
        const owned = await verifyPoolOwnership(cfg, res, poolAddress, auth.address);
        if (owned !== true)
            return; // response already sent (403 / 502)
        const tier = (0, db_1.insertTier)(db, {
            wallet_address: auth.address,
            pool_address: poolAddress,
            name: name.value,
            price_usd: price.value,
            position: (0, db_1.maxTierPosition)(db, auth.address) + 1,
        });
        res.json({ tier: publicTier(tier) });
    });
    // Update a tier's name / price / position. The pool cannot be changed here
    // (moving a tier to another pool = delete + recreate, which re-runs the
    // on-chain ownership check).
    app.put('/tiers/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'update_tier');
        if (!signed)
            return;
        const { auth, payload } = signed;
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the tier id in the URL' });
        }
        const existing = (0, db_1.getTier)(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            return res.status(404).json({ error: 'tier not found' });
        }
        const patch = {};
        if (payload.name !== undefined) {
            const name = (0, validate_1.validateTierName)(payload.name);
            if (!name.ok)
                return res.status(400).json({ error: name.error });
            patch.name = name.value;
        }
        if (payload.price_usd !== undefined) {
            const price = (0, validate_1.validatePriceUsd)(payload.price_usd);
            if (!price.ok)
                return res.status(400).json({ error: price.error });
            patch.price_usd = price.value;
        }
        if (payload.position !== undefined) {
            const position = (0, validate_1.validatePosition)(payload.position);
            if (!position.ok)
                return res.status(400).json({ error: position.error });
            patch.position = position.value;
        }
        const tier = (0, db_1.updateTier)(db, id, patch);
        res.json({ tier: publicTier(tier) });
    });
    app.delete('/tiers/:id', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'delete_tier');
        if (!signed)
            return;
        const { auth, payload } = signed;
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || payload.id !== id) {
            return res.status(400).json({ error: 'payload.id must match the tier id in the URL' });
        }
        const existing = (0, db_1.getTier)(db, id);
        if (!existing || existing.wallet_address !== auth.address) {
            return res.status(404).json({ error: 'tier not found' });
        }
        // link_tiers rows referencing this tier cascade away.
        (0, db_1.deleteTier)(db, id);
        res.json({ ok: true });
    });
    // ---- Subscription-gated unlock -----------------------------------------
    //
    // The real enforcement point for gated links, now PER-LINK. Verify the
    // caller's identity (ADR-36), then for each gated link compute the cheapest
    // gate price per pool and compare it to the caller's committing_info on
    // that pool (queried once per distinct pool, cached for the request). A
    // link unlocks when the caller qualifies for at least ONE of its pools.
    // The owner always qualifies for every link.
    app.post('/links/unlock', async (req, res) => {
        const signed = await requireSigned(db, req, res, 'unlock_links');
        if (!signed)
            return;
        const { auth, payload } = signed;
        const ownerKey = typeof payload.owner === 'string' ? payload.owner.trim() : '';
        if (!ownerKey || ownerKey.length > 90) {
            return res.status(400).json({ error: 'payload.owner (wallet, name, or pool address) is required' });
        }
        const profile = resolveProfile(db, ownerKey);
        if (!profile)
            return res.status(404).json({ error: 'profile not found' });
        const gatedLinks = (0, db_1.listLinks)(db, profile.wallet_address).filter((l) => l.gated);
        const isOwner = profile.wallet_address === auth.address;
        // Owner sees everything with no on-chain round-trip.
        if (isOwner) {
            return res.json({ links: gatedLinks.map((l) => fullLink(l, (0, db_1.getLinkTierIds)(db, l.id))) });
        }
        // Precompute each link's cheapest-gate-per-pool, and gather the set of
        // distinct pools we need a committing_info reading for.
        const linkGates = gatedLinks.map((l) => ({
            link: l,
            gates: (0, gate_1.cheapestGatesByPool)((0, db_1.getLinkTiers)(db, l.id)),
        }));
        const pools = new Set();
        for (const lg of linkGates) {
            for (const pool of lg.gates.keys())
                pools.add(pool);
        }
        // One committing_info query per distinct pool. Any RPC failure fails
        // the whole request closed (502) rather than partially unlocking.
        const paidByPool = new Map();
        for (const pool of pools) {
            try {
                const info = await (0, chain_1.queryCommittingInfo)(cfg.rpcUrl, pool, auth.address);
                paidByPool.set(pool, info ? safeUsd(info.total_paid_usd) : null);
            }
            catch (err) {
                console.error('[unlock] committing_info query failed:', err);
                return res.status(502).json({ error: 'could not verify subscription on-chain — try again' });
            }
        }
        const qualifying = linkGates
            .filter((lg) => (0, gate_1.qualifiesForLink)(lg.gates, paidByPool))
            .map((lg) => fullLink(lg.link, (0, db_1.getLinkTierIds)(db, lg.link.id)));
        res.json({ links: qualifying });
    });
    return app;
}
// Parse an on-chain micro-USD string to BigInt, tolerating malformed values
// (treated as 0 committed rather than crashing the unlock check).
function safeUsd(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        return 0n;
    try {
        return BigInt(value);
    }
    catch {
        return 0n;
    }
}
//# sourceMappingURL=api.js.map