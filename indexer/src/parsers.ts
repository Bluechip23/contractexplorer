import { ClaimRow, CommitRow, LiquidityRow, PoolRow, TradeRow } from './db';
import { decodeEventAttrs, RawEvent } from './rpc';

// Pure event -> row mapping. Attribute keys mirror the contracts exactly:
//
//   commit (creator-pool/src/commit.rs + commit/*.rs):
//     action=commit, phase, committer, pool_contract, block_height,
//     block_time, total_commit_count + per-phase amount attributes.
//     phase is one of:
//       funding             – pre-threshold commit
//       active              – post-threshold commit (routed through the AMM)
//       threshold_crossing  – the commit that pushed past the threshold
//       threshold_hit_exact – hit the threshold exactly (no excess swap)
//   swap (pool-core/src/swap.rs):
//     action=swap, sender, receiver, offer_asset, ask_asset, offer_amount,
//     return_amount, spread_amount, commission_amount, effective_price,
//     reserve0_after, reserve1_after, pool_contract, ...
//   liquidity (pool-core/src/liquidity/*.rs):
//     action=deposit_liquidity | add_to_position | remove_liquidity |
//     remove_partial_liquidity | collect_fees
//   creator claims (creator-pool/src/liquidity_helpers.rs):
//     action=claim_creator_fees (amount_0/amount_1) |
//     claim_creator_excess (bluechip_amount/token_amount)
//   factory pool discovery (factory/src/pool_creation_reply.rs):
//     action=pool_created_successfully | standard_pool_created_successfully
//     (pool_address, pool_id) and token_created_successfully
//     (token_address, pool_id)

export interface ParsedTx {
    pools: PoolRow[];
    poolTokens: { pool_id: number; token_address: string }[];
    thresholdCrossings: { pool: string; ts: number }[];
    commits: CommitRow[];
    trades: TradeRow[];
    liquidity: LiquidityRow[];
    claims: ClaimRow[];
}

export interface TxContext {
    txhash: string;
    height: number;
    ts: number;            // block time, unix seconds
    nativeDenom: string;   // canonical bluechip denom, e.g. "ubluechip"
    // When set, pool-discovery events are only accepted from this
    // contract address (the factory).
    factoryAddress: string | null;
}

const LIQUIDITY_ACTIONS = new Set([
    'deposit_liquidity',
    'add_to_position',
    'remove_liquidity',
    'remove_partial_liquidity',
    'collect_fees',
]);

