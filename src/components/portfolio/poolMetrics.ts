import { formatMicroAmount, PoolSummary } from '../../utils/contractQueries';
import { microToNumber, safeBigInt } from '../../utils/bigintMath';

/** Extract a numeric value from a pool for a given metric key */
export function getPoolMetricValue(pool: PoolSummary, metric: string): number {
    switch (metric) {
        case 'totalLiquidity': return microToNumber(pool.totalLiquidity, 0);
        case 'totalFeesCollected':
        case 'tradeVolume': // fees as a proxy for trade volume
            return microToNumber(safeBigInt(pool.totalFeesCollected0) + safeBigInt(pool.totalFeesCollected1), 0);
        case 'totalCommitters':
        case 'uniqueHolders':
            return pool.totalCommitters;
        case 'totalPositions': return pool.totalPositions;
        case 'raised': return microToNumber(pool.raised, 0);
        case 'totalSupply': return microToNumber(pool.totalSupply, 0);
        case 'reserve0': return microToNumber(pool.reserve0, 0);
        case 'reserve1': return microToNumber(pool.reserve1, 0);
        case 'tokenPrice':
        case 'priceChange': { // reserve ratio as a proxy for price movement potential
            const r0 = microToNumber(pool.reserve0, 0);
            const r1 = microToNumber(pool.reserve1, 0);
            return r1 > 0 ? r0 / r1 : 0;
        }
        case 'marketCap': {
            const r0 = microToNumber(pool.reserve0, 0);
            const r1 = microToNumber(pool.reserve1, 0);
            const price = r1 > 0 ? r0 / r1 : 0;
            return price * microToNumber(pool.totalSupply, 0);
        }
        default: return 0;
    }
}

/** Human-readable rendering of a metric value, matching its unit. */
export function formatPoolMetric(pool: PoolSummary, metricKey: string): string {
    const raw = getPoolMetricValue(pool, metricKey);
    switch (metricKey) {
        case 'tokenPrice':
        case 'priceChange':
            return raw > 0 ? `${raw.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} BLC` : '-';
        case 'totalCommitters':
        case 'totalPositions':
        case 'uniqueHolders':
            return raw.toLocaleString();
        default:
            return formatMicroAmount(Math.floor(raw).toString());
    }
}

/** For a list of pools, determine which pool has the highest value for each metric */
export function getHighlightMap(pools: PoolSummary[], metrics: string[]): Map<string, Set<string>> {
    // Map<metric, Set<poolAddress>> — pools that have the highest value
    const result = new Map<string, Set<string>>();
    for (const metric of metrics) {
        const values = pools.map((p) => ({ addr: p.poolAddress, val: getPoolMetricValue(p, metric) }));
        const maxVal = Math.max(...values.map((v) => v.val));
        const allEqual = values.every((v) => v.val === maxVal);
        if (allEqual) {
            result.set(metric, new Set()); // all equal → no highlighting
        } else {
            result.set(metric, new Set(values.filter((v) => v.val === maxVal).map((v) => v.addr)));
        }
    }
    return result;
}

export interface PoolMetricDef {
    key: string;
    label: string;
}

/** Pool-oriented metrics offered by the creator-portfolio compare view. */
export const POOL_FOCUS_METRICS: PoolMetricDef[] = [
    { key: 'totalLiquidity', label: 'Total Liquidity (TVL)' },
    { key: 'totalFeesCollected', label: 'Total Fees Collected' },
    { key: 'totalCommitters', label: 'Total Committers' },
    { key: 'totalPositions', label: 'LP Positions' },
    { key: 'raised', label: 'Amount Raised' },
    { key: 'totalSupply', label: 'Total Supply' },
    { key: 'tokenPrice', label: 'Token Price' },
    { key: 'marketCap', label: 'Market Cap' },
    { key: 'reserve0', label: 'bluechip Reserve' },
    { key: 'reserve1', label: 'Creator Token Reserve' },
];

/** Pool-oriented metrics offered by the top-pools table compare view. */
export const POOL_COMPARE_METRICS: PoolMetricDef[] = POOL_FOCUS_METRICS.filter(
    (m) => m.key !== 'totalSupply',
);

/** Token-oriented metrics offered by the top-tokens table compare view. */
export const TOKEN_COMPARE_METRICS: PoolMetricDef[] = [
    { key: 'tradeVolume', label: 'Trade Volume (Fees as Proxy)' },
    { key: 'tokenPrice', label: 'Token Price' },
    { key: 'priceChange', label: 'Price Change Potential' },
    { key: 'uniqueHolders', label: 'Unique Holders (Committers)' },
    { key: 'marketCap', label: 'Market Cap' },
];
