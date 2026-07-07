import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { factoryAddress, rpcEndpoint } from '../components/universal/IndividualPage.const';
import { fetchIndexedPools, IndexedPool } from './indexerApi';
import { safeBigInt } from './bigintMath';
import type {
    CommitStatus,
    CommitterInfo,
    CreatorEarningsResponse,
    CW20TokenInfo,
    DistributionStateResponse,
    FactoryConfig,
    FactoryNotifyStatusResponse,
    HolderDistribution,
    PoolAnalyticsResponse,
    PoolCommitResponse,
    PoolInfoResponse,
    PoolPairInfo,
    PoolSummary,
    PositionsResponse,
    ThresholdAnalytics,
    TokenHolderEntry,
    TokenType,
    WalletHolding,
} from './contractQueries';

// Real on-chain implementations of the pool data layer. Wire shapes are
// the interfaces in contractQueries.ts (kept in sync with the contracts).
// Types are imported `import type` only, so there is no runtime cycle
// with the dispatch layer.

let clientPromise: Promise<CosmWasmClient> | null = null;

export function getCosmWasmClient(): Promise<CosmWasmClient> {
    if (!clientPromise) {
        clientPromise = CosmWasmClient.connect(rpcEndpoint);
        // A failed connect should not poison every later call.
        clientPromise.catch(() => { clientPromise = null; });
    }
    return clientPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// One cheap probe decides chain-vs-demo mode for the session.
export async function chainAvailable(): Promise<boolean> {
    try {
        const client = await withTimeout(getCosmWasmClient(), 4000);
        await withTimeout(client.getHeight(), 4000);
        return true;
    } catch {
        return false;
    }
}

async function smart<T>(contract: string, msg: Record<string, unknown>): Promise<T> {
    const client = await getCosmWasmClient();
    return client.queryContractSmart(contract, msg) as Promise<T>;
}

// Local copies of the tiny CommitStatus helpers (the canonical exports
// live in contractQueries; importing them here would create a runtime
// cycle with the dispatch layer).
function isFully(status: CommitStatus | null | undefined): boolean {
    if (!status) return false;
    if (status === 'fully_committed') return true;
    return typeof status === 'object' && 'fully_committed' in status;
}

function progressOf(status: CommitStatus | null | undefined): { raised: string; target: string } | null {
    if (status && typeof status === 'object' && 'in_progress' in status) return status.in_progress;
    return null;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += limit) {
        out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let factoryConfigCache: Promise<FactoryConfig | null> | null = null;

export function chainQueryFactoryConfig(): Promise<FactoryConfig | null> {
    if (!factoryConfigCache) {
        factoryConfigCache = smart<{ factory: FactoryConfig }>(factoryAddress, { factory: {} })
            .then((r) => r.factory)
            .catch(() => { factoryConfigCache = null; return null; });
    }
    return factoryConfigCache;
}

interface PoolListEntry {
    pool_id: number;
    pool_addr: string;
    pool_token_info: [TokenType, TokenType];
    pool_kind: 'commit' | 'standard';
}

// Enumerate the registry via the factory's paginated `pools` query, with
// the indexer's /pools as fallback for factories deployed before the
// query existed.
export async function chainListPools(): Promise<PoolListEntry[]> {
    try {
        const all: PoolListEntry[] = [];
        let startAfter: number | null = null;
        for (let page = 0; page < 50; page++) {
            const res: { pools: PoolListEntry[] } = await smart(factoryAddress, {
                pools: { start_after: startAfter, limit: 100 },
            });
            all.push(...res.pools);
            if (res.pools.length < 100) break;
            startAfter = res.pools[res.pools.length - 1].pool_id;
        }
        return all;
    } catch {
        const indexed = await fetchIndexedPools();
        return (indexed ?? []).map((p) => ({
            pool_id: p.pool_id ?? 0,
            pool_addr: p.address,
            pool_token_info: [
                { bluechip: { denom: 'ubluechip' } },
                { creator_token: { contract_addr: p.token_address ?? '' } },
            ] as [TokenType, TokenType],
            pool_kind: p.kind,
        }));
    }
}

let indexedPoolsCache: Promise<Map<string, IndexedPool>> | null = null;

function indexedPoolMap(): Promise<Map<string, IndexedPool>> {
    if (!indexedPoolsCache) {
        indexedPoolsCache = fetchIndexedPools()
            .then((rows) => new Map((rows ?? []).map((r) => [r.address, r])))
            .catch(() => new Map());
    }
    return indexedPoolsCache;
}

// ---------------------------------------------------------------------------
// Pool reads
// ---------------------------------------------------------------------------

export function chainQueryPoolPair(poolAddress: string): Promise<PoolPairInfo> {
    return smart<PoolPairInfo>(poolAddress, { pair: {} });
}

export function chainQueryPoolInfo(poolAddress: string): Promise<PoolInfoResponse> {
    return smart<PoolInfoResponse>(poolAddress, { pool_info: {} });
}

export function chainQueryPoolAnalytics(poolAddress: string): Promise<PoolAnalyticsResponse> {
    return smart<PoolAnalyticsResponse>(poolAddress, { analytics: {} });
}

export function chainQueryTokenInfo(tokenAddress: string): Promise<CW20TokenInfo> {
    return smart<CW20TokenInfo>(tokenAddress, { token_info: {} });
}

export function chainQueryCreatorEarnings(poolAddress: string): Promise<CreatorEarningsResponse> {
    return smart<CreatorEarningsResponse>(poolAddress, { creator_earnings: {} });
}

export function chainQueryDistributionState(poolAddress: string): Promise<DistributionStateResponse | null> {
    return smart<DistributionStateResponse | null>(poolAddress, { distribution_state: {} });
}

export async function chainQueryPoolIsPaused(poolAddress: string): Promise<boolean> {
    const res = await smart<{ paused: boolean }>(poolAddress, { is_paused: {} });
    return !!res.paused;
}

export function chainQueryFactoryNotifyStatus(poolAddress: string): Promise<FactoryNotifyStatusResponse> {
    return smart<FactoryNotifyStatusResponse>(poolAddress, { factory_notify_status: {} });
}

// The pool clamps the `positions` page size to 30 (pool-core
// query_positions: `limit.unwrap_or(10).min(30)`), so walk pages instead
// of asking for one oversized one. Capped at 600 positions so one pool
// can't make the UI walk an unbounded range.
export async function chainQueryPositions(poolAddress: string): Promise<PositionsResponse> {
    const positions: PositionsResponse['positions'] = [];
    let startAfter: string | null = null;
    for (let page = 0; page < 20; page++) {
        const res: PositionsResponse = await smart(poolAddress, {
            positions: { start_after: startAfter, limit: 30 },
        });
        positions.push(...res.positions);
        if (res.positions.length < 30) break;
        startAfter = res.positions[res.positions.length - 1].position_id;
    }
    return { positions };
}

export async function chainQueryPoolCreator(poolAddress: string): Promise<string | null> {
    const res = await smart<{ fee_info: { creator_wallet_address: string } }>(poolAddress, { fee_info: {} });
    return res.fee_info?.creator_wallet_address ?? null;
}

// Full committer ledger, paginated. Capped at 1,000 wallets so one pool
// can't make the UI walk an unbounded range.
export async function chainQueryPoolCommits(poolAddress: string): Promise<PoolCommitResponse> {
    const committers: CommitterInfo[] = [];
    let startAfter: string | null = null;
    for (let page = 0; page < 10; page++) {
        const res: PoolCommitResponse = await smart(poolAddress, {
            pool_commits: {
                pool_contract_address: poolAddress,
                min_payment_usd: null,
                after_timestamp: null,
                start_after: startAfter,
                limit: 100,
            },
        });
        committers.push(...res.committers);
        if (res.committers.length < 100) break;
        startAfter = res.committers[res.committers.length - 1].wallet;
    }
    return { page_count: committers.length, committers };
}

// ---------------------------------------------------------------------------
// Composed reads
// ---------------------------------------------------------------------------

function creatorTokenOf(assetInfos: [TokenType, TokenType] | undefined): string | null {
    for (const a of assetInfos ?? []) {
        if ('creator_token' in a && a.creator_token) return a.creator_token.contract_addr;
    }
    return null;
}

export async function chainFetchPoolSummary(poolAddress: string): Promise<PoolSummary | null> {
    try {
        const [pair, info, analytics, factoryCfg, indexed] = await Promise.all([
            chainQueryPoolPair(poolAddress),
            chainQueryPoolInfo(poolAddress),
            chainQueryPoolAnalytics(poolAddress),
            chainQueryFactoryConfig(),
            indexedPoolMap(),
        ]);

        const creatorTokenAddress = creatorTokenOf(pair.asset_infos);
        const token = creatorTokenAddress
            ? await chainQueryTokenInfo(creatorTokenAddress).catch(() => null)
            : null;
        const commits = await chainQueryPoolCommits(poolAddress).catch(() => null);

        const thresholdReached = isFully(analytics.threshold_status);
        const progress = progressOf(analytics.threshold_status);
        const target = progress?.target
            ?? factoryCfg?.commit_threshold_limit_usd
            ?? analytics.total_usd_raised;
        const idx = indexed.get(poolAddress);

        return {
            poolAddress,
            creatorTokenAddress,
            tokenName: token?.name ?? 'Creator Token',
            tokenSymbol: token?.symbol ?? 'TOKEN',
            tokenDecimals: token?.decimals ?? 6,
            totalSupply: token?.total_supply ?? '0',
            reserve0: info.pool_state.reserve0,
            reserve1: info.pool_state.reserve1,
            totalLiquidity: info.pool_state.total_liquidity,
            totalFeesCollected0: info.fee_state.total_fees_collected_0,
            totalFeesCollected1: info.fee_state.total_fees_collected_1,
            totalPositions: info.total_positions,
            thresholdReached,
            raised: progress?.raised ?? target,
            target,
            totalCommitters: commits?.committers.length ?? 0,
            blockTimeLast: info.pool_state.block_time_last,
            createdAtBlock: idx?.created_height ?? 0,
            thresholdCrossedAtBlock: null,   // indexer records the crossing time, not height
            totalSwapCount: analytics.analytics.total_swap_count,
            totalCommitCount: analytics.analytics.total_commit_count,
            totalVolume0: analytics.analytics.total_volume_0,
            totalVolume1: analytics.analytics.total_volume_1,
            totalLpDepositCount: analytics.analytics.total_lp_deposit_count,
            totalLpWithdrawalCount: analytics.analytics.total_lp_withdrawal_count,
            lastTradeBlock: analytics.analytics.last_trade_block,
            lastTradeTimestamp: analytics.analytics.last_trade_timestamp,
            currentPrice0to1: analytics.current_price_0_to_1,
            currentPrice1to0: analytics.current_price_1_to_0,
            feeReserve0: analytics.fee_reserve_0,
            feeReserve1: analytics.fee_reserve_1,
            totalUsdRaised: analytics.total_usd_raised,
            totalBluechipRaised: analytics.total_bluechip_raised,
        };
    } catch (err) {
        console.error(`[chain] failed to load pool ${poolAddress}:`, err);
        return null;
    }
}

// Creator-pool summaries for the whole registry. Standard pools are
// excluded: they have no creator token / commit phase and would render
// nonsense in the creator-pool tables.
export async function chainFetchAllPoolSummaries(): Promise<PoolSummary[]> {
    const entries = (await chainListPools()).filter((p) => p.pool_kind === 'commit');
    const summaries = await mapLimited(entries, 4, (e) => chainFetchPoolSummary(e.pool_addr));
    return summaries.filter((s): s is PoolSummary => s !== null);
}

export async function chainFindPoolsByCreator(pools: PoolSummary[], walletAddress: string): Promise<PoolSummary[]> {
    const flags = await mapLimited(pools, 6, async (p) => {
        const creator = await chainQueryPoolCreator(p.poolAddress).catch(() => null);
        return creator === walletAddress;
    });
    return pools.filter((_, i) => flags[i]);
}

export async function chainQueryWalletHoldings(walletAddress: string, pools: PoolSummary[]): Promise<WalletHolding[]> {
    const balances = await mapLimited(pools, 6, async (pool) => {
        if (!pool.creatorTokenAddress || !pool.thresholdReached) return null;
        try {
            const res = await smart<{ balance: string }>(pool.creatorTokenAddress, {
                balance: { address: walletAddress },
            });
            if (safeBigInt(res.balance) === 0n) return null;
            return {
                tokenAddress: pool.creatorTokenAddress,
                tokenSymbol: pool.tokenSymbol,
                tokenName: pool.tokenName,
                tokenDecimals: pool.tokenDecimals,
                balance: res.balance,
                poolAddress: pool.poolAddress,
            };
        } catch {
            return null;
        }
    });
    return balances.filter((b): b is WalletHolding => b !== null);
}

// cw20-base caps all_accounts pages at 30; walk up to 300 holders and
// fetch balances in parallel batches. Plenty for the distribution
// buckets and top-5 display; counts saturate beyond the cap.
export async function chainQueryHolderDistribution(tokenAddress: string): Promise<HolderDistribution | null> {
    try {
        const accounts: string[] = [];
        let startAfter: string | null = null;
        for (let page = 0; page < 10; page++) {
            const res: { accounts: string[] } = await smart(tokenAddress, {
                all_accounts: { start_after: startAfter, limit: 30 },
            });
            accounts.push(...res.accounts);
            if (res.accounts.length < 30) break;
            startAfter = res.accounts[res.accounts.length - 1];
        }

        const holders: TokenHolderEntry[] = (await mapLimited(accounts, 15, async (address) => {
            const res = await smart<{ balance: string }>(tokenAddress, { balance: { address } });
            return { address, balance: res.balance };
        })).filter((h) => safeBigInt(h.balance) > 0n);

        const WHALE = 60_000_000_000n;   // 60,000 tokens (6 decimals)
        const SMALL = 100_000_000n;      // 100 tokens
        holders.sort((a, b) => (safeBigInt(b.balance) > safeBigInt(a.balance) ? 1 : -1));
        return {
            totalHolders: holders.length,
            whales: holders.filter((h) => safeBigInt(h.balance) >= WHALE).length,
            mid: holders.filter((h) => {
                const v = safeBigInt(h.balance);
                return v >= SMALL && v < WHALE;
            }).length,
            small: holders.filter((h) => safeBigInt(h.balance) < SMALL).length,
            topHolders: holders.slice(0, 5),
        };
    } catch (err) {
        console.error(`[chain] holder distribution failed for ${tokenAddress}:`, err);
        return null;
    }
}

export async function chainQueryThresholdAnalytics(
    poolAddress: string,
    committers: CommitterInfo[],
): Promise<ThresholdAnalytics | null> {
    const idx = (await indexedPoolMap()).get(poolAddress);

    const totalUsd = committers.reduce<bigint>((s, c) => s + safeBigInt(c.total_paid_usd), 0n);
    const avgUsd = committers.length > 0 ? totalUsd / BigInt(committers.length) : 0n;
    const WHALE_USD = 5_000_000_000n;   // $5,000
    const MID_USD = 500_000_000n;       // $500

    const crossedAt = idx?.threshold_crossed_at ?? null;
    const createdAt = idx?.created_at ?? null;

    return {
        thresholdCrossedAt: crossedAt,
        poolCreatedAt: createdAt,
        daysToThreshold: crossedAt !== null && createdAt !== null
            ? Math.max(0, Math.round((crossedAt - createdAt) / 86_400))
            : null,
        totalCommittersAtThreshold: committers.length,
        avgCommitValueUsd: avgUsd.toString(),
        totalRaisedUsd: totalUsd.toString(),
        walletBreakdown: {
            whaleCommitters: committers.filter((c) => safeBigInt(c.total_paid_usd) >= WHALE_USD).length,
            midCommitters: committers.filter((c) => {
                const v = safeBigInt(c.total_paid_usd);
                return v >= MID_USD && v < WHALE_USD;
            }).length,
            smallCommitters: committers.filter((c) => safeBigInt(c.total_paid_usd) < MID_USD).length,
        },
    };
}

// ---------------------------------------------------------------------------
// Oracle (factory-internal bluechip/USD price)
// ---------------------------------------------------------------------------

export interface BluechipPriceInfo {
    price: string;        // micro-USD per bluechip (Uint128)
    timestamp: number;    // unix seconds of the last oracle update
    is_cached: boolean;
}

export function chainQueryBluechipOraclePrice(): Promise<BluechipPriceInfo> {
    return smart<BluechipPriceInfo>(factoryAddress, {
        internal_blue_chip_oracle_query: { get_bluechip_usd_price: {} },
    });
}

// ---------------------------------------------------------------------------
// Router (multi-hop swaps)
// ---------------------------------------------------------------------------

export interface SwapOperationWire {
    pool_addr: string;
    offer_asset_info: TokenType;
    ask_asset_info: TokenType;
}

export interface SimulateMultiHopResponse {
    final_amount: string;
    // Output of every hop in order; the last entry equals final_amount.
    intermediate_amounts: string[];
    price_impact: string;   // Decimal string
}

export interface RouterConfig {
    factory_addr: string;
    bluechip_denom: string;
    admin: string;
}

export function chainQueryRouterConfig(routerAddr: string): Promise<RouterConfig> {
    return smart<RouterConfig>(routerAddr, { config: {} });
}

export function chainSimulateMultiHop(
    routerAddr: string,
    operations: SwapOperationWire[],
    offerAmount: string,
): Promise<SimulateMultiHopResponse> {
    return smart<SimulateMultiHopResponse>(routerAddr, {
        simulate_multi_hop: { operations, offer_amount: offerAmount },
    });
}

// ---------------------------------------------------------------------------
// Expand-economy reserve (threshold-crossing rewards are paid from it)
// ---------------------------------------------------------------------------

export interface ExpandEconomyReserve {
    address: string;
    denom: string;
    amount: string;   // micro
}

export async function chainQueryExpandEconomyReserve(): Promise<ExpandEconomyReserve | null> {
    const cfg = await chainQueryFactoryConfig();
    const addr = cfg?.bluechip_mint_contract_address;
    if (!addr) return null;
    const denom = cfg?.bluechip_denom || 'ubluechip';
    const bal = await smart<{ denom: string; amount: string }>(addr, {
        get_balance: { denom },
    });
    return { address: addr, denom, amount: bal.amount };
}
