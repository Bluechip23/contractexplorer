import Database from 'better-sqlite3';

// All token amounts are stored as TEXT in micro-units so u128 values
// survive verbatim. Aggregations CAST to REAL — fine for charts, not
// for accounting; the on-chain ledger stays authoritative.

export type Db = Database.Database;

export function openDb(path: string): Db {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    return db;
}

export function migrate(db: Db): void {
    db.exec(`
CREATE TABLE IF NOT EXISTS cursor (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    height INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pools (
    address TEXT PRIMARY KEY,
    pool_id INTEGER,
    kind TEXT NOT NULL,                -- always 'commit' (standard pools removed)
    created_height INTEGER NOT NULL,
    created_at INTEGER NOT NULL,       -- unix seconds (block time)
    threshold_crossed_at INTEGER       -- unix seconds, NULL pre-threshold
);
CREATE INDEX IF NOT EXISTS idx_pools_pool_id ON pools(pool_id);

-- token_created_successfully only carries pool_id, so token addresses
-- land here and are joined to pools on pool_id.
CREATE TABLE IF NOT EXISTS pool_tokens (
    pool_id INTEGER PRIMARY KEY,
    token_address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commits (
    txhash TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    pool TEXT NOT NULL,
    committer TEXT NOT NULL,
    phase TEXT NOT NULL,               -- funding | active | threshold_crossing | threshold_hit_exact
    amount_bluechip TEXT,
    amount_usd TEXT,
    usd_raised_after TEXT,
    bluechip_raised_after TEXT,
    tokens_received TEXT,
    PRIMARY KEY (txhash, event_index)
);
CREATE INDEX IF NOT EXISTS idx_commits_pool_ts ON commits(pool, ts);
CREATE INDEX IF NOT EXISTS idx_commits_wallet_ts ON commits(committer, ts);

CREATE TABLE IF NOT EXISTS trades (
    txhash TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    pool TEXT NOT NULL,
    trader TEXT,
    side TEXT NOT NULL,                -- 'buy' (bluechip -> token) | 'sell'
    source TEXT NOT NULL,              -- 'swap' | 'commit'
    offer_amount TEXT,
    return_amount TEXT,
    commission TEXT,
    spread TEXT,
    price REAL,                        -- bluechip per token (display only)
    reserve0_after TEXT,
    reserve1_after TEXT,
    PRIMARY KEY (txhash, event_index)
);
CREATE INDEX IF NOT EXISTS idx_trades_pool_ts ON trades(pool, ts);

CREATE TABLE IF NOT EXISTS liquidity_events (
    txhash TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    pool TEXT NOT NULL,
    action TEXT NOT NULL,              -- deposit_liquidity | add_to_position | remove_liquidity | remove_partial_liquidity | collect_fees
    actor TEXT,
    position_id TEXT,
    amount_0 TEXT,
    amount_1 TEXT,
    liquidity TEXT,
    attrs_json TEXT NOT NULL,          -- full attribute map, nothing lost
    PRIMARY KEY (txhash, event_index)
);
CREATE INDEX IF NOT EXISTS idx_liq_pool_ts ON liquidity_events(pool, ts);

CREATE TABLE IF NOT EXISTS creator_claims (
    txhash TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    pool TEXT NOT NULL,
    action TEXT NOT NULL,              -- claim_creator_fees | claim_creator_excess
    creator TEXT,
    amount_0 TEXT,                     -- bluechip leg
    amount_1 TEXT,                     -- creator-token leg
    PRIMARY KEY (txhash, event_index)
);
CREATE INDEX IF NOT EXISTS idx_claims_pool_ts ON creator_claims(pool, ts);
`);
}

// ---------------------------------------------------------------------------
// Row types + writers (INSERT OR REPLACE keeps re-ingestion idempotent)
// ---------------------------------------------------------------------------

export interface PoolRow {
    address: string;
    pool_id: number | null;
    kind: 'commit';
    created_height: number;
    created_at: number;
}

export interface CommitRow {
    txhash: string; event_index: number; height: number; ts: number;
    pool: string; committer: string; phase: string;
    amount_bluechip: string | null; amount_usd: string | null;
    usd_raised_after: string | null; bluechip_raised_after: string | null;
    tokens_received: string | null;
}

export interface TradeRow {
    txhash: string; event_index: number; height: number; ts: number;
    pool: string; trader: string | null; side: 'buy' | 'sell'; source: 'swap' | 'commit';
    offer_amount: string | null; return_amount: string | null;
    commission: string | null; spread: string | null; price: number | null;
    reserve0_after: string | null; reserve1_after: string | null;
}

