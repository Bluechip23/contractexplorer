// Shared building blocks for MsgExecuteContract flows against creator /
// standard pools. These were previously copy-pasted (and drifting) between
// the Creator Economy page forms and the pool action modals.

import type { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { NATIVE_DENOM } from '../defi/types';
import { compareMicro, safeBigInt } from './bigintMath';

export interface PoolAssets {
    /** CW20 creator-token contract, or null for a pure native pool. */
    tokenAddress: string | null;
    /** The pool's native denom leg (defaults to the canonical bluechip denom). */
    bluechipDenom: string;
}

// Pool denom is configurable per-pool; read it from `pair {}` rather than
// assuming NATIVE_DENOM. The Pair query returns PoolDetails, whose asset
// list field is `asset_infos`. (`pool_token_info` is the *input* field on
// factory create messages and the factory's pool_by_address response —
// kept as a defensive fallback only.)
export async function resolvePoolAssets(
    client: SigningCosmWasmClient,
    poolAddress: string,
): Promise<PoolAssets> {
    let tokenAddress: string | null = null;
    let bluechipDenom = NATIVE_DENOM;
    try {
        const pairInfo = await client.queryContractSmart(poolAddress, { pair: {} });
        const infos: Array<{
            bluechip?: { denom: string };
            creator_token?: { contract_addr: string };
        }> = pairInfo?.asset_infos ?? pairInfo?.pool_token_info ?? [];
        for (const asset of infos) {
            if (asset?.creator_token?.contract_addr) tokenAddress = asset.creator_token.contract_addr;
            if (asset?.bluechip?.denom) bluechipDenom = asset.bluechip.denom;
        }
    } catch {
        // Fall back to NATIVE_DENOM / no CW20 leg.
    }
    return { tokenAddress, bluechipDenom };
}

/**
 * Ensures `spender` may pull at least `requiredMicro` of the CW20 at
 * `tokenAddress` from `owner`, submitting an `increase_allowance` when the
 * current allowance falls short.
 */
export async function ensureCw20Allowance(
    client: SigningCosmWasmClient,
    owner: string,
    tokenAddress: string,
    spender: string,
    requiredMicro: string,
): Promise<void> {
    const allowance = await client.queryContractSmart(tokenAddress, {
        allowance: { owner, spender },
    });
    if (compareMicro(allowance.allowance, requiredMicro) < 0) {
        await client.execute(
            owner,
            tokenAddress,
            { increase_allowance: { spender, amount: requiredMicro } },
            { amount: [], gas: '200000' },
            'Approve',
            [],
        );
    }
}

/**
 * Applies a percentage slippage tolerance to a micro-amount using BigInt
 * basis-point math (no floating-point drift on large deposits). Returns the
 * minimum acceptable amount as an integer string.
 */
export function minAmountAfterSlippage(micro: string, slippagePct: string | number): string {
    const pct = typeof slippagePct === 'number' ? slippagePct : parseFloat(slippagePct || '0');
    const bps = BigInt(Math.round((Number.isFinite(pct) ? pct : 0) * 100));
    const scale = 10_000n;
    return ((safeBigInt(micro) * (scale - bps)) / scale).toString();
}
