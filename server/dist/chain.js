"use strict";
// On-chain subscription check against the BlueChip creator-pool contract.
// A wallet "has a subscription" to a pool when the pool's
// `committing_info { wallet }` smart query returns non-null.
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryCommittingInfo = queryCommittingInfo;
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
//# sourceMappingURL=chain.js.map