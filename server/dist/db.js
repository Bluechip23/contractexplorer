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