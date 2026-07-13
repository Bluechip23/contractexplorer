"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const db_1 = require("../db");
const gate_1 = require("../gate");
const validate_1 = require("../validate");
const WALLET = 'osmo1creator';
const POOL_A = 'osmo1poolA';
const POOL_B = 'osmo1poolB';
function seededDb() {
    const db = (0, db_1.openDb)(':memory:');
    (0, db_1.migrate)(db);
    (0, db_1.upsertProfile)(db, { wallet_address: WALLET, name: 'Creator', pool_address: POOL_A, bio: null });
    return db;
}
(0, node_test_1.test)('MAX_TIERS is enforceable via countTiers', () => {
    const db = seededDb();
    for (let i = 0; i < validate_1.MAX_TIERS; i++) {
        (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_A, name: `T${i}`, price_usd: '1000000', position: i });
    }
    strict_1.default.equal((0, db_1.countTiers)(db, WALLET), validate_1.MAX_TIERS);
    strict_1.default.equal((0, db_1.countTiers)(db, WALLET) >= validate_1.MAX_TIERS, true, 'sixth insert would be rejected by the API cap');
    strict_1.default.equal((0, db_1.listTiers)(db, WALLET).length, 5);
});
(0, node_test_1.test)('setLinkTiers replaces all and getLinkTiers joins through', () => {
    const db = seededDb();
    const bronze = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Bronze', price_usd: '5000000', position: 0 });
    const gold = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Gold', price_usd: '20000000', position: 1 });
    const fan = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_B, name: 'Fan', price_usd: '10000000', position: 2 });
    const link = (0, db_1.insertLink)(db, { wallet_address: WALLET, title: 'Secret', url: 'https://x.test', gated: 1, position: 0 });
    (0, db_1.setLinkTiers)(db, link.id, [bronze.id, gold.id, fan.id]);
    strict_1.default.deepEqual((0, db_1.getLinkTierIds)(db, link.id).sort((a, b) => a - b), [bronze.id, gold.id, fan.id].sort((a, b) => a - b));
    strict_1.default.equal((0, db_1.getLinkTiers)(db, link.id).length, 3);
    // Replace-all: only Fan remains.
    (0, db_1.setLinkTiers)(db, link.id, [fan.id]);
    strict_1.default.deepEqual((0, db_1.getLinkTierIds)(db, link.id), [fan.id]);
});
(0, node_test_1.test)('cheapest-per-pool gate math + qualification (real numbers)', () => {
    const db = seededDb();
    const bronze = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Bronze', price_usd: '5000000', position: 0 }); // $5
    const gold = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_A, name: 'Gold', price_usd: '20000000', position: 1 }); // $20
    const fan = (0, db_1.insertTier)(db, { wallet_address: WALLET, pool_address: POOL_B, name: 'Fan', price_usd: '10000000', position: 2 }); // $10
    const link = (0, db_1.insertLink)(db, { wallet_address: WALLET, title: 'Secret', url: 'https://x.test', gated: 1, position: 0 });
    (0, db_1.setLinkTiers)(db, link.id, [bronze.id, gold.id, fan.id]);
    const gates = (0, gate_1.cheapestGatesByPool)((0, db_1.getLinkTiers)(db, link.id));
    strict_1.default.equal(gates.get(POOL_A), 5000000n, 'pool A cheapest = Bronze $5');
    strict_1.default.equal(gates.get(POOL_B), 10000000n, 'pool B cheapest = Fan $10');
    // Wallet1: paid $6 on A (>= $5) → qualifies via A.
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, 6000000n], [POOL_B, null]])), true);
    // Wallet2: paid $3 on A (< $5), nothing on B → does NOT qualify (no url).
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, 3000000n], [POOL_B, null]])), false);
    // Wallet3: paid exactly $10 on B → qualifies (boundary inclusive).
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, null], [POOL_B, 10000000n]])), true);
    // Wallet4: paid $19.99 on A (< $5 cheapest? no, 19_990_000 >= 5_000_000) → qualifies via A (higher tier grants lower).
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, 19990000n], [POOL_B, null]])), true);
    // Wallet5: never committed anywhere → does NOT qualify.
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, null], [POOL_B, null]])), false);
});
(0, node_test_1.test)('a link with no tiers cannot be unlocked by a non-owner', () => {
    const gates = (0, gate_1.cheapestGatesByPool)([]);
    strict_1.default.equal(gates.size, 0);
    strict_1.default.equal((0, gate_1.qualifiesForLink)(gates, new Map([[POOL_A, 999999999n]])), false);
});
//# sourceMappingURL=tiers.test.js.map