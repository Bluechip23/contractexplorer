import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    countTiers, getLinkTierIds, getLinkTiers, insertLink, insertTier,
    listTiers, migrate, openDb, setLinkTiers, upsertProfile,
} from '../db';
import { cheapestGatesByPool, qualifiesForLink } from '../gate';
import { MAX_TIERS } from '../validate';

const WALLET = 'osmo1creator';
const POOL_A = 'osmo1poolA';
const POOL_B = 'osmo1poolB';

function seededDb() {
    const db = openDb(':memory:');
    migrate(db);
    upsertProfile(db, { wallet_address: WALLET, name: 'Creator', pool_address: POOL_A, bio: null });
    return db;
}

test('MAX_TIERS is enforceable via countTiers', () => {
    const db = seededDb();
    for (let i = 0; i < MAX_TIERS; i++) {
        insertTier(db, { wallet_address: WALLET, pool_address: POOL_A, name: `T${i}`, price_usd: '1000000', position: i });
    }
    assert.equal(countTiers(db, WALLET), MAX_TIERS);
    assert.equal(countTiers(db, WALLET) >= MAX_TIERS, true, 'sixth insert would be rejected by the API cap');
    assert.equal(listTiers(db, WALLET).length, 5);
});

test('setLinkTiers replaces all and getLinkTiers joins through', () => {
    const db = seededDb();
    const bronze = insertTier(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Bronze', price_usd: '5000000', position: 0 });
    const gold = insertTier(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Gold', price_usd: '20000000', position: 1 });
    const fan = insertTier(db, { wallet_address: WALLET, pool_address: POOL_B, name: 'Fan', price_usd: '10000000', position: 2 });
    const link = insertLink(db, { wallet_address: WALLET, title: 'Secret', url: 'https://x.test', gated: 1, position: 0 });

    setLinkTiers(db, link.id, [bronze.id, gold.id, fan.id]);
    assert.deepEqual(getLinkTierIds(db, link.id).sort((a, b) => a - b), [bronze.id, gold.id, fan.id].sort((a, b) => a - b));
    assert.equal(getLinkTiers(db, link.id).length, 3);

    // Replace-all: only Fan remains.
    setLinkTiers(db, link.id, [fan.id]);
    assert.deepEqual(getLinkTierIds(db, link.id), [fan.id]);
});

test('cheapest-per-pool gate math + qualification (real numbers)', () => {
    const db = seededDb();
    const bronze = insertTier(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Bronze', price_usd: '5000000', position: 0 });   // $5
    const gold = insertTier(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Gold', price_usd: '20000000', position: 1 });      // $20
    const fan = insertTier(db, { wallet_address: WALLET, pool_address: POOL_B, name: 'Fan', price_usd: '10000000', position: 2 });        // $10
    const link = insertLink(db, { wallet_address: WALLET, title: 'Secret', url: 'https://x.test', gated: 1, position: 0 });
    setLinkTiers(db, link.id, [bronze.id, gold.id, fan.id]);

    const gates = cheapestGatesByPool(getLinkTiers(db, link.id));
    assert.equal(gates.get(POOL_A), 5000000n, 'pool A cheapest = Bronze $5');
    assert.equal(gates.get(POOL_B), 10000000n, 'pool B cheapest = Fan $10');

    // Wallet1: paid $6 on A (>= $5) → qualifies via A.
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, 6000000n], [POOL_B, null]])), true);
    // Wallet2: paid $3 on A (< $5), nothing on B → does NOT qualify (no url).
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, 3000000n], [POOL_B, null]])), false);
    // Wallet3: paid exactly $10 on B → qualifies (boundary inclusive).
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, null], [POOL_B, 10000000n]])), true);
    // Wallet4: paid $19.99 on A (< $5 cheapest? no, 19_990_000 >= 5_000_000) → qualifies via A (higher tier grants lower).
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, 19990000n], [POOL_B, null]])), true);
    // Wallet5: never committed anywhere → does NOT qualify.
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, null], [POOL_B, null]])), false);
});

test('a link with no tiers cannot be unlocked by a non-owner', () => {
    const gates = cheapestGatesByPool([]);
    assert.equal(gates.size, 0);
    assert.equal(qualifiesForLink(gates, new Map([[POOL_A, 999999999n]])), false);
});
