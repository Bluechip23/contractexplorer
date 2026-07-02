import { safeBigInt } from './bigintMath';
import { sanitizeOnChainString } from './security';
import * as chain from './chainQueries';

const MOCK_WALLET = 'bluechip1q2w3e4r5t6y7u8i9o0pzxcvbnmasdfghjkl42';


export interface PoolStateResponseForFactory {
    pool_contract_address: string;
    nft_ownership_accepted: boolean;
    reserve0: string;
    reserve1: string;
    total_liquidity: string;
    block_time_last: number;
    price0_cumulative_last: string;
    price1_cumulative_last: string;
    assets: string[];
}

export interface AllPoolsResponse {
    pools: [string, PoolStateResponseForFactory][];
}

export interface TokenType {
    creator_token?: { contract_addr: string };
    bluechip?: { denom: string };
}

export interface PoolPairInfo {
    asset_infos: [TokenType, TokenType];
    contract_addr: string;
    pool_type: { xyk: Record<string, never> } | { stable: Record<string, never> };
}

export interface PoolStateResponse {
    nft_ownership_accepted: boolean;
    reserve0: string;
    reserve1: string;
    total_liquidity: string;
    block_time_last: number;
}

export interface PoolFeeStateResponse {
    fee_growth_global_0: string;
    fee_growth_global_1: string;
    total_fees_collected_0: string;
    total_fees_collected_1: string;
}

export interface PoolInfoResponse {
    pool_state: PoolStateResponse;
    fee_state: PoolFeeStateResponse;
    total_positions: number;
}

// Wire format of the pool's `is_fully_commited {}` query (and the
// `threshold_status` field on Analytics). serde serializes the
// `FullyCommitted` unit variant as the bare string "fully_committed";
// the in-progress variant arrives as a tagged object. The object form
// of fully_committed is kept as a defensive member because some older
// serializers emitted unit variants that way.
export type CommitStatus =
    | 'fully_committed'
    | { in_progress: { raised: string; target: string } }
    | { fully_committed: Record<string, never> };

export function isFullyCommitted(status: CommitStatus | null | undefined): boolean {
    if (!status) return false;
    if (status === 'fully_committed') return true;
    return typeof status === 'object' && 'fully_committed' in status;
}

export function commitProgress(status: CommitStatus | null | undefined): { raised: string; target: string } | null {
    if (status && typeof status === 'object' && 'in_progress' in status) return status.in_progress;
    return null;
}

export interface CommitterInfo {
    wallet: string;
    last_payment_bluechip: string;
    last_payment_usd: string;
    last_committed: string;
    total_paid_usd: string;
    total_paid_bluechip: string;
}

export interface PoolCommitResponse {
    // Number of `committers` entries in THIS page after filtering —
    // NOT a pre-filter total. Mirrors the contract's PoolCommitResponse;
    // paginating callers should treat `committers.length < limit` as the
    // end-of-data signal.
    page_count: number;
    committers: CommitterInfo[];
}

export interface CW20TokenInfo {
    name: string;
    symbol: string;
    decimals: number;
    total_supply: string;
}

// Mirrors the factory's FactoryInstantiate struct (returned by the
// `factory {}` query wrapped as `{ factory: {...} }`).
export interface FactoryConfig {
    factory_admin_address: string;
    commit_threshold_limit_usd: string;
    pyth_contract_addr_for_conversions: string;
    pyth_atom_usd_price_feed_id: string;
    cw20_token_contract_id: number;
    cw721_nft_contract_id: number;
    create_pool_wasm_contract_id: number;
    standard_pool_wasm_contract_id: number;
    bluechip_wallet_address: string;
    commit_fee_bluechip: string;
    commit_fee_creator: string;
    max_bluechip_lock_per_pool: string;
    creator_excess_liquidity_lock_days: number;
    atom_bluechip_anchor_pool_address: string;
    bluechip_mint_contract_address: string | null;
    bluechip_denom: string;
    atom_denom: string;
    [key: string]: unknown;
}

export interface FactoryInstantiateResponse {
    factory: FactoryConfig;
}

// ---- Creator earnings (creator-pool `creator_earnings {}` query) ----

export interface CreatorFeePotWire {
    amount_0: string;   // claimable bluechip (micro)
    amount_1: string;   // claimable creator token (micro)
}

export interface CreatorExcessEarnings {
    bluechip_amount: string;
    token_amount: string;
    unlock_time: string;        // Timestamp — nanoseconds, as string
    claimable_now: boolean;     // block time >= unlock_time
}

export interface CreatorEarningsResponse {
    creator_wallet_address: string;
    // Claimable clip-slice fee pot, emptied by `claim_creator_fees`.
    fee_pot: CreatorFeePotWire;
    // Locked excess-liquidity claim; null when none exists or already claimed.
    excess: CreatorExcessEarnings | null;
    is_threshold_hit: boolean;
    threshold_crossed_at: string | null;   // nanoseconds string, null pre-threshold
}

// ---- Pool ops-health queries (`distribution_state`, `is_paused`,
//      `factory_notify_status`) — mirrored from the creator-pool msg types ----

export interface DistributionStateResponse {
    is_distributing: boolean;
    distributions_remaining: number;
    last_processed_key: string | null;
    started_at: string;          // nanoseconds string
    last_updated: string;        // nanoseconds string
    seconds_since_update: number;
    is_stalled: boolean;
    consecutive_failures: number;
    total_to_distribute: string;
    total_committed_usd: string;
    distributed_so_far: string;
}

export interface FactoryNotifyStatusResponse {
    pending: boolean;
}