export interface LiquidityRow {
    txhash: string; event_index: number; height: number; ts: number;
    pool: string; action: string; actor: string | null; position_id: string | null;
    amount_0: string | null; amount_1: string | null; liquidity: string | null;
    attrs_json: string;
}

export interface ClaimRow {
    txhash: string; event_index: number; height: number; ts: number;
    pool: string; action: string; creator: string | null;
    amount_0: string | null; amount_1: string | null;
}

export function getCursor(db: Db): number | null {
    const row = db.prepare('SELECT height FROM cursor WHERE id = 1').get() as { height: number } | undefined;
    return row ? row.height : null;
}

export function setCursor(db: Db, height: number): void {
    db.prepare('INSERT INTO cursor (id, height) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET height = excluded.height').run(height);
}

export function upsertPool(db: Db, p: PoolRow): void {
    db.prepare(`INSERT INTO pools (address, pool_id, kind, created_height, created_at)
        VALUES (@address, @pool_id, @kind, @created_height, @created_at)
        ON CONFLICT(address) DO UPDATE SET pool_id = excluded.pool_id, kind = excluded.kind`).run(p);
}

export function setPoolToken(db: Db, poolId: number, tokenAddress: string): void {
    db.prepare(`INSERT INTO pool_tokens (pool_id, token_address) VALUES (?, ?)
        ON CONFLICT(pool_id) DO UPDATE SET token_address = excluded.token_address`).run(poolId, tokenAddress);
}

export function markThresholdCrossed(db: Db, pool: string, ts: number): void {
    db.prepare('UPDATE pools SET threshold_crossed_at = COALESCE(threshold_crossed_at, ?) WHERE address = ?').run(ts, pool);
}

export function insertCommit(db: Db, r: CommitRow): void {
    // The Osmosis contract emits only the cumulative USD raised
    // (`total_raised_after` -> usd_raised_after), not a per-commit USD
    // amount. Derive amount_usd as the increase over the pool's previous
    // cumulative so the USD commit-series and creator statements keep
    // working. Cumulative raise is monotonic during the funding phase, so
    // the delta against the immediately preceding commit is exact. This is
    // deterministic on re-ingest because backfill inserts commits in
    // (height, event_index) order and each height commits atomically.
    let amountUsd = r.amount_usd;
    if (amountUsd === null && r.usd_raised_after !== null) {
        const prev = db.prepare(
            `SELECT usd_raised_after FROM commits
             WHERE pool = ? AND usd_raised_after IS NOT NULL
               AND (height < ? OR (height = ? AND event_index < ?))
             ORDER BY height DESC, event_index DESC LIMIT 1`
        ).get(r.pool, r.height, r.height, r.event_index) as { usd_raised_after: string } | undefined;
        try {
            const prevCum = prev ? BigInt(prev.usd_raised_after) : 0n;
            const delta = BigInt(r.usd_raised_after) - prevCum;
            amountUsd = (delta > 0n ? delta : 0n).toString();
        } catch {
            amountUsd = null;
        }
    }
    db.prepare(`INSERT OR REPLACE INTO commits
        (txhash, event_index, height, ts, pool, committer, phase, amount_bluechip, amount_usd, usd_raised_after, bluechip_raised_after, tokens_received)
        VALUES (@txhash, @event_index, @height, @ts, @pool, @committer, @phase, @amount_bluechip, @amount_usd, @usd_raised_after, @bluechip_raised_after, @tokens_received)`)
        .run({ ...r, amount_usd: amountUsd });
}

export function insertTrade(db: Db, r: TradeRow): void {
    db.prepare(`INSERT OR REPLACE INTO trades
        (txhash, event_index, height, ts, pool, trader, side, source, offer_amount, return_amount, commission, spread, price, reserve0_after, reserve1_after)
        VALUES (@txhash, @event_index, @height, @ts, @pool, @trader, @side, @source, @offer_amount, @return_amount, @commission, @spread, @price, @reserve0_after, @reserve1_after)`).run(r);
}

export function insertLiquidity(db: Db, r: LiquidityRow): void {
    db.prepare(`INSERT OR REPLACE INTO liquidity_events
        (txhash, event_index, height, ts, pool, action, actor, position_id, amount_0, amount_1, liquidity, attrs_json)
        VALUES (@txhash, @event_index, @height, @ts, @pool, @action, @actor, @position_id, @amount_0, @amount_1, @liquidity, @attrs_json)`).run(r);
}

export function insertClaim(db: Db, r: ClaimRow): void {
    db.prepare(`INSERT OR REPLACE INTO creator_claims
        (txhash, event_index, height, ts, pool, action, creator, amount_0, amount_1)
        VALUES (@txhash, @event_index, @height, @ts, @pool, @action, @creator, @amount_0, @amount_1)`).run(r);
}

