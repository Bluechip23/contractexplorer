import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import {
    commitSeries, creatorStatement, Db, insertClaim, insertCommit, insertTrade,
    listCommitsByWallet, listTrades, migrate, priceSeries, upsertPool,
    volumeSeries, windowStats,
} from '../db';

const POOL = 'osmo1pool';
const T0 = 1_700_002_800;   // bucket-aligned base time (472223 * 3600)

function freshDb(): Db {
    const db = new Database(':memory:');
    migrate(db);
    upsertPool(db, { address: POOL, pool_id: 1, kind: 'commit', created_height: 1, created_at: T0 });
    return db;
}

function trade(db: Db, i: number, ts: number, side: 'buy' | 'sell', price: number, bluechipMicro: string) {
    insertTrade(db, {
        txhash: `TX${i}`, event_index: 0, height: i, ts, pool: POOL,
        trader: 'osmo1trader', side, source: 'swap',
        offer_amount: side === 'buy' ? bluechipMicro : '999',
        return_amount: side === 'buy' ? '999' : bluechipMicro,
        commission: null, spread: null, price,
        reserve0_after: null, reserve1_after: null,
    });
}

test('priceSeries returns OHLC + bluechip volume per bucket', () => {
    const db = freshDb();
    // Bucket 1 (T0..T0+3600): prices 1.0 -> 3.0 -> 2.0
    trade(db, 1, T0 + 10, 'buy', 1.0, '1000000');
    trade(db, 2, T0 + 20, 'sell', 3.0, '2000000');
    trade(db, 3, T0 + 30, 'buy', 2.0, '3000000');
    // Bucket 2: single trade at 5.0
    trade(db, 4, T0 + 3700, 'buy', 5.0, '4000000');

    const rows = priceSeries(db, { pool: POOL, bucket: 3600, from: T0, to: T0 + 7200 }) as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].t, T0);
    assert.equal(rows[0].open, 1.0);
    assert.equal(rows[0].high, 3.0);
    assert.equal(rows[0].low, 1.0);
    assert.equal(rows[0].close, 2.0);
    assert.equal(rows[0].trades, 3);
    // buys contribute offer_amount, sells contribute return_amount.
    assert.equal(rows[0].volume_bluechip, 1000000 + 2000000 + 3000000);
    assert.equal(rows[1].close, 5.0);
});

test('volumeSeries splits buy and sell pressure', () => {
    const db = freshDb();
    trade(db, 1, T0 + 10, 'buy', 1.0, '1000000');
    trade(db, 2, T0 + 20, 'buy', 1.1, '2000000');
    trade(db, 3, T0 + 30, 'sell', 0.9, '500000');

    const rows = volumeSeries(db, { pool: POOL, bucket: 3600, from: T0, to: T0 + 3600 }) as any[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].buys, 2);
    assert.equal(rows[0].sells, 1);
    assert.equal(rows[0].buy_volume_bluechip, 3000000);
    assert.equal(rows[0].sell_volume_bluechip, 500000);
});

test('insertCommit derives per-commit amount_usd from the cumulative raise delta', () => {
    const db = freshDb();
    // The Osmosis contract emits only the cumulative `total_raised_after`
    // (-> usd_raised_after); amount_usd arrives null and is derived as the
    // increase over the pool's previous cumulative.
    const commit = (i: number, ts: number, cumulativeUsd: string) => insertCommit(db, {
        txhash: `D${i}`, event_index: 0, height: i, ts, pool: POOL,
        committer: 'osmo1fan', phase: 'funding',
        amount_bluechip: '1', amount_usd: null,
        usd_raised_after: cumulativeUsd, bluechip_raised_after: null, tokens_received: null,
    });
    commit(1, T0 + 5, '1000000');   // first: whole cumulative
    commit(2, T0 + 6, '3500000');   // delta 2_500_000
    commit(3, T0 + 7, '4000000');   // delta 500_000

    const rows = commitSeries(db, { pool: POOL, bucket: 3600, from: T0, to: T0 + 3600 }) as any[];
    assert.equal(rows[0].commits, 3);
    assert.equal(rows[0].usd, 1000000 + 2500000 + 500000);   // == final cumulative 4_000_000
});

