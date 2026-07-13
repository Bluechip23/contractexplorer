import Database from 'better-sqlite3';

// Creator-profile storage. Wallet addresses are the primary identity;
// display names are unique case-insensitively so /creator/<name> lookups
// can't be squatted with case variants.

export type Db = Database.Database;

export function openDb(path: string): Db {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    return db;
}

export function migrate(db: Db): void {
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
// Row types
// ---------------------------------------------------------------------------

export interface ProfileRow {
    wallet_address: string;
    name: string;
    pool_address: string | null;
    bio: string | null;
    created_at: number;
    updated_at: number;
}

export interface LinkRow {
    id: number;
    wallet_address: string;
    title: string;
    url: string;
    gated: number;
    position: number;
    created_at: number;
    updated_at: number;
}

export interface NonceRow {
    wallet_address: string;
    nonce: string;
    issued_at: number;
}

export interface TierRow {
    id: number;
    wallet_address: string;
    pool_address: string;
    name: string;
    price_usd: string;
    position: number;
    created_at: number;
    updated_at: number;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export function getProfileByWallet(db: Db, wallet: string): ProfileRow | undefined {
    return db.prepare('SELECT * FROM profiles WHERE wallet_address = ?').get(wallet) as ProfileRow | undefined;
}

export function getProfileByName(db: Db, name: string): ProfileRow | undefined {
    return db.prepare('SELECT * FROM profiles WHERE name = ? COLLATE NOCASE').get(name) as ProfileRow | undefined;
}

export function getProfileByPool(db: Db, poolAddress: string): ProfileRow | undefined {
    return db.prepare('SELECT * FROM profiles WHERE pool_address = ?').get(poolAddress) as ProfileRow | undefined;
}

export function upsertProfile(db: Db, p: {
    wallet_address: string; name: string; pool_address: string | null; bio: string | null;
}): ProfileRow {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO profiles (wallet_address, name, pool_address, bio, created_at, updated_at)
        VALUES (@wallet_address, @name, @pool_address, @bio, @now, @now)
        ON CONFLICT(wallet_address) DO UPDATE SET
            name = excluded.name,
            pool_address = excluded.pool_address,
            bio = excluded.bio,
            updated_at = excluded.updated_at`).run({ ...p, now });
    return getProfileByWallet(db, p.wallet_address)!;
}

export function searchProfiles(db: Db, q: string, limit: number): ProfileRow[] {
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
        LIMIT ?`).all(`%${escaped}%`, q, q, limit) as ProfileRow[];
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export function listLinks(db: Db, wallet: string): LinkRow[] {
    return db.prepare(
        'SELECT * FROM links WHERE wallet_address = ? ORDER BY position ASC, id ASC',
    ).all(wallet) as LinkRow[];
}

export function countLinks(db: Db, wallet: string): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM links WHERE wallet_address = ?').get(wallet) as { n: number };
    return row.n;
}

export function getLink(db: Db, id: number): LinkRow | undefined {
    return db.prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
}

export function insertLink(db: Db, l: {
    wallet_address: string; title: string; url: string; gated: number; position: number;
}): LinkRow {
    const now = Math.floor(Date.now() / 1000);
    const info = db.prepare(`INSERT INTO links (wallet_address, title, url, gated, position, created_at, updated_at)
        VALUES (@wallet_address, @title, @url, @gated, @position, @now, @now)`).run({ ...l, now });
    return getLink(db, Number(info.lastInsertRowid))!;
}

export function maxPosition(db: Db, wallet: string): number {
    const row = db.prepare(
        'SELECT COALESCE(MAX(position), -1) AS p FROM links WHERE wallet_address = ?',
    ).get(wallet) as { p: number };
    return row.p;
}

export function updateLink(db: Db, id: number, patch: {
    title?: string; url?: string; gated?: number; position?: number;
}): LinkRow | undefined {
    const existing = getLink(db, id);
    if (!existing) return undefined;
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

export function deleteLink(db: Db, id: number): void {
    db.prepare('DELETE FROM links WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Subscription tiers + link↔tier gating
// ---------------------------------------------------------------------------

export function listTiers(db: Db, wallet: string): TierRow[] {
    return db.prepare(
        'SELECT * FROM tiers WHERE wallet_address = ? ORDER BY position ASC, id ASC',
    ).all(wallet) as TierRow[];
}

export function countTiers(db: Db, wallet: string): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM tiers WHERE wallet_address = ?').get(wallet) as { n: number };
    return row.n;
}

export function getTier(db: Db, id: number): TierRow | undefined {
    return db.prepare('SELECT * FROM tiers WHERE id = ?').get(id) as TierRow | undefined;
}

export function maxTierPosition(db: Db, wallet: string): number {
    const row = db.prepare(
        'SELECT COALESCE(MAX(position), -1) AS p FROM tiers WHERE wallet_address = ?',
    ).get(wallet) as { p: number };
    return row.p;
}

export function insertTier(db: Db, t: {
    wallet_address: string; pool_address: string; name: string; price_usd: string; position: number;
}): TierRow {
    const now = Math.floor(Date.now() / 1000);
    const info = db.prepare(`INSERT INTO tiers (wallet_address, pool_address, name, price_usd, position, created_at, updated_at)
        VALUES (@wallet_address, @pool_address, @name, @price_usd, @position, @now, @now)`).run({ ...t, now });
    return getTier(db, Number(info.lastInsertRowid))!;
}

export function updateTier(db: Db, id: number, patch: {
    name?: string; price_usd?: string; position?: number;
}): TierRow | undefined {
    const existing = getTier(db, id);
    if (!existing) return undefined;
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

export function deleteTier(db: Db, id: number): void {
    db.prepare('DELETE FROM tiers WHERE id = ?').run(id);
}

/** Replace-all the set of tiers gating a link. */
export function setLinkTiers(db: Db, linkId: number, tierIds: number[]): void {
    const tx = db.transaction((ids: number[]) => {
        db.prepare('DELETE FROM link_tiers WHERE link_id = ?').run(linkId);
        const ins = db.prepare('INSERT OR IGNORE INTO link_tiers (link_id, tier_id) VALUES (?, ?)');
        for (const tid of ids) ins.run(linkId, tid);
    });
    tx(tierIds);
}

export function getLinkTierIds(db: Db, linkId: number): number[] {
    const rows = db.prepare(
        'SELECT tier_id FROM link_tiers WHERE link_id = ? ORDER BY tier_id ASC',
    ).all(linkId) as { tier_id: number }[];
    return rows.map((r) => r.tier_id);
}

/**
 * The full tier rows gating a link (joined through link_tiers). Used by the
 * unlock gate check, which groups these by pool to find each pool's cheapest
 * gating price.
 */
export function getLinkTiers(db: Db, linkId: number): TierRow[] {
    return db.prepare(`
        SELECT t.* FROM tiers t
        JOIN link_tiers lt ON lt.tier_id = t.id
        WHERE lt.link_id = ?
        ORDER BY t.pool_address ASC, t.id ASC`).all(linkId) as TierRow[];
}

// ---------------------------------------------------------------------------
// Nonces (single active nonce per wallet, 5-minute TTL, consumed on use)
// ---------------------------------------------------------------------------

export const NONCE_TTL_SECONDS = 5 * 60;

export function putNonce(db: Db, wallet: string, nonce: string): void {
    db.prepare(`INSERT INTO nonces (wallet_address, nonce, issued_at) VALUES (?, ?, ?)
        ON CONFLICT(wallet_address) DO UPDATE SET nonce = excluded.nonce, issued_at = excluded.issued_at`)
        .run(wallet, nonce, Math.floor(Date.now() / 1000));
}

export function getNonce(db: Db, wallet: string): NonceRow | undefined {
    return db.prepare('SELECT * FROM nonces WHERE wallet_address = ?').get(wallet) as NonceRow | undefined;
}

export function consumeNonce(db: Db, wallet: string): void {
    db.prepare('DELETE FROM nonces WHERE wallet_address = ?').run(wallet);
}