// ---------------------------------------------------------------------------
// Query helpers (the REST layer is a thin wrapper over these so they can
// be unit-tested against an in-memory database)
// ---------------------------------------------------------------------------

export function healthCounts(db: Db) {
    const count = (table: string) =>
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    return {
        lastIndexedHeight: getCursor(db),
        pools: count('pools'),
        commits: count('commits'),
        trades: count('trades'),
        liquidityEvents: count('liquidity_events'),
        creatorClaims: count('creator_claims'),
    };
}

export function listPools(db: Db) {
    return db.prepare(`
        SELECT p.address, p.pool_id, p.kind, p.created_height, p.created_at,
               p.threshold_crossed_at, t.token_address
        FROM pools p LEFT JOIN pool_tokens t ON t.pool_id = p.pool_id
        ORDER BY p.created_height ASC`).all();
}

export interface SeriesParams {
    pool: string;
    bucket: number;   // seconds
    from: number;     // unix seconds inclusive
    to: number;       // unix seconds exclusive
}

// better-sqlite3 binds JS numbers as REAL; `ts / @bucket` must be
// INTEGER division for the bucketing to collapse, so bind the bucket
// as a BigInt (better-sqlite3 binds BigInt as INTEGER).
function seriesBind(p: SeriesParams) {
    return { pool: p.pool, bucket: BigInt(Math.floor(p.bucket)), from: p.from, to: p.to };
}

// OHLC + volume per bucket, derived from trades with a known price.
export function priceSeries(db: Db, p: SeriesParams) {
    return db.prepare(`
        SELECT
            (ts / @bucket) * @bucket AS t,
            (SELECT t2.price FROM trades t2
              WHERE t2.pool = @pool AND t2.price IS NOT NULL
                AND (t2.ts / @bucket) * @bucket = (trades.ts / @bucket) * @bucket
              ORDER BY t2.ts ASC, t2.height ASC, t2.event_index ASC LIMIT 1) AS open,
            MAX(price) AS high,
            MIN(price) AS low,
            (SELECT t2.price FROM trades t2
              WHERE t2.pool = @pool AND t2.price IS NOT NULL
                AND (t2.ts / @bucket) * @bucket = (trades.ts / @bucket) * @bucket
              ORDER BY t2.ts DESC, t2.height DESC, t2.event_index DESC LIMIT 1) AS close,
            SUM(CASE side WHEN 'buy' THEN CAST(offer_amount AS REAL) ELSE CAST(return_amount AS REAL) END) AS volume_bluechip,
            COUNT(*) AS trades
        FROM trades
        WHERE pool = @pool AND price IS NOT NULL AND ts >= @from AND ts < @to
        GROUP BY t
        ORDER BY t ASC`).all(seriesBind(p));
}

// Buy/sell pressure per bucket.
export function volumeSeries(db: Db, p: SeriesParams) {
    return db.prepare(`
        SELECT
            (ts / @bucket) * @bucket AS t,
            SUM(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) AS buys,
            SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) AS sells,
            SUM(CASE WHEN side = 'buy' THEN CAST(offer_amount AS REAL) ELSE 0 END) AS buy_volume_bluechip,
            SUM(CASE WHEN side = 'sell' THEN CAST(return_amount AS REAL) ELSE 0 END) AS sell_volume_bluechip
        FROM trades
        WHERE pool = @pool AND ts >= @from AND ts < @to
        GROUP BY t
        ORDER BY t ASC`).all(seriesBind(p));
}

// Commit activity per bucket (count, USD, unique wallets).
export function commitSeries(db: Db, p: SeriesParams) {
    return db.prepare(`
        SELECT
            (ts / @bucket) * @bucket AS t,
            COUNT(*) AS commits,
            SUM(CAST(amount_usd AS REAL)) AS usd,
            COUNT(DISTINCT committer) AS unique_committers
        FROM commits
        WHERE pool = @pool AND ts >= @from AND ts < @to
        GROUP BY t
        ORDER BY t ASC`).all(seriesBind(p));
}

export function listTrades(db: Db, opts: {
    pool: string; limit: number; beforeTs: number | null;
    side: 'buy' | 'sell' | null; minOfferBluechip: number | null;
}) {
    return db.prepare(`
        SELECT txhash, height, ts, trader, side, source, offer_amount, return_amount, commission, spread, price
        FROM trades
        WHERE pool = @pool
          AND (@beforeTs IS NULL OR ts < @beforeTs)
          AND (@side IS NULL OR side = @side)
          AND (@minOfferBluechip IS NULL OR
               CAST(CASE side WHEN 'buy' THEN offer_amount ELSE return_amount END AS REAL) >= @minOfferBluechip)
        ORDER BY ts DESC, height DESC, event_index DESC
        LIMIT @limit`).all(opts);
}