export interface PositionResponse {
    position_id: string;
    liquidity: string;
    owner: string;
    fee_growth_inside_0_last: string;
    fee_growth_inside_1_last: string;
    created_at: number;
    last_fee_collection: number;
    unclaimed_fees_0: string;
    unclaimed_fees_1: string;
}

export interface PositionsResponse {
    positions: PositionResponse[];
}

export interface PoolCreatorConfig {
    creator_wallet_address: string;
    bluechip_wallet_address?: string;
    commit_fee_bluechip?: string;
    commit_fee_creator?: string;
}

export interface TokenHolderEntry {
    address: string;
    balance: string;
}

export interface HolderDistribution {
    totalHolders: number;
    whales: number;      // 60,000+ tokens
    mid: number;         // 100 < balance < 60,000
    small: number;       // < 100 tokens
    topHolders: TokenHolderEntry[];
}

export interface ThresholdAnalytics {
    thresholdCrossedAt: number | null;   // unix timestamp (seconds) when threshold was hit
    poolCreatedAt: number | null;        // unix timestamp (seconds) when pool was created
    daysToThreshold: number | null;      // days from creation to threshold crossing
    totalCommittersAtThreshold: number;
    avgCommitValueUsd: string;           // micro USD average per committer
    totalRaisedUsd: string;
    walletBreakdown: {
        whaleCommitters: number;         // $5,000+ USD committed
        midCommitters: number;           // $500 – $5,000
        smallCommitters: number;         // < $500
    };
}

export interface PoolAnalytics {
    total_swap_count: number;
    total_commit_count: number;
    total_volume_0: string;
    total_volume_1: string;
    total_lp_deposit_count: number;
    total_lp_withdrawal_count: number;
    last_trade_block: number;
    last_trade_timestamp: number;
}

export interface PoolAnalyticsResponse {
    analytics: PoolAnalytics;
    current_price_0_to_1: string;
    current_price_1_to_0: string;
    total_value_locked_0: string;
    total_value_locked_1: string;
    fee_reserve_0: string;
    fee_reserve_1: string;
    threshold_status: CommitStatus;
    total_usd_raised: string;
    total_bluechip_raised: string;
    total_positions: number;
}

export interface PoolSummary {
    poolAddress: string;
    creatorTokenAddress: string | null;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimals: number;
    totalSupply: string;
    reserve0: string;
    reserve1: string;
    totalLiquidity: string;
    totalFeesCollected0: string;
    totalFeesCollected1: string;
    totalPositions: number;
    thresholdReached: boolean;
    raised: string;
    target: string;
    totalCommitters: number;
    blockTimeLast: number;
    createdAtBlock: number;
    thresholdCrossedAtBlock: number | null;
    // New fields from Analytics query
    totalSwapCount: number;
    totalCommitCount: number;
    totalVolume0: string;
    totalVolume1: string;
    totalLpDepositCount: number;
    totalLpWithdrawalCount: number;
    lastTradeBlock: number;
    lastTradeTimestamp: number;
    currentPrice0to1: string;
    currentPrice1to0: string;
    feeReserve0: string;
    feeReserve1: string;
    totalUsdRaised: string;
    totalBluechipRaised: string;
}


const now = Date.now();
const day = 86400000;

