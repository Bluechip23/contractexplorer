// On-chain subscription check against the BlueChip creator-pool contract.
// A wallet "has a subscription" to a pool when the pool's
// `committing_info { wallet }` smart query returns non-null.

import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';

export interface CommittingInfo {
    total_paid_usd: string;     // micro-USD string
    last_committed: string;     // nanosecond timestamp string
    [key: string]: unknown;
}

let clientPromise: Promise<CosmWasmClient> | null = null;

function getClient(rpcUrl: string): Promise<CosmWasmClient> {
    if (!clientPromise) {
        clientPromise = CosmWasmClient.connect(rpcUrl).catch((err) => {
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
export async function queryCommittingInfo(
    rpcUrl: string,
    poolAddress: string,
    wallet: string,
): Promise<CommittingInfo | null> {
    const client = await getClient(rpcUrl);
    const info = await client.queryContractSmart(poolAddress, {
        committing_info: { wallet },
    });
    return (info ?? null) as CommittingInfo | null;
}

/**
 * Returns the pool's creator wallet (from the `fee_info {}` smart query), or
 * null when the response carries no creator. Throws when the RPC / contract
 * query itself fails so the caller can distinguish "not the owner" from
 * "could not check" (502).
 */
export async function queryPoolCreator(
    rpcUrl: string,
    poolAddress: string,
): Promise<string | null> {
    const client = await getClient(rpcUrl);
    const res = await client.queryContractSmart(poolAddress, { fee_info: {} }) as
        { fee_info?: { creator_wallet_address?: string } } | null;
    return res?.fee_info?.creator_wallet_address ?? null;
}

/**
 * True when `wallet` is the on-chain creator of `poolAddress`. Throws on RPC
 * failure (so the API layer can answer 502 rather than silently reject a
 * legitimate owner).
 */
export async function assertPoolOwned(
    rpcUrl: string,
    poolAddress: string,
    wallet: string,
): Promise<boolean> {
    const creator = await queryPoolCreator(rpcUrl, poolAddress);
    return creator === wallet;
}
