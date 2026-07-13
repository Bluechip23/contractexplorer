import { ClaimRow, CommitRow, LiquidityRow, PoolRow, TradeRow } from './db';
import { decodeEventAttrs, RawEvent } from './rpc';

// Pure event -> row mapping. Attribute keys mirror the Osmosis BlueChip
// contracts exactly (verified against bluechip-osmosis-contract):
//
//   commit (creator-pool/src/commit.rs + commit/*.rs):
//     action=commit, phase, committer + per-phase amount attributes.
//     The native side is uosmo; the contract emits only *_bluechip amount
//     keys (a legacy name — the value is uosmo) plus the cumulative USD
//     total `total_raised_after`. There is NO per-commit USD attribute, so
//     amount_usd is derived downstream from the cumulative delta.
//     phase is one of:
//       funding             – pre-threshold commit
//                             (commit_amount_bluechip, total_raised_after,
//                              total_bluechip_raised_after)
//       active              – post-threshold commit routed through the AMM
//                             (commit_amount_bluechip, swap_amount_bluechip,
//                              tokens_received, spread_amount,
//                              commission_amount, reserve{0,1}_after)
//       threshold_crossing  – the commit that pushed past the threshold
//                             (total_amount_bluechip, threshold_amount_bluechip,
//                              swap_amount_bluechip, bluechip_excess_returned,
//                              reserve{0,1}_after)
//       threshold_hit_exact – hit the threshold exactly, no excess swap
//                             (commit_amount_bluechip, total_raised_after)
//   swap (pool-core/src/swap.rs):
//     action=swap, sender, receiver, offer_asset, ask_asset, offer_amount,
//     return_amount, spread_amount, commission_amount, effective_price,
//     reserve0_after, reserve1_after, pool_contract
//   liquidity (pool-core/src/liquidity/*.rs):
//     action=deposit_liquidity  (depositor, actual_amount0/1, liquidity) |
//            add_to_position     (depositor, actual_amount{0,1}_added,
//                                 additional_liquidity) |
//            remove_liquidity | remove_partial_liquidity
//                                (withdrawer, total_0/1, liquidity_removed) |
//            collect_fees        (collector, fees_0/1)
//   creator claims (creator-pool/src/liquidity_helpers.rs):
//     action=claim_creator_fees (amount_0/amount_1) |
//     claim_creator_excess (bluechip_amount/token_amount)
//   factory pool discovery (factory/src/execute/pool_lifecycle):
//     action=pool_created_successfully (pool_address, pool_id) and
//     token_created_successfully (token_address, pool_id).
//     Standard pools no longer exist — every pool is a creator commit pool.

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
    nativeDenom: string;   // canonical native denom, e.g. "uosmo"
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
            case 'pool_created_successfully': {
                if (ctx.factoryAddress && contract !== ctx.factoryAddress) break;
                const address = a['pool_address'];
                if (!address) break;
                out.pools.push({
                    address,
                    pool_id: a['pool_id'] !== undefined ? parseInt(a['pool_id'], 10) : null,
                    // Every pool is a creator commit pool now (standard pools
                    // were removed from the Osmosis contract).
                    kind: 'commit',
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
                    // funding/active/threshold_hit_exact report
                    // commit_amount_bluechip; the threshold_crossing path
                    // reports total_amount_bluechip. (uosmo amounts.)
                    amount_bluechip: a['commit_amount_bluechip'] ?? a['total_amount_bluechip'] ?? null,
                    // The contract emits no per-commit USD attribute — only
                    // the cumulative `total_raised_after`. amount_usd is left
                    // null here and derived as the cumulative delta at insert
                    // time (see db.insertCommit). commit_amount_usd is read
                    // defensively in case a future contract emits it.
                    amount_usd: a['commit_amount_usd'] ?? null,
                    usd_raised_after: a['total_raised_after'] ?? null,
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
                //   deposit_liquidity : actual_amount0/1, liquidity
                //   add_to_position   : actual_amount0/1_added, additional_liquidity
                //   remove(_partial)  : total_0/1, liquidity_removed
                //   collect_fees      : fees_0/1 (no liquidity delta)
                const amount0 = a['actual_amount0'] ?? a['actual_amount0_added'] ?? a['total_0'] ?? a['fees_0'] ?? null;
                const amount1 = a['actual_amount1'] ?? a['actual_amount1_added'] ?? a['total_1'] ?? a['fees_1'] ?? null;
                const liquidity = a['liquidity'] ?? a['additional_liquidity'] ?? a['liquidity_removed'] ?? null;
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