function num(s: string | undefined): number | null {
    if (s === undefined) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

// Sum two micro-unit attribute strings; null when neither is present or
// either is malformed.
function sumMicro(a: string | undefined, b: string | undefined): string | null {
    if (a === undefined && b === undefined) return null;
    try {
        return (BigInt(a ?? '0') + BigInt(b ?? '0')).toString();
    } catch {
        return null;
    }
}

// bluechip-per-token price from micro amounts (decimals cancel: both
// sides are 6-decimal assets). Display-grade only.
function ratioPrice(bluechipMicro: string | undefined, tokenMicro: string | undefined): number | null {
    const b = num(bluechipMicro);
    const t = num(tokenMicro);
    if (b === null || t === null || t === 0) return null;
    return b / t;
}

export function parseTxEvents(ctx: TxContext, events: RawEvent[]): ParsedTx {
    const out: ParsedTx = {
        pools: [], poolTokens: [], thresholdCrossings: [],
        commits: [], trades: [], liquidity: [], claims: [],
    };

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type !== 'wasm') continue;
        const a = decodeEventAttrs(ev);
        const contract = a['_contract_address'];
        const action = a['action'];
        if (!action) continue;

        const base = { txhash: ctx.txhash, event_index: i, height: ctx.height, ts: ctx.ts };

        switch (action) {
            // ---- factory: pool discovery -------------------------------
            case 'pool_created_successfully':
            case 'standard_pool_created_successfully': {
                if (ctx.factoryAddress && contract !== ctx.factoryAddress) break;
                const address = a['pool_address'];
                if (!address) break;
                out.pools.push({
                    address,
                    pool_id: a['pool_id'] !== undefined ? parseInt(a['pool_id'], 10) : null,
                    kind: action === 'pool_created_successfully' ? 'commit' : 'standard',
                    created_height: ctx.height,
                    created_at: ctx.ts,
                });
                break;
            }
            case 'token_created_successfully': {
                if (ctx.factoryAddress && contract !== ctx.factoryAddress) break;
                const tokenAddress = a['token_address'];
                const poolId = a['pool_id'] !== undefined ? parseInt(a['pool_id'], 10) : NaN;
                if (tokenAddress && Number.isFinite(poolId)) {
                    out.poolTokens.push({ pool_id: poolId, token_address: tokenAddress });
                }
                break;
            }

            // ---- commits ----------------------------------------------
            case 'commit': {
                const pool = a['pool_contract'] || contract;
                const phase = a['phase'] || 'unknown';
                if (!pool || !a['committer']) break;
                out.commits.push({
                    ...base,
                    pool,
                    committer: a['committer'],
                    phase,
                    // funding/active/threshold_hit_exact report commit_amount_*;
                    // the threshold_crossing (with excess) path reports
                    // total_amount_bluechip plus a threshold/swap USD split.
                    amount_bluechip: a['commit_amount_bluechip'] ?? a['total_amount_bluechip'] ?? null,
                    amount_usd: a['commit_amount_usd'] ?? sumMicro(a['threshold_amount_usd'], a['swap_amount_usd']),
                    usd_raised_after: a['total_usd_raised_after'] ?? null,
                    bluechip_raised_after: a['total_bluechip_raised_after'] ?? null,
                    tokens_received: a['tokens_received'] ?? null,
                });
                if (phase === 'threshold_crossing' || phase === 'threshold_hit_exact') {
                    out.thresholdCrossings.push({ pool, ts: ctx.ts });
                }
                // A post-threshold ("active") commit is economically a buy
                // through the AMM — surface it in the trade feed too.
                if (phase === 'active' && a['swap_amount_bluechip'] && a['tokens_received']) {
                    out.trades.push({
                        ...base,
                        pool,
                        trader: a['committer'],
                        side: 'buy',
                        source: 'commit',
                        offer_amount: a['swap_amount_bluechip'],
                        return_amount: a['tokens_received'],
                        commission: a['commission_amount'] ?? null,
                        spread: a['spread_amount'] ?? null,
                        price: ratioPrice(a['swap_amount_bluechip'], a['tokens_received']),
                        reserve0_after: a['reserve0_after'] ?? null,
                        reserve1_after: a['reserve1_after'] ?? null,
                    });
                }
                break;
            }

            // ---- swaps -------------------------------------------------
            case 'swap': {
                const pool = a['pool_contract'] || contract;
                if (!pool) break;
                // offer_asset renders via TokenType Display: the bank denom
                // for the native side, the CW20 address for the token side.
                const side: 'buy' | 'sell' = a['offer_asset'] === ctx.nativeDenom ? 'buy' : 'sell';
                out.trades.push({
                    ...base,
                    pool,
                    trader: a['sender'] ?? null,
                    side,
                    source: 'swap',
                    offer_amount: a['offer_amount'] ?? null,
                    return_amount: a['return_amount'] ?? null,
                    commission: a['commission_amount'] ?? null,
                    spread: a['spread_amount'] ?? null,
                    price: side === 'buy'
                        ? ratioPrice(a['offer_amount'], a['return_amount'])
                        : ratioPrice(a['return_amount'], a['offer_amount']),
                    reserve0_after: a['reserve0_after'] ?? null,
                    reserve1_after: a['reserve1_after'] ?? null,
                });
                break;
            }

            // ---- creator claims ---------------------------------------
            case 'claim_creator_fees': {
                const pool = a['pool_contract'] || contract;
                if (!pool) break;
                out.claims.push({
                    ...base,
                    pool,
                    action,
                    creator: a['creator'] ?? null,
                    amount_0: a['amount_0'] ?? null,
                    amount_1: a['amount_1'] ?? null,
                });
                break;
            }
            case 'claim_creator_excess': {
                const pool = a['pool_contract'] || contract;
                if (!pool) break;
                out.claims.push({
                    ...base,
                    pool,
                    action,
                    creator: a['creator'] ?? null,
                    amount_0: a['bluechip_amount'] ?? null,
                    amount_1: a['token_amount'] ?? null,
                });
                break;
            }

            // ---- liquidity ---------------------------------------------
            default: {
                if (!LIQUIDITY_ACTIONS.has(action)) break;
                const pool = a['pool_contract'] || contract;
                if (!pool) break;
                // Per-action amount/actor keys differ; normalize the
                // common ones and keep the full map in attrs_json.
                const amount0 = a['actual_amount0'] ?? a['total_0'] ?? a['fees_0'] ?? null;
                const amount1 = a['actual_amount1'] ?? a['total_1'] ?? a['fees_1'] ?? null;
                const liquidity = a['liquidity'] ?? a['liquidity_removed'] ?? null;
                out.liquidity.push({
                    ...base,
                    pool,
                    action,
                    actor: a['depositor'] ?? a['withdrawer'] ?? a['collector'] ?? a['sender'] ?? null,
                    position_id: a['position_id'] ?? null,
                    amount_0: amount0,
                    amount_1: amount1,
                    liquidity,
                    attrs_json: JSON.stringify(a),
                });
                break;
            }
        }
    }
    return out;
}