const MOCK_COMMITTERS: CommitterInfo[] = [
    {
        wallet: MOCK_WALLET,
        total_paid_usd: '5200000000',
        total_paid_bluechip: '41600000000',
        last_payment_usd: '1200000000',
        last_payment_bluechip: '9600000000',
        last_committed: ((now - 2 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1whale8k3jx9f7tn2m4qp6rz0sdvwcyahg5e72n',
        total_paid_usd: '8400000000',
        total_paid_bluechip: '67200000000',
        last_payment_usd: '3000000000',
        last_payment_bluechip: '24000000000',
        last_committed: ((now - 1 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1early4m2n7xp8wk5dv3qt6rj0yfscalh9zu8e3',
        total_paid_usd: '3100000000',
        total_paid_bluechip: '24800000000',
        last_payment_usd: '800000000',
        last_payment_bluechip: '6400000000',
        last_committed: ((now - 18 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1degen9p4r6t2n7xm3k5wqv8jf0ychlsab2ue6',
        total_paid_usd: '2750000000',
        total_paid_bluechip: '22000000000',
        last_payment_usd: '2750000000',
        last_payment_bluechip: '22000000000',
        last_committed: ((now - 45 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1saver2k8f5n3m7wp4xr6qt9jv0ydclhgab1u3e',
        total_paid_usd: '1500000000',
        total_paid_bluechip: '12000000000',
        last_payment_usd: '500000000',
        last_payment_bluechip: '4000000000',
        last_committed: ((now - 60 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1hodl6n3m8k2f5wp4xr7qt0jv9ydclhsab3ue2',
        total_paid_usd: '950000000',
        total_paid_bluechip: '7600000000',
        last_payment_usd: '950000000',
        last_payment_bluechip: '7600000000',
        last_committed: ((now - 75 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1moon5r7t2n8xm3k4wqp6jf9v0ychlsab2dge1',
        total_paid_usd: '680000000',
        total_paid_bluechip: '5440000000',
        last_payment_usd: '680000000',
        last_payment_bluechip: '5440000000',
        last_committed: ((now - 150 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1tiny3m7k2f8n5wp4xr6qt0jv9ydclhsab1ue4',
        total_paid_usd: '250000000',
        total_paid_bluechip: '2000000000',
        last_payment_usd: '250000000',
        last_payment_bluechip: '2000000000',
        last_committed: ((now - 300 * day) * 1000000).toString(),
    },
];

const MOCK_POOLS: PoolSummary[] = [
    {
        poolAddress: 'bluechip1pool_alpha_7k3jx9f7tn2m4qp6rz0sdvwcy5e72',
        creatorTokenAddress: 'bluechip1token_alpha_cw20_contract_addr_placeholder',
        tokenName: 'Alpha Creator Token',
        tokenSymbol: 'ALPHA',
        tokenDecimals: 6,
        totalSupply: '1000000000000',
        reserve0: '425000000000',
        reserve1: '850000000000',
        totalLiquidity: '600000000000',
        totalFeesCollected0: '12500000000',
        totalFeesCollected1: '8200000000',
        totalPositions: 14,
        thresholdReached: true,
        raised: '25000000000',
        target: '25000000000',
        totalCommitters: 8,
        blockTimeLast: Math.floor(now / 1000) - 86400 * 45,
        createdAtBlock: 1_024_300,
        thresholdCrossedAtBlock: 1_187_650,
        totalSwapCount: 1_247,
        totalCommitCount: 42,
        totalVolume0: '89500000000000',
        totalVolume1: '178200000000000',
        totalLpDepositCount: 18,
        totalLpWithdrawalCount: 4,
        lastTradeBlock: 1_650_200,
        lastTradeTimestamp: Math.floor(now / 1000) - 3600,
        currentPrice0to1: '2.0',
        currentPrice1to0: '0.5',
        feeReserve0: '1200000000',
        feeReserve1: '800000000',
        totalUsdRaised: '25000000000',
        totalBluechipRaised: '200000000000',
    },
    {
        poolAddress: 'bluechip1pool_beta_4m2n7xp8wk5dv3qt6rj0yfscalh9z',
        creatorTokenAddress: 'bluechip1token_beta_cw20_contract_addr_placeholder',
        tokenName: 'Beta Stream',
        tokenSymbol: 'BETA',
        tokenDecimals: 6,
        totalSupply: '500000000000',
        reserve0: '180000000000',
        reserve1: '290000000000',
        totalLiquidity: '230000000000',
        totalFeesCollected0: '4100000000',
        totalFeesCollected1: '2800000000',
        totalPositions: 7,
        thresholdReached: true,
        raised: '25000000000',
        target: '25000000000',
        totalCommitters: 12,
        blockTimeLast: Math.floor(now / 1000) - 86400 * 30,
        createdAtBlock: 1_310_800,
        thresholdCrossedAtBlock: 1_425_100,
        totalSwapCount: 583,
        totalCommitCount: 28,
        totalVolume0: '32100000000000',
        totalVolume1: '51800000000000',
        totalLpDepositCount: 9,
        totalLpWithdrawalCount: 2,
        lastTradeBlock: 1_648_900,
        lastTradeTimestamp: Math.floor(now / 1000) - 7200,
        currentPrice0to1: '1.611111',
        currentPrice1to0: '0.620689',
        feeReserve0: '650000000',
        feeReserve1: '420000000',
        totalUsdRaised: '25000000000',
        totalBluechipRaised: '200000000000',
    },
    {
        poolAddress: 'bluechip1pool_gamma_9p4r6t2n7xm3k5wqv8jf0ychlsa',
        creatorTokenAddress: 'bluechip1token_gamma_cw20_contract_addr_placeholder',
        tokenName: 'Gamma Gaming',
        tokenSymbol: 'GAMMA',
        tokenDecimals: 6,
        totalSupply: '2000000000000',
        reserve0: '95000000000',
        reserve1: '620000000000',
        totalLiquidity: '150000000000',
        totalFeesCollected0: '1800000000',
        totalFeesCollected1: '3500000000',
        totalPositions: 4,
        thresholdReached: true,
        raised: '25000000000',
        target: '25000000000',
        totalCommitters: 6,
        blockTimeLast: Math.floor(now / 1000) - 86400 * 60,
        createdAtBlock: 892_150,
        thresholdCrossedAtBlock: 1_053_400,
        totalSwapCount: 312,
        totalCommitCount: 15,
        totalVolume0: '18700000000000',
        totalVolume1: '121500000000000',
        totalLpDepositCount: 5,
        totalLpWithdrawalCount: 1,
        lastTradeBlock: 1_640_100,
        lastTradeTimestamp: Math.floor(now / 1000) - 86400 * 3,
        currentPrice0to1: '6.526315',
        currentPrice1to0: '0.153225',
        feeReserve0: '300000000',
        feeReserve1: '580000000',
        totalUsdRaised: '25000000000',
        totalBluechipRaised: '200000000000',
    },
    {
        poolAddress: 'bluechip1pool_delta_2k8f5n3m7wp4xr6qt9jv0ydclhga',
        creatorTokenAddress: 'bluechip1token_delta_cw20_contract_addr_placeholder',
        tokenName: 'Delta Music',
        tokenSymbol: 'DELTA',
        tokenDecimals: 6,
        totalSupply: '750000000000',
        reserve0: '0',
        reserve1: '0',
        totalLiquidity: '0',
        totalFeesCollected0: '0',
        totalFeesCollected1: '0',
        totalPositions: 0,
        thresholdReached: false,
        raised: '16800000000',
        target: '25000000000',
        totalCommitters: 5,
        blockTimeLast: 0,
        createdAtBlock: 1_502_900,
        thresholdCrossedAtBlock: null,
        totalSwapCount: 0,
        totalCommitCount: 12,
        totalVolume0: '0',
        totalVolume1: '0',
        totalLpDepositCount: 0,
        totalLpWithdrawalCount: 0,
        lastTradeBlock: 0,
        lastTradeTimestamp: 0,
        currentPrice0to1: '0',
        currentPrice1to0: '0',
        feeReserve0: '0',
        feeReserve1: '0',
        totalUsdRaised: '16800000000',
        totalBluechipRaised: '134400000000',
    },
    {
        poolAddress: 'bluechip1pool_epsilon_6n3m8k2f5wp4xr7qt0jv9ydclhs',
        creatorTokenAddress: 'bluechip1token_epsilon_cw20_contract_addr_placeholder',
        tokenName: 'Epsilon Art',
        tokenSymbol: 'EPS',
        tokenDecimals: 6,
        totalSupply: '300000000000',
        reserve0: '0',
        reserve1: '0',
        totalLiquidity: '0',
        totalFeesCollected0: '0',
        totalFeesCollected1: '0',
        totalPositions: 0,
        thresholdReached: false,
        raised: '3200000000',
        target: '25000000000',
        totalCommitters: 3,
        blockTimeLast: 0,
        createdAtBlock: 1_580_200,
        thresholdCrossedAtBlock: null,
        totalSwapCount: 0,
        totalCommitCount: 5,
        totalVolume0: '0',
        totalVolume1: '0',
        totalLpDepositCount: 0,
        totalLpWithdrawalCount: 0,
        lastTradeBlock: 0,
        lastTradeTimestamp: 0,
        currentPrice0to1: '0',
        currentPrice1to0: '0',
        feeReserve0: '0',
        feeReserve1: '0',
        totalUsdRaised: '3200000000',
        totalBluechipRaised: '25600000000',
    },
];

// NOTE: position `created_at` / `last_fee_collection` are block-time
// SECONDS on-chain (`env.block.time.seconds()`), unlike commit
// `last_committed` which is a Timestamp serialized as nanoseconds.
const MOCK_POSITIONS: PositionResponse[] = [
    {
        position_id: '1',
        liquidity: '45000000000',
        owner: MOCK_WALLET,
        fee_growth_inside_0_last: '100000',
        fee_growth_inside_1_last: '80000',
        created_at: Math.floor((now - 30 * day) / 1000),
        last_fee_collection: Math.floor((now - 5 * day) / 1000),
        unclaimed_fees_0: '320000000',
        unclaimed_fees_1: '210000000',
    },
    {
        position_id: '2',
        liquidity: '18000000000',
        owner: MOCK_WALLET,
        fee_growth_inside_0_last: '50000',
        fee_growth_inside_1_last: '40000',
        created_at: Math.floor((now - 15 * day) / 1000),
        last_fee_collection: Math.floor((now - 2 * day) / 1000),
        unclaimed_fees_0: '95000000',
        unclaimed_fees_1: '72000000',
    },
    {
        position_id: '3',
        liquidity: '72000000000',
        owner: 'bluechip1whale8k3jx9f7tn2m4qp6rz0sdvwcyahg5e72n',
        fee_growth_inside_0_last: '200000',
        fee_growth_inside_1_last: '160000',
        created_at: Math.floor((now - 40 * day) / 1000),
        last_fee_collection: Math.floor((now - 1 * day) / 1000),
        unclaimed_fees_0: '580000000',
        unclaimed_fees_1: '420000000',
    },
];

const MOCK_DELTA_COMMITTERS: CommitterInfo[] = [
    {
        wallet: MOCK_WALLET,
        total_paid_usd: '4200000000',
        total_paid_bluechip: '33600000000',
        last_payment_usd: '1500000000',
        last_payment_bluechip: '12000000000',
        last_committed: ((now - 3 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1whale8k3jx9f7tn2m4qp6rz0sdvwcyahg5e72n',
        total_paid_usd: '6500000000',
        total_paid_bluechip: '52000000000',
        last_payment_usd: '2000000000',
        last_payment_bluechip: '16000000000',
        last_committed: ((now - 1 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1early4m2n7xp8wk5dv3qt6rj0yfscalh9zu8e3',
        total_paid_usd: '3500000000',
        total_paid_bluechip: '28000000000',
        last_payment_usd: '3500000000',
        last_payment_bluechip: '28000000000',
        last_committed: ((now - 40 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1degen9p4r6t2n7xm3k5wqv8jf0ychlsab2ue6',
        total_paid_usd: '1800000000',
        total_paid_bluechip: '14400000000',
        last_payment_usd: '1800000000',
        last_payment_bluechip: '14400000000',
        last_committed: ((now - 55 * day) * 1000000).toString(),
    },
    {
        wallet: 'bluechip1saver2k8f5n3m7wp4xr6qt9jv0ydclhgab1u3e',
        total_paid_usd: '800000000',
        total_paid_bluechip: '6400000000',
        last_payment_usd: '800000000',
        last_payment_bluechip: '6400000000',
        last_committed: ((now - 200 * day) * 1000000).toString(),
    },
];


const MOCK_ALPHA_HOLDERS: TokenHolderEntry[] = [
    { address: 'bluechip1whale8k3jx9f7tn2m4qp6rz0sdvwcyahg5e72n', balance: '185000000000' },  // 185,000 tokens (whale)
    { address: MOCK_WALLET, balance: '92000000000' },                                            // 92,000 tokens (whale)
    { address: 'bluechip1degen9p4r6t2n7xm3k5wqv8jf0ychlsab2ue6', balance: '68000000000' },     // 68,000 tokens (whale)
    { address: 'bluechip1early4m2n7xp8wk5dv3qt6rj0yfscalh9zu8e3', balance: '45000000000' },    // 45,000 tokens (mid)
    { address: 'bluechip1saver2k8f5n3m7wp4xr6qt9jv0ydclhgab1u3e', balance: '28000000000' },    // 28,000 tokens (mid)
    { address: 'bluechip1hodl6n3m8k2f5wp4xr7qt0jv9ydclhsab3ue2', balance: '15000000000' },     // 15,000 tokens (mid)
    { address: 'bluechip1moon5r7t2n8xm3k4wqp6jf9v0ychlsab2dge1', balance: '8200000000' },      // 8,200 tokens (mid)
    { address: 'bluechip1tiny3m7k2f8n5wp4xr6qt0jv9ydclhsab1ue4', balance: '3500000000' },      // 3,500 tokens (mid)
    { address: 'bluechip1micro1a2b3c4d5e6f7g8h9i0jklmnopqrstuv', balance: '1200000000' },       // 1,200 tokens (mid)
    { address: 'bluechip1dust2b3c4d5e6f7g8h9i0jklmnopqrstuvwxy', balance: '420000000' },         // 420 tokens (mid)
    { address: 'bluechip1frag3c4d5e6f7g8h9i0jklmnopqrstuvwxyz1', balance: '75000000' },          // 75 tokens (small)
    { address: 'bluechip1atom4d5e6f7g8h9i0jklmnopqrstuvwxyz123', balance: '50000000' },           // 50 tokens (small)
    { address: 'bluechip1nano5e6f7g8h9i0jklmnopqrstuvwxyz12345', balance: '12000000' },           // 12 tokens (small)
    { address: 'bluechip1pico6f7g8h9i0jklmnopqrstuvwxyz1234567', balance: '5000000' },            // 5 tokens (small)
    { address: 'bluechip1zepto7g8h9i0jklmnopqrstuvwxyz12345678', balance: '800000' },             // 0.8 tokens (small)
];

const MOCK_DELTA_HOLDERS: TokenHolderEntry[] = [
    { address: 'bluechip1whale8k3jx9f7tn2m4qp6rz0sdvwcyahg5e72n', balance: '120000000000' },
    { address: MOCK_WALLET, balance: '65000000000' },
    { address: 'bluechip1early4m2n7xp8wk5dv3qt6rj0yfscalh9zu8e3', balance: '32000000000' },
    { address: 'bluechip1degen9p4r6t2n7xm3k5wqv8jf0ychlsab2ue6', balance: '18000000000' },
    { address: 'bluechip1saver2k8f5n3m7wp4xr6qt9jv0ydclhgab1u3e', balance: '5000000000' },
];

const MOCK_ALPHA_DISTRIBUTION: HolderDistribution = {
    totalHolders: 15,
    whales: 3,   // 60,000+
    mid: 7,      // 100 – 60,000
    small: 5,    // < 100
    topHolders: MOCK_ALPHA_HOLDERS.slice(0, 5),
};

const MOCK_DELTA_DISTRIBUTION: HolderDistribution = {
    totalHolders: 5,
    whales: 2,
    mid: 3,
    small: 0,
    topHolders: MOCK_DELTA_HOLDERS.slice(0, 5),
};

const MOCK_ALPHA_THRESHOLD: ThresholdAnalytics = {
    thresholdCrossedAt: Math.floor(now / 1000) - 86400 * 45,
    poolCreatedAt: Math.floor(now / 1000) - 86400 * 72,
    daysToThreshold: 27,
    totalCommittersAtThreshold: 8,
    avgCommitValueUsd: '3125000000',   // $3,125 avg per committer
    totalRaisedUsd: '25000000000',
    walletBreakdown: {
        whaleCommitters: 2,   // $5,000+
        midCommitters: 4,     // $500 – $5,000
        smallCommitters: 2,   // < $500
    },
};


function delay(ms: number = 300): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function findPool(address: string): PoolSummary | undefined {
    return MOCK_POOLS.find((p) => p.poolAddress === address);
}

async function mockFetchPoolSummary(poolAddress: string): Promise<PoolSummary | null> {
    await delay(400);
    const pool = findPool(poolAddress) || MOCK_POOLS[0];
    // SECURITY: Sanitize all on-chain strings before they enter the render tree.
    return pool ? sanitizePoolSummary(pool) : null;
}

async function mockFetchAllPoolSummaries(_factoryAddress: string): Promise<PoolSummary[]> {
    await delay(600);
    // SECURITY: Sanitize every pool summary returned from the chain query.
    return MOCK_POOLS.map(sanitizePoolSummary);
}

async function mockQueryPoolCommits(poolAddress: string): Promise<PoolCommitResponse | null> {
    await delay(200);
    const pool = findPool(poolAddress);
    if (pool && (pool.tokenSymbol === 'DELTA' || pool.tokenSymbol === 'EPS')) {
        return { page_count: MOCK_DELTA_COMMITTERS.length, committers: MOCK_DELTA_COMMITTERS };
    }
    return { page_count: MOCK_COMMITTERS.length, committers: MOCK_COMMITTERS };
}

async function mockQueryPositions(poolAddress: string): Promise<PositionsResponse | null> {
    await delay(200);
    const pool = findPool(poolAddress);
    if (pool && !pool.thresholdReached) return { positions: [] };
    if (pool === MOCK_POOLS[0]) return { positions: MOCK_POSITIONS };
    if (pool === MOCK_POOLS[1]) {
        return {
            positions: [{
                position_id: '4',
                liquidity: '28000000000',
                owner: MOCK_WALLET,
                fee_growth_inside_0_last: '75000',
                fee_growth_inside_1_last: '60000',
                created_at: Math.floor((now - 20 * day) / 1000),
                last_fee_collection: Math.floor((now - 8 * day) / 1000),
                unclaimed_fees_0: '180000000',
                unclaimed_fees_1: '140000000',
            }],
        };
    }
    return { positions: [] };
}

async function mockQueryPoolPair(poolAddress: string): Promise<PoolPairInfo | null> {
    await delay(100);
    const pool = findPool(poolAddress);
    return {
        asset_infos: [
            { bluechip: { denom: 'ubluechip' } },
            { creator_token: { contract_addr: pool?.creatorTokenAddress || 'bluechip1mock_token' } },
        ],
        contract_addr: poolAddress,
        pool_type: { xyk: {} },
    };
}

async function mockQueryPoolCreator(poolAddress: string): Promise<string | null> {
    await delay(100);
    const pool = findPool(poolAddress);
    if (pool && (pool.tokenSymbol === 'ALPHA' || pool.tokenSymbol === 'DELTA')) {
        return MOCK_WALLET;
    }
    return 'bluechip1othercreator_not_you_random_addr_placeholder';
}

async function mockFindPoolsByCreator(
    pools: PoolSummary[],
    walletAddress: string
): Promise<PoolSummary[]> {
    await delay(300);
    return pools.filter((p) => p.tokenSymbol === 'ALPHA' || p.tokenSymbol === 'DELTA');
}

async function mockQueryHolderDistribution(tokenAddress: string): Promise<HolderDistribution | null> {
    await delay(350);
    if (tokenAddress.includes('alpha')) return MOCK_ALPHA_DISTRIBUTION;
    if (tokenAddress.includes('delta')) return MOCK_DELTA_DISTRIBUTION;
    return MOCK_ALPHA_DISTRIBUTION;
}

async function mockQueryThresholdAnalytics(
    poolAddress: string,
    committers: CommitterInfo[]
): Promise<ThresholdAnalytics | null> {
    await delay(200);
    const pool = findPool(poolAddress);
    if (!pool) return null;

    if (pool.thresholdReached) {
        if (pool.tokenSymbol === 'ALPHA') return MOCK_ALPHA_THRESHOLD;
        return {
            ...MOCK_ALPHA_THRESHOLD,
            totalCommittersAtThreshold: pool.totalCommitters,
        };
    }

    const totalUsd = committers.reduce<bigint>((s, c) => s + safeBigInt(c.total_paid_usd), 0n);
    const avgUsd = committers.length > 0 ? totalUsd / BigInt(committers.length) : 0n;

    const WHALE_USD = 5_000_000_000n;  // $5,000 in micro
    const MID_USD = 500_000_000n;      // $500 in micro

    return {
        thresholdCrossedAt: null,
        poolCreatedAt: Math.floor(now / 1000) - 86400 * 90,
        daysToThreshold: null,
        totalCommittersAtThreshold: committers.length,
        avgCommitValueUsd: avgUsd.toString(),
        totalRaisedUsd: pool.raised,
        walletBreakdown: {
            whaleCommitters: committers.filter(c => safeBigInt(c.total_paid_usd) >= WHALE_USD).length,
            midCommitters: committers.filter(c => {
                const v = safeBigInt(c.total_paid_usd);
                return v >= MID_USD && v < WHALE_USD;
            }).length,
            smallCommitters: committers.filter(c => safeBigInt(c.total_paid_usd) < MID_USD).length,
        },
    };
}

async function mockQueryPoolAnalytics(poolAddress: string): Promise<PoolAnalyticsResponse | null> {
    await delay(250);
    const pool = findPool(poolAddress);
    if (!pool) return null;
    return {
        analytics: {
            total_swap_count: pool.totalSwapCount,
            total_commit_count: pool.totalCommitCount,
            total_volume_0: pool.totalVolume0,
            total_volume_1: pool.totalVolume1,
            total_lp_deposit_count: pool.totalLpDepositCount,
            total_lp_withdrawal_count: pool.totalLpWithdrawalCount,
            last_trade_block: pool.lastTradeBlock,
            last_trade_timestamp: pool.lastTradeTimestamp,
        },
        current_price_0_to_1: pool.currentPrice0to1,
        current_price_1_to_0: pool.currentPrice1to0,
        total_value_locked_0: pool.reserve0,
        total_value_locked_1: pool.reserve1,
        fee_reserve_0: pool.feeReserve0,
        fee_reserve_1: pool.feeReserve1,
        // Canonical wire form: serde emits the FullyCommitted unit
        // variant as the bare string "fully_committed".
        threshold_status: pool.thresholdReached
            ? 'fully_committed'
            : { in_progress: { raised: pool.raised, target: pool.target } },
        total_usd_raised: pool.totalUsdRaised,
        total_bluechip_raised: pool.totalBluechipRaised,
        total_positions: pool.totalPositions,
    };
}

export interface WalletHolding {
    tokenAddress: string;
    tokenSymbol: string;
    tokenName: string;
    tokenDecimals: number;
    balance: string;
    poolAddress: string;
}

async function mockQueryWalletHoldings(
    walletAddress: string,
    pools: PoolSummary[]
): Promise<WalletHolding[]> {
    await delay(400);
    if (walletAddress !== MOCK_WALLET) return [];
    const holdings: WalletHolding[] = [];
    for (const pool of pools) {
        if (!pool.creatorTokenAddress || !pool.thresholdReached) continue;
        // Mock: the user holds tokens in ALPHA and BETA pools
        if (pool.tokenSymbol === 'ALPHA') {
            holdings.push({
                tokenAddress: pool.creatorTokenAddress,
                tokenSymbol: pool.tokenSymbol,
                tokenName: pool.tokenName,
                tokenDecimals: pool.tokenDecimals,
                balance: '15000000000', // 15,000 tokens
                poolAddress: pool.poolAddress,
            });
        } else if (pool.tokenSymbol === 'BETA') {
            holdings.push({
                tokenAddress: pool.creatorTokenAddress,
                tokenSymbol: pool.tokenSymbol,
                tokenName: pool.tokenName,
                tokenDecimals: pool.tokenDecimals,
                balance: '8500000000', // 8,500 tokens
                poolAddress: pool.poolAddress,
            });
        }
    }
    return holdings;
}

// Mirrors the creator-pool `creator_earnings {}` query. Mock data keeps
// the canonical wire units: token amounts in micro, timestamps in
// nanoseconds-as-strings.
async function mockQueryCreatorEarnings(poolAddress: string): Promise<CreatorEarningsResponse | null> {
    await delay(200);
    const pool = findPool(poolAddress);
    if (!pool) return null;

    if (pool.tokenSymbol === 'ALPHA') {
        return {
            creator_wallet_address: MOCK_WALLET,
            fee_pot: { amount_0: '850000000', amount_1: '1200000000' },   // 850 bluechip + 1,200 ALPHA
            excess: {
                bluechip_amount: '15000000000',   // 15,000 bluechip
                token_amount: '30000000000',      // 30,000 ALPHA
                unlock_time: ((now + 12 * day) * 1000000).toString(),
                claimable_now: false,
            },
            is_threshold_hit: true,
            threshold_crossed_at: ((now - 45 * day) * 1000000).toString(),
        };
    }

    return {
        creator_wallet_address: pool.tokenSymbol === 'DELTA'
            ? MOCK_WALLET
            : 'bluechip1othercreator_not_you_random_addr_placeholder',
        fee_pot: { amount_0: '0', amount_1: '0' },
        excess: null,
        is_threshold_hit: pool.thresholdReached,
        threshold_crossed_at: pool.thresholdReached
            ? ((now - 30 * day) * 1000000).toString()
            : null,
    };
}

async function mockQueryDistributionState(_poolAddress: string): Promise<DistributionStateResponse | null> {
    await delay(150);
    // Mock: every pool's post-threshold payout distribution has completed
    // (the contract returns null once the state is cleaned up).
    return null;
}

async function mockQueryPoolIsPaused(_poolAddress: string): Promise<boolean> {
    await delay(100);
    return false;
}

async function mockQueryFactoryNotifyStatus(_poolAddress: string): Promise<FactoryNotifyStatusResponse> {
    await delay(100);
    return { pending: false };
}


export { formatMicroAmount, safeBigInt, microToNumber } from './bigintMath';

export function abbreviateAddress(address: string, prefixLen: number = 12, suffixLen: number = 6): string {
    if (address.length <= prefixLen + suffixLen + 3) return address;
    return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

// SECURITY: Sanitizes all user-facing string fields on a PoolSummary before
// they are rendered. On-chain data (token names, symbols, contract labels)
// is untrusted — an attacker could deploy a pool with a name containing
// zero-width characters, RTL overrides, or abusively long strings that break
// layout or enable phishing. Should be called on every pool summary returned
// from a chain query before it enters the React render tree.
export function sanitizePoolSummary(pool: PoolSummary): PoolSummary {
    return {
        ...pool,
        tokenName: sanitizeOnChainString(pool.tokenName, 64),
        tokenSymbol: sanitizeOnChainString(pool.tokenSymbol, 16),
    };
}

// ===========================================================================
// Data-source dispatch.
//
// One RPC probe per session decides between the live chain and the
// built-in demo data:
//   - REACT_APP_USE_MOCK_DATA=true  -> always demo data
//   - REACT_APP_USE_MOCK_DATA=false -> always chain (failures surface as
//     empty/null results rather than silently mixing in demo data)
//   - unset -> chain when the RPC answers, demo data otherwise
// Chain-side failures after the probe resolve to null/[] — never to
// demo data — so real and mock values can't blend in one session.
// ===========================================================================

export type DataSource = 'chain' | 'mock';

let dataSourcePromise: Promise<DataSource> | null = null;

export function getDataSource(): Promise<DataSource> {
    if (!dataSourcePromise) {
        dataSourcePromise = (async () => {
            const override = process.env.REACT_APP_USE_MOCK_DATA;
            if (override === 'true') return 'mock';
            if (await chain.chainAvailable()) return 'chain';
            if (override === 'false') return 'chain';
            console.warn('[bluechip] chain RPC unreachable — serving built-in demo data');
            return 'mock';
        })();
    }
    return dataSourcePromise;
}

async function onChain(): Promise<boolean> {
    return (await getDataSource()) === 'chain';
}

export async function fetchPoolSummary(poolAddress: string): Promise<PoolSummary | null> {
    if (await onChain()) {
        const pool = await chain.chainFetchPoolSummary(poolAddress);
        return pool ? sanitizePoolSummary(pool) : null;
    }
    return mockFetchPoolSummary(poolAddress);
}

export async function fetchAllPoolSummaries(factoryAddr: string): Promise<PoolSummary[]> {
    if (await onChain()) {
        const pools = await chain.chainFetchAllPoolSummaries().catch(() => [] as PoolSummary[]);
        return pools.map(sanitizePoolSummary);
    }
    return mockFetchAllPoolSummaries(factoryAddr);
}

export async function queryPoolCommits(poolAddress: string): Promise<PoolCommitResponse | null> {
    if (await onChain()) return chain.chainQueryPoolCommits(poolAddress).catch(() => null);
    return mockQueryPoolCommits(poolAddress);
}

export async function queryPositions(poolAddress: string): Promise<PositionsResponse | null> {
    if (await onChain()) return chain.chainQueryPositions(poolAddress).catch(() => null);
    return mockQueryPositions(poolAddress);
}

export async function queryPoolPair(poolAddress: string): Promise<PoolPairInfo | null> {
    if (await onChain()) return chain.chainQueryPoolPair(poolAddress).catch(() => null);
    return mockQueryPoolPair(poolAddress);
}

export async function queryPoolCreator(poolAddress: string): Promise<string | null> {
    if (await onChain()) return chain.chainQueryPoolCreator(poolAddress).catch(() => null);
    return mockQueryPoolCreator(poolAddress);
}

export async function findPoolsByCreator(
    pools: PoolSummary[],
    walletAddress: string
): Promise<PoolSummary[]> {
    if (await onChain()) return chain.chainFindPoolsByCreator(pools, walletAddress).catch(() => []);
    return mockFindPoolsByCreator(pools, walletAddress);
}

export async function queryHolderDistribution(tokenAddress: string): Promise<HolderDistribution | null> {
    if (await onChain()) return chain.chainQueryHolderDistribution(tokenAddress);
    return mockQueryHolderDistribution(tokenAddress);
}

export async function queryThresholdAnalytics(
    poolAddress: string,
    committers: CommitterInfo[]
): Promise<ThresholdAnalytics | null> {
    if (await onChain()) return chain.chainQueryThresholdAnalytics(poolAddress, committers).catch(() => null);
    return mockQueryThresholdAnalytics(poolAddress, committers);
}

export async function queryPoolAnalytics(poolAddress: string): Promise<PoolAnalyticsResponse | null> {
    if (await onChain()) return chain.chainQueryPoolAnalytics(poolAddress).catch(() => null);
    return mockQueryPoolAnalytics(poolAddress);
}

export async function queryWalletHoldings(
    walletAddress: string,
    pools: PoolSummary[]
): Promise<WalletHolding[]> {
    if (await onChain()) return chain.chainQueryWalletHoldings(walletAddress, pools).catch(() => []);
    return mockQueryWalletHoldings(walletAddress, pools);
}

export async function queryCreatorEarnings(poolAddress: string): Promise<CreatorEarningsResponse | null> {
    if (await onChain()) return chain.chainQueryCreatorEarnings(poolAddress).catch(() => null);
    return mockQueryCreatorEarnings(poolAddress);
}

export async function queryDistributionState(poolAddress: string): Promise<DistributionStateResponse | null> {
    if (await onChain()) return chain.chainQueryDistributionState(poolAddress).catch(() => null);
    return mockQueryDistributionState(poolAddress);
}

export async function queryPoolIsPaused(poolAddress: string): Promise<boolean> {
    if (await onChain()) return chain.chainQueryPoolIsPaused(poolAddress).catch(() => false);
    return mockQueryPoolIsPaused(poolAddress);
}

export async function queryFactoryNotifyStatus(poolAddress: string): Promise<FactoryNotifyStatusResponse> {
    if (await onChain()) {
        return chain.chainQueryFactoryNotifyStatus(poolAddress).catch(() => ({ pending: false }));
    }
    return mockQueryFactoryNotifyStatus(poolAddress);
}

export async function queryTokenInfo(tokenAddress: string): Promise<CW20TokenInfo | null> {
    if (await onChain()) return chain.chainQueryTokenInfo(tokenAddress).catch(() => null);
    return null;
}

export function getCosmWasmClient() {
    return chain.getCosmWasmClient();
}

// ---- Factory oracle price (drives the commit staleness banner) ----

export type { BluechipPriceInfo } from './chainQueries';

export async function queryBluechipOraclePrice(): Promise<chain.BluechipPriceInfo | null> {
    if (await onChain()) return chain.chainQueryBluechipOraclePrice().catch(() => null);
    // Demo mode: a fresh, healthy oracle reading ($0.125 per bluechip).
    return { price: '125000', timestamp: Math.floor(Date.now() / 1000) - 5, is_cached: false };
}

// ---- Router (multi-hop swaps) ----

export type { RouterConfig, SimulateMultiHopResponse, SwapOperationWire } from './chainQueries';

export async function queryRouterConfig(routerAddr: string): Promise<chain.RouterConfig | null> {
    if (await onChain()) return chain.chainQueryRouterConfig(routerAddr).catch(() => null);
    return { factory_addr: 'bluechip1factory_mock_address_for_ui_preview', bluechip_denom: 'ubluechip', admin: MOCK_WALLET };
}

export async function simulateMultiHop(
    routerAddr: string,
    operations: chain.SwapOperationWire[],
    offerAmount: string,
): Promise<chain.SimulateMultiHopResponse | null> {
    if (await onChain()) {
        return chain.chainSimulateMultiHop(routerAddr, operations, offerAmount).catch(() => null);
    }
    // Demo simulation: 0.5% commission per hop, flat 1:1 prices.
    let amount = safeBigInt(offerAmount);
    const intermediates: string[] = [];
    for (let i = 0; i < operations.length; i++) {
        amount = (amount * 9_950n) / 10_000n;
        intermediates.push(amount.toString());
    }
    return {
        final_amount: amount.toString(),
        intermediate_amounts: intermediates,
        price_impact: (0.005 * operations.length).toFixed(4),
    };
}

// ---- Expand-economy reserve (ops monitoring) ----

export type { ExpandEconomyReserve } from './chainQueries';

export async function queryExpandEconomyReserve(): Promise<chain.ExpandEconomyReserve | null> {
    if (await onChain()) return chain.chainQueryExpandEconomyReserve().catch(() => null);
    return {
        address: 'bluechip1expand_economy_mock_address_for_preview',
        denom: 'ubluechip',
        amount: '12500000000',   // 12,500 bluechip — comfortably funded
    };
}