test('commitSeries counts commits, USD and unique wallets per bucket', () => {
    const db = freshDb();
    const commit = (i: number, ts: number, wallet: string, usd: string) => insertCommit(db, {
        txhash: `C${i}`, event_index: 0, height: i, ts, pool: POOL,
        committer: wallet, phase: 'funding',
        amount_bluechip: '1', amount_usd: usd,
        usd_raised_after: null, bluechip_raised_after: null, tokens_received: null,
    });
    commit(1, T0 + 5, 'osmo1a', '1000000');
    commit(2, T0 + 6, 'osmo1a', '2000000');
    commit(3, T0 + 7, 'osmo1b', '3000000');

    const rows = commitSeries(db, { pool: POOL, bucket: 3600, from: T0, to: T0 + 3600 }) as any[];
    assert.equal(rows[0].commits, 3);
    assert.equal(rows[0].usd, 6000000);
    assert.equal(rows[0].unique_committers, 2);
});

test('listTrades honors side and whale-size filters', () => {
    const db = freshDb();
    trade(db, 1, T0 + 1, 'buy', 1.0, '1000000');
    trade(db, 2, T0 + 2, 'sell', 1.0, '50000000');
    trade(db, 3, T0 + 3, 'buy', 1.0, '100000000');

    const whales = listTrades(db, { pool: POOL, limit: 10, beforeTs: null, side: null, minOfferBluechip: 40000000 }) as any[];
    assert.equal(whales.length, 2);
    const sellsOnly = listTrades(db, { pool: POOL, limit: 10, beforeTs: null, side: 'sell', minOfferBluechip: null }) as any[];
    assert.equal(sellsOnly.length, 1);
    assert.equal(sellsOnly[0].txhash, 'TX2');
});

test('creatorStatement merges commit fee shares (string math) with claims chronologically', () => {
    const db = freshDb();
    insertCommit(db, {
        txhash: 'C1', event_index: 0, height: 1, ts: T0 + 10, pool: POOL,
        committer: 'osmo1fan', phase: 'funding',
        amount_bluechip: '8000000', amount_usd: '1000000',     // $1.00 commit
        usd_raised_after: null, bluechip_raised_after: null, tokens_received: null,
    });
    insertClaim(db, {
        txhash: 'CL1', event_index: 1, height: 2, ts: T0 + 20, pool: POOL,
        action: 'claim_creator_fees', creator: 'osmo1creator',
        amount_0: '850000000', amount_1: '1200000000',
    });

    const rows = creatorStatement(db, { pool: POOL, from: T0, to: T0 + 3600, feeBps: 500 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].type, 'commit_fee');
    assert.equal(rows[0].fee_share_usd, '50000');             // 5% of $1.00, micro-USD
    assert.equal(rows[1].type, 'fee_pot_claim');
    assert.equal(rows[1].amount_0, '850000000');
});

test('windowStats compares the current window to the previous one', () => {
    const db = freshDb();
    const now = T0 + 86400 * 2;
    trade(db, 1, now - 1000, 'buy', 1.0, '1000000');          // current window
    trade(db, 2, now - 86400 - 1000, 'sell', 1.0, '2000000'); // previous window
    insertCommit(db, {
        txhash: 'C1', event_index: 0, height: 3, ts: now - 500, pool: POOL,
        committer: 'osmo1fan', phase: 'funding',
        amount_bluechip: '1', amount_usd: '7000000',
        usd_raised_after: null, bluechip_raised_after: null, tokens_received: null,
    });

    const s = windowStats(db, POOL, 86400, now) as any;
    assert.equal(s.current.trades, 1);
    assert.equal(s.current.buys, 1);
    assert.equal(s.current.commit_usd, 7000000);
    assert.equal(s.previous.trades, 1);
    assert.equal(s.previous.sells, 1);
});

test('listCommitsByWallet returns cross-pool history newest first', () => {
    const db = freshDb();
    upsertPool(db, { address: 'osmo1pool2', pool_id: 2, kind: 'commit', created_height: 2, created_at: T0 });
    const commit = (i: number, ts: number, pool: string) => insertCommit(db, {
        txhash: `W${i}`, event_index: 0, height: i, ts, pool,
        committer: 'osmo1fan', phase: 'funding',
        amount_bluechip: '1000000', amount_usd: '125000',
        usd_raised_after: null, bluechip_raised_after: null, tokens_received: null,
    });
    commit(1, T0 + 10, POOL);
    commit(2, T0 + 20, 'osmo1pool2');
    insertCommit(db, {
        txhash: 'OTHER', event_index: 0, height: 3, ts: T0 + 30, pool: POOL,
        committer: 'osmo1someoneelse', phase: 'funding',
        amount_bluechip: '1', amount_usd: '1',
        usd_raised_after: null, bluechip_raised_after: null, tokens_received: null,
    });

    const rows = listCommitsByWallet(db, { wallet: 'osmo1fan', limit: 10, beforeTs: null }) as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].txhash, 'W2');           // newest first
    assert.equal(rows[0].pool, 'osmo1pool2');
    assert.equal(rows[1].txhash, 'W1');
});