export function listCommits(db: Db, opts: {
    pool: string; limit: number; beforeTs: number | null; wallet: string | null;
}) {
    return db.prepare(`
        SELECT txhash, height, ts, committer, phase, amount_bluechip, amount_usd,
               usd_raised_after, bluechip_raised_after, tokens_received
        FROM commits
        WHERE pool = @pool
          AND (@beforeTs IS NULL OR ts < @beforeTs)
          AND (@wallet IS NULL OR committer = @wallet)
        ORDER BY ts DESC, height DESC, event_index DESC
        LIMIT @limit`).all(opts);
}

// Per-transaction creator income statement: the creator's commit-fee
// share of every commit (estimated at fee_bps, default 5%) plus claim
// events, in chronological order.
export function creatorStatement(db: Db, opts: {
    pool: string; from: number; to: number; feeBps: number;
}) {
    const commits = db.prepare(`
        SELECT txhash, ts, committer, phase, amount_usd, amount_bluechip
        FROM commits
        WHERE pool = @pool AND ts >= @from AND ts < @to
        ORDER BY ts ASC, height ASC, event_index ASC`).all(opts) as {
        txhash: string; ts: number; committer: string; phase: string;
        amount_usd: string | null; amount_bluechip: string | null;
    }[];
    const claims = db.prepare(`
        SELECT txhash, ts, action, creator, amount_0, amount_1
        FROM creator_claims
        WHERE pool = @pool AND ts >= @from AND ts < @to
        ORDER BY ts ASC, height ASC, event_index ASC`).all(opts) as {
        txhash: string; ts: number; action: string; creator: string | null;
        amount_0: string | null; amount_1: string | null;
    }[];

    const rows = [
        ...commits.map((c) => ({
            ts: c.ts,
            type: 'commit_fee' as const,
            txhash: c.txhash,
            counterparty: c.committer,
            phase: c.phase,
            gross_usd: c.amount_usd,
            // String math on micro-units: amount * feeBps / 10000.
            fee_share_usd: c.amount_usd !== null
                ? ((BigInt(c.amount_usd) * BigInt(opts.feeBps)) / 10_000n).toString()
                : null,
            gross_bluechip: c.amount_bluechip,
            amount_0: null as string | null,
            amount_1: null as string | null,
        })),
        ...claims.map((c) => ({
            ts: c.ts,
            type: c.action === 'claim_creator_fees' ? ('fee_pot_claim' as const) : ('excess_claim' as const),
            txhash: c.txhash,
            counterparty: c.creator,
            phase: null as string | null,
            gross_usd: null as string | null,
            fee_share_usd: null as string | null,
            gross_bluechip: null as string | null,
            amount_0: c.amount_0,
            amount_1: c.amount_1,
        })),
    ];
    rows.sort((a, b) => a.ts - b.ts);
    return rows;
}

// Rolling-window stats with previous-window comparison.
export function windowStats(db: Db, pool: string, windowSec: number, now: number) {
    const one = (from: number, to: number) => {
        const t = db.prepare(`
            SELECT COUNT(*) AS trades,
                   SUM(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) AS buys,
                   SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) AS sells,
                   SUM(CAST(CASE side WHEN 'buy' THEN offer_amount ELSE return_amount END AS REAL)) AS volume_bluechip
            FROM trades WHERE pool = ? AND ts >= ? AND ts < ?`).get(pool, from, to) as Record<string, number | null>;
        const c = db.prepare(`
            SELECT COUNT(*) AS commits,
                   SUM(CAST(amount_usd AS REAL)) AS commit_usd,
                   COUNT(DISTINCT committer) AS unique_committers
            FROM commits WHERE pool = ? AND ts >= ? AND ts < ?`).get(pool, from, to) as Record<string, number | null>;
        return { ...t, ...c };
    };
    return {
        window_seconds: windowSec,
        current: one(now - windowSec, now),
        previous: one(now - 2 * windowSec, now - windowSec),
    };
}

// Cross-pool commit history for one wallet (newest first) — powers the
// explorer's wallet-page commit history.
export function listCommitsByWallet(db: Db, opts: {
    wallet: string; limit: number; beforeTs: number | null;
}) {
    return db.prepare(`
        SELECT txhash, height, ts, pool, phase, amount_bluechip, amount_usd, tokens_received
        FROM commits
        WHERE committer = @wallet
          AND (@beforeTs IS NULL OR ts < @beforeTs)
        ORDER BY ts DESC, height DESC, event_index DESC
        LIMIT @limit`).all(opts);
}
