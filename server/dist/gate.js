"use strict";
// Pure subscription-gate math, kept separate from api.ts so it can be unit
// tested without HTTP / signing. All money is micro-USD integer strings
// (6 decimals) compared as BigInt — never floats.
Object.defineProperty(exports, "__esModule", { value: true });
exports.cheapestGatesByPool = cheapestGatesByPool;
exports.qualifiesForLink = qualifiesForLink;
/**
 * Group a link's gating tiers by pool and return each pool's CHEAPEST gate
 * price. A viewer who has paid ≥ the cheapest price for a pool satisfies that
 * pool's gate — so buying a higher tier automatically grants the lower ones.
 */
function cheapestGatesByPool(tiers) {
    const gates = new Map();
    for (const t of tiers) {
        let price;
        try {
            price = BigInt(t.price_usd);
        }
        catch {
            continue; // ignore malformed prices defensively
        }
        const current = gates.get(t.pool_address);
        if (current === undefined || price < current)
            gates.set(t.pool_address, price);
    }
    return gates;
}
/**
 * A link qualifies (unlocks) when, for ANY associated pool, the caller's
 * committed micro-USD on that pool is ≥ that pool's cheapest gate. Cross-pool
 * is OR: satisfying any one pool unlocks the link.
 *
 * `paidByPool` maps a pool address to the caller's total_paid_usd (micro-USD
 * BigInt), or null when the caller has never committed to that pool.
 */
function qualifiesForLink(gates, paidByPool) {
    if (gates.size === 0)
        return false; // gated but no tiers → nobody but owner
    for (const [pool, price] of gates) {
        const paid = paidByPool.get(pool);
        if (paid !== undefined && paid !== null && paid >= price)
            return true;
    }
    return false;
}
//# sourceMappingURL=gate.js.map