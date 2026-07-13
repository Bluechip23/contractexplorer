"use strict";
// On-chain subscription check against the BlueChip creator-pool contract.
// A wallet "has a subscription" to a pool when the pool's
// `committing_info { wallet }` smart query returns non-null.
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryCommittingInfo = queryCommittingInfo;
exports.queryPoolCreator = queryPoolCreator;
exports.assertPoolOwned = assertPoolOwned;
const cosmwasm_stargate_1 = require("@cosmjs/cosmwasm-stargate");
let clientPromise = null;
function getClient(rpcUrl) {
    if (!clientPromise) {
        clientPromise = cosmwasm_stargate_1.CosmWasmClient.connect(rpcUrl).catch((err) => {
            // Do not cache a failed connection — allow the next request to retry.
            clientPromise = null;
            throw err;
        });
    }
    return clientPromise;
}
/**
 * Returns the wallet's commit record for the pool, or null when the wallet
 * has never committed. Throws when the RPC / contract query itself fails so
 * callers can distinguish "not subscribed" from "could not check".
 */
async function queryCommittingInfo(rpcUrl, poolAddress, wallet) {
    const client = await getClient(rpcUrl);
    const info = await client.queryContractSmart(poolAddress, {
        committing_info: { wallet },
    });
    return (info ?? null);
}
/**
 * Returns the pool's creator wallet (from the `fee_info {}` smart query), or
 * null when the response carries no creator. Throws when the RPC / contract
 * query itself fails so the caller can distinguish "not the owner" from
 * "could not check" (502).
 */
async function queryPoolCreator(rpcUrl, poolAddress) {
    const client = await getClient(rpcUrl);
    const res = await client.queryContractSmart(poolAddress, { fee_info: {} });
    return res?.fee_info?.creator_wallet_address ?? null;
}
/**
 * True when `wallet` is the on-chain creator of `poolAddress`. Throws on RPC
 * failure (so the API layer can answer 502 rather than silently reject a
 * legitimate owner).
 */
async function assertPoolOwned(rpcUrl, poolAddress, wallet) {
    const creator = await queryPoolCreator(rpcUrl, poolAddress);
    return creator === wallet;
}
//# sourceMappingURL=chain.js.map