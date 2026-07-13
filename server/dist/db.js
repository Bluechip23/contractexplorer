"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NONCE_TTL_SECONDS = void 0;
exports.openDb = openDb;
exports.migrate = migrate;
exports.getProfileByWallet = getProfileByWallet;
exports.getProfileByName = getProfileByName;
exports.getProfileByPool = getProfileByPool;
exports.upsertProfile = upsertProfile;
exports.searchProfiles = searchProfiles;
exports.listLinks = listLinks;
exports.countLinks = countLinks;
exports.getLink = getLink;
exports.insertLink = insertLink;
exports.maxPosition = maxPosition;
exports.updateLink = updateLink;
exports.deleteLink = deleteLink;
exports.listTiers = listTiers;
exports.countTiers = countTiers;
exports.getTier = getTier;
exports.maxTierPosition = maxTierPosition;
exports.insertTier = insertTier;
exports.updateTier = updateTier;
exports.deleteTier = deleteTier;
exports.setLinkTiers = setLinkTiers;
exports.getLinkTierIds = getLinkTierIds;
exports.getLinkTiers = getLinkTiers;
exports.putNonce = putNonce;
exports.getNonce = getNonce;
exports.consumeNonce = consumeNonce;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
function openDb(path) {
    const db = new better_sqlite3_1.default(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    return db;
}
function migrate(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
    wallet_address TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pool_address TEXT,
    bio TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_pool ON profiles(pool_address);

CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL REFERENCES profiles(wallet_address) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    gated INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_wallet_pos ON links(wallet_address, position);

CREATE TABLE IF NOT EXISTS nonces (
    wallet_address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    issued_at INTEGER NOT NULL
);

-- Subscription tiers. A creator defines up to MAX_TIERS named tiers total
-- (across all their pools); each tier belongs to exactly one of the pools
-- their wallet created (ownership verified on-chain before insert). price_usd
-- is a micro-USD integer string (6 decimals), matching committing_info's
-- total_paid_usd so the gate check is a plain integer comparison.
CREATE TABLE IF NOT EXISTS tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL REFERENCES profiles(wallet_address) ON DELETE CASCADE,
    pool_address TEXT NOT NULL,
    name TEXT NOT NULL,
    price_usd TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tiers_wallet ON tiers(wallet_address, position);

-- Which tiers gate a link (many-to-many). A link is "gated" when it has ≥1
-- row here; the links.gated column is a denormalized cache of that fact.
CREATE TABLE IF NOT EXISTS link_tiers (
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    tier_id INTEGER NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
    PRIMARY KEY (link_id, tier_id)
);
CREATE INDEX IF NOT EXISTS idx_link_tiers_tier ON link_tiers(tier_id);
`);
}
// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
function getProfileByWallet(db, wallet) {
    return db.prepare('SELECT * FROM profiles WHERE wallet_address = ?').get(wallet);
}
function getProfileByName(db, name) {
    return db.prepare('SELECT * FROM profiles WHERE name = ? COLLATE NOCASE').get(name);
}
function getProfileByPool(db, poolAddress) {
    return db.prepare('SELECT * FROM profiles WHERE pool_address = ?').get(poolAddress);
}
function upsertProfile(db, p) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO profiles (wallet_address, name, pool_address, bio, created_at, updated_at)
        VALUES (@wallet_address, @name, @pool_address, @bio, @now, @now)
        ON CONFLICT(wallet_address) DO UPDATE SET
            name = excluded.name,
            pool_address = excluded.pool_address,
            bio = excluded.bio,
            updated_at = excluded.updated_at`).run({ ...p, now });
    return getProfileByWallet(db, p.wallet_address);
}
function searchProfiles(db, q, limit) {
    // Substring name match (case-insensitive) OR exact wallet/pool address.
    // LIKE special characters in user input are escaped so they can't widen
    // the match.
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    return db.prepare(`
        SELECT * FROM profiles
        WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE
           OR wallet_address = ?
           OR pool_address = ?
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ?`).all(`%${escaped}%`, q, q, limit);
}
// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
function listLinks(db, wallet) {
    return db.prepare('SELECT * FROM links WHERE wallet_address = ? ORDER BY position ASC, id ASC').all(wallet);
}
function countLinks(db, wallet) {
    const row = db.prepare('SELECT COUNT(*) AS n FROM links WHERE wallet_address = ?').get(wallet);
    return row.n;
}
function getLink(db, id) {
    return db.prepare('SELECT * FROM links WHERE id = ?').get(id);
}
function insertLink(db, l) {
    const now = Math.floor(Date.now() / 1000);
    const info = db.prepare(`INSERT INTO links (wallet_address, title, url, gated, position, created_at, updated_at)
        VALUES (@wallet_address, @title, @url, @gated, @position, @now, @now)`).run({ ...l, now });
    return getLink(db, Number(info.lastInsertRowid));
}
function maxPosition(db, wallet) {
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM links WHERE wallet_address = ?').get(wallet);
    return row.p;
}
function updateLink(db, id, patch) {
    const existing = getLink(db, id);
    if (!existing)
        return undefined;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE links SET
        title = @title, url = @url, gated = @gated, position = @position, updated_at = @now
        WHERE id = @id`).run({
        id,
        title: patch.title ?? existing.title,
        url: patch.url ?? existing.url,
        gated: patch.gated ?? existing.gated,
        position: patch.position ?? existing.position,
        now,
    });
    return getLink(db, id);
}
function deleteLink(db, id) {
    db.prepare('DELETE FROM links WHERE id = ?').run(id);
}
// ---------------------------------------------------------------------------
// Subscription tiers + link↔tier gating
// ---------------------------------------------------------------------------
function listTiers(db, wallet) {
    return db.prepare('SELECT * FROM tiers WHERE wallet_address = ? ORDER BY position ASC, id ASC').all(wallet);
}
function countTiers(db, wallet) {
    const row = db.prepare('SELECT COUNT(*) AS n FROM tiers WHERE wallet_address = ?').get(wallet);
    return row.n;
}
function getTier(db, id) {
    return db.prepare('SELECT * FROM tiers WHERE id = ?').get(id);
}
function maxTierPosition(db, wallet) {
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM tiers WHERE wallet_address = ?').get(wallet);
    return row.p;
}
function insertTier(db, t) {
    const now = Math.floor(Date.now() / 1000);
    const info = db.prepare(`INSERT INTO tiers (wallet_address, pool_address, name, price_usd, position, created_at, updated_at)
        VALUES (@wallet_address, @pool_address, @name, @price_usd, @position, @now, @now)`).run({ ...t, now });
    return getTier(db, Number(info.lastInsertRowid));
}
function updateTier(db, id, patch) {
    const existing = getTier(db, id);
    if (!existing)
        return undefined;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE tiers SET
        name = @name, price_usd = @price_usd, position = @position, updated_at = @now
        WHERE id = @id`).run({
        id,
        name: patch.name ?? existing.name,
        price_usd: patch.price_usd ?? existing.price_usd,
        position: patch.position ?? existing.position,
        now,
    });
    return getTier(db, id);
}
function deleteTier(db, id) {
    db.prepare('DELETE FROM tiers WHERE id = ?').run(id);
}
/** Replace-all the set of tiers gating a link. */
function setLinkTiers(db, linkId, tierIds) {
    const tx = db.transaction((ids) => {
        db.prepare('DELETE FROM link_tiers WHERE link_id = ?').run(linkId);
        const ins = db.prepare('INSERT OR IGNORE INTO link_tiers (link_id, tier_id) VALUES (?, ?)');
        for (const tid of ids)
            ins.run(linkId, tid);
    });
    tx(tierIds);
}
function getLinkTierIds(db, linkId) {
    const rows = db.prepare('SELECT tier_id FROM link_tiers WHERE link_id = ? ORDER BY tier_id ASC').all(linkId);
    return rows.map((r) => r.tier_id);
}
/**
 * The full tier rows gating a link (joined through link_tiers). Used by the
 * unlock gate check, which groups these by pool to find each pool's cheapest
 * gating price.
 */
function getLinkTiers(db, linkId) {
    return db.prepare(`
        SELECT t.* FROM tiers t
        JOIN link_tiers lt ON lt.tier_id = t.id
        WHERE lt.link_id = ?
        ORDER BY t.pool_address ASC, t.id ASC`).all(linkId);
}
// ---------------------------------------------------------------------------
// Nonces (single active nonce per wallet, 5-minute TTL, consumed on use)
// ---------------------------------------------------------------------------
exports.NONCE_TTL_SECONDS = 5 * 60;
function putNonce(db, wallet, nonce) {
    db.prepare(`INSERT INTO nonces (wallet_address, nonce, issued_at) VALUES (?, ?, ?)
        ON CONFLICT(wallet_address) DO UPDATE SET nonce = excluded.nonce, issued_at = excluded.issued_at`)
        .run(wallet, nonce, Math.floor(Date.now() / 1000));
}
function getNonce(db, wallet) {
    return db.prepare('SELECT * FROM nonces WHERE wallet_address = ?').get(wallet);
}
function consumeNonce(db, wallet) {
    db.prepare('DELETE FROM nonces WHERE wallet_address = ?').run(wallet);
}
//# sourceMappingURL=db.js.map