import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    LinearProgress,
    Typography,
} from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import PoolHistoryPanel from '../../components/PoolHistoryPanel';
import PoolStatusBanners from '../../components/universal/PoolStatusBanners';
import {
    fetchPoolSummary,
    queryPoolCommits,
    queryPoolCreator,
    queryPoolPair,
    queryPoolAnalytics,
    formatMicroAmount,
    abbreviateAddress,
    PoolSummary,
    CommitterInfo,
    PoolAnalyticsResponse,
} from '../../utils/contractQueries';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import LockIcon from '@mui/icons-material/Lock';
import BarChartIcon from '@mui/icons-material/BarChart';
import PoolActionMenu from '../../components/actions/PoolActionMenu';
import CopyableId from '../../components/universal/CopyableId';
import StatCard from '../../components/universal/StatCard';
import PoolPieChart from '../../components/individual-pages/PoolPieChart';
import { useWallet } from '../../context/WalletContext';
import { compareMicro, microToNumber, safeBigInt } from '../../utils/bigintMath';
import { timeAgo } from '../../utils/datetime';

function computeTokenPrice(reserve0: string, reserve1: string): string {
    const r0 = microToNumber(reserve0, 0);
    const r1 = microToNumber(reserve1, 0);
    if (!r0 || !r1) return '-';
    const price = r0 / r1;
    return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function computeReserveRatio(reserve0: string, reserve1: string): string {
    const r0 = safeBigInt(reserve0);
    const r1 = safeBigInt(reserve1);
    const total = r0 + r1;
    if (total === 0n) return '-';
    const pct0 = Number((r0 * 1000n) / total) / 10;
    const pct1 = Number((r1 * 1000n) / total) / 10;
    return `${pct0.toFixed(1)}% / ${pct1.toFixed(1)}%`;
}

function computeMarketCap(reserve0: string, reserve1: string, totalSupply: string, decimals: number): string {
    const r0 = microToNumber(reserve0, 0);
    const r1 = microToNumber(reserve1, 0);
    const supply = microToNumber(totalSupply, 0);
    if (!r0 || !r1 || !supply) return '-';
    const pricePerToken = r0 / r1;
    const mcap = (pricePerToken * supply) / Math.pow(10, decimals);
    return formatMicroAmount(Math.floor(mcap).toString());
}

function computeFeeApr(
    totalFeesCollected0: string,
    totalFeesCollected1: string,
    totalLiquidity: string,
    blockTimeLast: number
): string {
    const fees0 = microToNumber(totalFeesCollected0, 0);
    const fees1 = microToNumber(totalFeesCollected1, 0);
    const liquidity = microToNumber(totalLiquidity, 0);
    if (!liquidity || (!fees0 && !fees1)) return '-';
    const totalFees = fees0 + fees1;
    const feeRatio = totalFees / liquidity;

    if (blockTimeLast > 0) {
        const now = Date.now() / 1000;
        const poolAgeDays = (now - blockTimeLast) > 0
            ? Math.max((now - blockTimeLast) / 86400, 1)
            : 1;
        const annualizedRatio = (feeRatio / poolAgeDays) * 365;
        const apr = annualizedRatio * 100;
        if (apr > 10000) return '>10,000%';
        return apr.toFixed(1) + '%';
    }

    const apr = (feeRatio / 30) * 365 * 100;
    if (apr > 10000) return '>10,000%';
    return apr.toFixed(1) + '%';
}

function sumPaidUsd(committers: CommitterInfo[]): bigint {
    return committers.reduce<bigint>((sum, c) => sum + safeBigInt(c.total_paid_usd), 0n);
}

function computeAvgCommit(committers: CommitterInfo[]): string {
    if (committers.length === 0) return '$0';
    const total = sumPaidUsd(committers);
    const avg = total / BigInt(committers.length);
    return '$' + formatMicroAmount(avg);
}

function computeLargestCommit(committers: CommitterInfo[]): string {
    if (committers.length === 0) return '$0';
    let max = 0n;
    for (const c of committers) {
        const v = safeBigInt(c.total_paid_usd);
        if (v > max) max = v;
    }
    return '$' + formatMicroAmount(max);
}

function computeCreatorFeeRevenue(committers: CommitterInfo[], feeRate: number): string {
    const totalUsd = sumPaidUsd(committers);
    // feeRate is a Number ratio (e.g. 0.05). Scale to 10_000 bps for integer math.
    const feeBps = BigInt(Math.round(feeRate * 10_000));
    const revenue = (totalUsd * feeBps) / 10_000n;
    return '$' + formatMicroAmount(revenue);
}

function commitDaysSpan(sorted: CommitterInfo[]): number {
    const firstNs = safeBigInt(sorted[0].last_committed);
    const lastNs = safeBigInt(sorted[sorted.length - 1].last_committed);
    if (firstNs === 0n || lastNs === 0n) return 0;
    const firstMs = Number(firstNs / 1_000_000n);
    const lastMs = Number(lastNs / 1_000_000n);
    return (lastMs - firstMs) / (1000 * 60 * 60 * 24);
}

function computeCommitVelocity(committers: CommitterInfo[]): string {
    if (committers.length < 2) return '-';
    const sorted = [...committers].sort(
        (a, b) => compareMicro(a.last_committed, b.last_committed)
    );
    const days = commitDaysSpan(sorted);
    if (days <= 0) return '-';
    const totalUsd = microToNumber(sumPaidUsd(committers), 0);
    const perDay = totalUsd / days;
    return '$' + formatMicroAmount(Math.floor(perDay).toString()) + '/day';
}

function computeEstimatedTimeToThreshold(
    raised: string,
    target: string,
    committers: CommitterInfo[]
): string {
    if (committers.length < 2) return '-';
    const sorted = [...committers].sort(
        (a, b) => compareMicro(a.last_committed, b.last_committed)
    );
    const days = commitDaysSpan(sorted);
    if (days <= 0) return '-';
    const totalUsd = microToNumber(sumPaidUsd(committers), 0);
    const perDay = totalUsd / days;
    if (perDay <= 0) return '-';
    const remaining = safeBigInt(target) - safeBigInt(raised);
    if (remaining <= 0n) return 'Reached';
    const daysLeft = microToNumber(remaining, 0) / perDay;
    if (daysLeft < 1) return '< 1 day';
    if (daysLeft < 30) return `~${Math.ceil(daysLeft)} days`;
    return `~${Math.ceil(daysLeft / 30)} months`;
}

function getPoolTypeLabel(pair: { pool_type: { xyk?: Record<string, never>; stable?: Record<string, never> } } | null): string {
    if (!pair) return '-';
    if ('xyk' in pair.pool_type) return 'XYK (Constant Product)';
    if ('stable' in pair.pool_type) return 'Stable';
    return 'Unknown';
}


const CreatorPoolPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { address } = useWallet();
    const [pool, setPool] = useState<PoolSummary | null>(null);
    const [committers, setCommitters] = useState<CommitterInfo[]>([]);
    const [analytics, setAnalytics] = useState<PoolAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCreator, setIsCreator] = useState(false);
    const [poolTypeLabel, setPoolTypeLabel] = useState('-');

    useEffect(() => {
        async function loadPool() {
            if (!id) return;
            setLoading(true);
            try {
                const [summary, commits, pair, analyticsData] = await Promise.all([
                    fetchPoolSummary(id),
                    queryPoolCommits(id),
                    queryPoolPair(id),
                    queryPoolAnalytics(id),
                ]);
                setPool(summary);
                setCommitters(commits?.committers || []);
                setPoolTypeLabel(getPoolTypeLabel(pair));
                setAnalytics(analyticsData);

                if (address) {
                    const creator = await queryPoolCreator(id);
                    setIsCreator(creator === address);
                }
            } catch (error) {
                console.error('Error loading pool:', error);
            } finally {
                setLoading(false);
            }
        }
        loadPool();
    }, [id, address]);

    if (!id) {
        return (
            <PageShell width={8} showStats={false}>
                <Grid item xs={12} md={8}><Typography>Creator Pool Not Found</Typography></Grid>
            </PageShell>
        );
    }

    const tokenPrice = analytics && analytics.current_price_1_to_0 !== '0'
        ? parseFloat(analytics.current_price_1_to_0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
        : pool ? computeTokenPrice(pool.reserve0, pool.reserve1) : '-';
    const reserveRatio = pool ? computeReserveRatio(pool.reserve0, pool.reserve1) : '-';
    const avgCommit = computeAvgCommit(committers);
    const largestCommit = computeLargestCommit(committers);
    const marketCap = pool
        ? computeMarketCap(pool.reserve0, pool.reserve1, pool.totalSupply, pool.tokenDecimals)
        : '-';
    const feeApr = pool
        ? computeFeeApr(pool.totalFeesCollected0, pool.totalFeesCollected1, pool.totalLiquidity, pool.blockTimeLast)
        : '-';

    return (
        <PageShell width={8}>
                {loading ? (
                    <Grid item xs={12} md={8} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress />
                        <Typography variant="body2" sx={{ mt: 1 }}>Loading pool data from chain...</Typography>
                    </Grid>
                ) : !pool ? (
                    <Grid item xs={12} md={8}>
                        <Typography color="error">Could not load pool data for this address.</Typography>
                    </Grid>
                ) : (
                    <>
                        <Grid item xs={12} md={9}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                        <Typography variant='h5' sx={{ fontWeight: 'bold' }}>
                                            {pool.tokenName} ({pool.tokenSymbol})
                                        </Typography>
                                        <Chip
                                            label={pool.thresholdReached ? 'Active' : 'Pre-threshold'}
                                            color={pool.thresholdReached ? 'success' : 'warning'}
                                            size="small"
                                        />
                                        <Chip label={poolTypeLabel} size="small" variant="outlined" />
                                        {isCreator && (
                                            <Chip label="You are the Creator" color="primary" size="small" />
                                        )}
                                        <Box sx={{ ml: 'auto' }}>
                                            <PoolActionMenu
                                                poolAddress={pool.poolAddress}
                                                tokenSymbol={pool.tokenSymbol}
                                                creatorTokenAddress={pool.creatorTokenAddress}
                                                thresholdReached={pool.thresholdReached}
                                            />
                                        </Box>
                                    </Box>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        Pool Address: <CopyableId value={id}><Link to={`/wallet/${id}`} style={{ color: '#1976d2' }}>{id}</Link></CopyableId>
                                    </Typography>
                                    {pool.creatorTokenAddress && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                            Token Contract: <CopyableId value={pool.creatorTokenAddress}><Link to={`/creatortoken/${pool.creatorTokenAddress}`} style={{ color: '#1976d2' }}>{abbreviateAddress(pool.creatorTokenAddress)}</Link></CopyableId>
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {pool.thresholdReached && (
                            <Grid item xs={12} md={5}>
                                <Card>
                                    <CardContent>
                                        <Grid container spacing={3}>
                                            <Grid item xs={12} sm={4}>
                                                <Typography variant="body2" color="text.secondary">Token Price</Typography>
                                                <Typography variant="h4" fontWeight="bold">
                                                    {tokenPrice}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    bluechip per 1 {pool.tokenSymbol}
                                                </Typography>
                                            </Grid>
                                            <Grid item xs={6} sm={4}>
                                                <Typography variant="body2" color="text.secondary">Market Cap</Typography>
                                                <Typography variant="h5" fontWeight="bold">
                                                    {marketCap}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    bluechip
                                                </Typography>
                                            </Grid>
                                            <Grid item xs={6} sm={4}>
                                                <Typography variant="body2" color="text.secondary">Fee APR</Typography>
                                                <Typography variant="h5" fontWeight="bold" color={
                                                    feeApr !== '-' && parseFloat(feeApr) > 50 ? 'success.main'
                                                        : feeApr !== '-' && parseFloat(feeApr) > 10 ? 'warning.main'
                                                            : 'text.primary'
                                                }>
                                                    {feeApr}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    for liquidity providers
                                                </Typography>
                                            </Grid>
                                        </Grid>
                                        <Divider sx={{ my: 1.5 }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Reserve Ratio: <strong>{reserveRatio}</strong> (bluechip / {pool.tokenSymbol})
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}

                        {!pool.thresholdReached && (
                            <Grid item xs={12} md={5}>
                                <Card sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant='h6'>Commit Progress</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {committers.length > 1
                                                    ? `Est. ${computeEstimatedTimeToThreshold(pool.raised, pool.target, committers)} remaining`
                                                    : ''}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ flexGrow: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={Math.min(
                                                        safeBigInt(pool.target) > 0n
                                                            ? Number((safeBigInt(pool.raised) * 10000n) / safeBigInt(pool.target)) / 100
                                                            : 0,
                                                        100,
                                                    )}
                                                    sx={{
                                                        height: 24,
                                                        borderRadius: 12,
                                                        backgroundColor: '#e0e0e0',
                                                        '& .MuiLinearProgress-bar': {
                                                            borderRadius: 12,
                                                            backgroundColor: '#1976d2',
                                                        },
                                                    }}
                                                />
                                            </Box>
                                            <Typography variant='body2' sx={{ minWidth: 160, textAlign: 'right' }}>
                                                ${formatMicroAmount(pool.raised)} / ${formatMicroAmount(pool.target)}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                            {(safeBigInt(pool.target) > 0n
                                                ? Number((safeBigInt(pool.raised) * 10000n) / safeBigInt(pool.target)) / 100
                                                : 0
                                            ).toFixed(1)}% funded
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}

                        <Grid item xs={12} md={4}>
                            <Card sx={{ height: '100%' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Typography variant="h6">Pool Composition</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                        bluechip vs {pool.tokenSymbol} reserves
                                    </Typography>
                                    <PoolPieChart
                                        reserve0={pool.reserve0}
                                        reserve1={pool.reserve1}
                                        tokenSymbol={pool.tokenSymbol}
                                        tokenDecimals={pool.tokenDecimals}
                                    />
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={8}>
                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Total Liquidity" value={formatMicroAmount(pool.totalLiquidity)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Reserve (bluechip)" value={formatMicroAmount(pool.reserve0)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label={`Reserve (${pool.tokenSymbol})`} value={formatMicroAmount(pool.reserve1)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="LP Positions" value={pool.totalPositions} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Fees Collected (bluechip)" value={formatMicroAmount(pool.totalFeesCollected0)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label={`Fees Collected (${pool.tokenSymbol})`} value={formatMicroAmount(pool.totalFeesCollected1)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Total Committers" value={pool.totalCommitters} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Token Supply" value={formatMicroAmount(pool.totalSupply, pool.tokenDecimals)} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Avg Commit Size" value={avgCommit} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <StatCard label="Largest Commit" value={largestCommit} />
                                </Grid>
                                {committers.length >= 2 && (
                                    <Grid item xs={6} sm={3}>
                                        <StatCard label="Commit Velocity" value={computeCommitVelocity(committers)} />
                                    </Grid>
                                )}
                                {pool.thresholdReached && marketCap !== '-' && (
                                    <Grid item xs={6} sm={3}>
                                        <StatCard label="Market Cap" value={`${marketCap} BLC`} />
                                    </Grid>
                                )}
                                {pool.thresholdReached && feeApr !== '-' && (
                                    <Grid item xs={6} sm={3}>
                                        <StatCard label="Fee APR" value={feeApr} />
                                    </Grid>
                                )}
                            </Grid>
                        </Grid>

                        {/* Operational state: paused / payout distribution */}
                        <Grid item xs={12} md={8}>
                            <PoolStatusBanners poolAddress={pool.poolAddress} tokenSymbol={pool.tokenSymbol} />
                        </Grid>

                        {/* Time-series history (price/volume/trades) via the indexer */}
                        <Grid item xs={12} md={8}>
                            <PoolHistoryPanel poolAddress={pool.poolAddress} tokenSymbol={pool.tokenSymbol} />
                        </Grid>

                        {/* On-Chain Analytics from Analytics query */}
                        {analytics && (
                            <Grid item xs={12} md={8}>
                                <Card>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                            <BarChartIcon color="primary" fontSize="small" />
                                            <Typography variant="h6">On-Chain Analytics</Typography>
                                        </Box>
                                        <Grid container spacing={2}>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="Total Swaps" value={analytics.analytics.total_swap_count} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="Total Commits" value={analytics.analytics.total_commit_count} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="Volume (bluechip)" value={formatMicroAmount(analytics.analytics.total_volume_0)} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label={`Volume (${pool?.tokenSymbol || 'Token'})`} value={formatMicroAmount(analytics.analytics.total_volume_1)} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="LP Deposits" value={analytics.analytics.total_lp_deposit_count} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="LP Withdrawals" value={analytics.analytics.total_lp_withdrawal_count} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="Unclaimed Fees (BLC)" value={formatMicroAmount(analytics.fee_reserve_0)} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label={`Unclaimed Fees (${pool?.tokenSymbol || 'Token'})`} value={formatMicroAmount(analytics.fee_reserve_1)} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="USD Raised" value={'$' + formatMicroAmount(analytics.total_usd_raised)} />
                                            </Grid>
                                            <Grid item xs={6} sm={3}>
                                                <StatCard label="bluechip Raised" value={formatMicroAmount(analytics.total_bluechip_raised)} />
                                            </Grid>
                                            {analytics.analytics.last_trade_timestamp > 0 && (
                                                <Grid item xs={6} sm={3}>
                                                    <StatCard
                                                        label="Last Trade"
                                                        value={timeAgo(analytics.analytics.last_trade_timestamp)}
                                                    />
                                                </Grid>
                                            )}
                                            {analytics.analytics.last_trade_block > 0 && (
                                                <Grid item xs={6} sm={3}>
                                                    <StatCard label="Last Trade Block" value={`#${analytics.analytics.last_trade_block.toLocaleString()}`} />
                                                </Grid>
                                            )}
                                        </Grid>
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}

                        {/* Indexer Placeholder: Historical Data (requires indexer) */}
                        <Grid item xs={12} md={8}>
                            <Card sx={{ border: '1px dashed', borderColor: 'divider', opacity: 0.7 }}>
                                <CardContent>
                                    <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                                        Historical Data
                                    </Typography>
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        The following sections require an indexer to track historical state changes over time.
                                        On-chain queries only provide current state — time-series data needs event indexing.
                                    </Alert>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Price History Chart</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from swap events</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Volume Over Time</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from swap events</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Trade History Table</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from swap events (price, amount, sender, block)</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Commit History Timeline</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from commit events</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Liquidity Add/Remove History</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from LP events</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Card variant="outlined" sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                                                    <Typography variant="body2" color="text.disabled">Fee Accrual Over Time</Typography>
                                                    <Typography variant="caption" color="text.disabled">Indexed from fee collection events</Typography>
                                                </Box>
                                            </Card>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>

                        {isCreator && (
                            <Grid item xs={12} md={8}>
                                <Card sx={{ border: '2px solid', borderColor: 'primary.main' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                            <LockIcon color="primary" fontSize="small" />
                                            <Typography variant="h6" color="primary.main">
                                                Creator Insights
                                            </Typography>
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Only visible to you as the pool creator.
                                        </Typography>
                                        <Grid container spacing={2}>
                                            <Grid item xs={6} sm={4}>
                                                <StatCard
                                                    label="Your Fee Revenue (5%)"
                                                    value={computeCreatorFeeRevenue(committers, 0.05)}
                                                    highlight
                                                />
                                            </Grid>
                                            <Grid item xs={6} sm={4}>
                                                <StatCard
                                                    label="Platform Fee (1%)"
                                                    value={computeCreatorFeeRevenue(committers, 0.01)}
                                                />
                                            </Grid>
                                            <Grid item xs={6} sm={4}>
                                                <StatCard
                                                    label="Net to Pool"
                                                    value={computeCreatorFeeRevenue(committers, 0.94)}
                                                />
                                            </Grid>
                                            {!pool.thresholdReached && (
                                                <>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Commit Velocity" value={computeCommitVelocity(committers)} highlight />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard
                                                            label="Est. Time to Threshold"
                                                            value={computeEstimatedTimeToThreshold(pool.raised, pool.target, committers)}
                                                            highlight
                                                        />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Unique Committers" value={committers.length} />
                                                    </Grid>
                                                </>
                                            )}
                                            {pool.thresholdReached && (
                                                <>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Market Cap" value={`${marketCap} BLC`} highlight />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Fee APR (LP Incentive)" value={feeApr} highlight />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Active LP Positions" value={pool.totalPositions} />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Trading Fees (bluechip)" value={formatMicroAmount(pool.totalFeesCollected0)} />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label={`Trading Fees (${pool.tokenSymbol})`} value={formatMicroAmount(pool.totalFeesCollected1)} />
                                                    </Grid>
                                                    <Grid item xs={6} sm={4}>
                                                        <StatCard label="Total Committers" value={pool.totalCommitters} />
                                                    </Grid>
                                                </>
                                            )}
                                        </Grid>

                                        {!pool.thresholdReached && (
                                            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                                                    When Threshold is Reached
                                                </Typography>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                    {[
                                                        { label: 'Creator Reward', value: '$325,000' },
                                                        { label: 'Pool Seed Liquidity', value: '$350,000' },
                                                        { label: 'Returned to Committers', value: '$500,000' },
                                                        { label: 'Platform Fee', value: '$25,000' },
                                                    ].map((item) => (
                                                        <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{item.value}</Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}

                        {committers.length > 0 && (
                            <Grid item xs={12} md={8}>
                                <Typography variant="h6" sx={{ mb: 1 }}>Committer Leaderboard</Typography>
                                <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                                    <TableContainer sx={{ maxHeight: 440 }}>
                                        <Table stickyHeader size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ width: 50 }}>Rank</TableCell>
                                                    <TableCell>Wallet</TableCell>
                                                    <TableCell>Total Paid (USD)</TableCell>
                                                    <TableCell>Total Paid (Bluechip)</TableCell>
                                                    <TableCell>Last Payment (USD)</TableCell>
                                                    <TableCell>% of Total</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {(() => {
                                                    const sorted = [...committers].sort(
                                                        (a, b) => compareMicro(b.total_paid_usd, a.total_paid_usd)
                                                    );
                                                    const grandTotal = sorted.reduce<bigint>(
                                                        (sum, c) => sum + safeBigInt(c.total_paid_usd), 0n
                                                    );
                                                    return sorted.map((c, idx) => {
                                                        const pct = grandTotal > 0n
                                                            ? (Number((safeBigInt(c.total_paid_usd) * 10000n) / grandTotal) / 100).toFixed(1)
                                                            : '0';
                                                        return (
                                                            <TableRow key={c.wallet} hover>
                                                                <TableCell>
                                                                    <Typography
                                                                        variant="body2"
                                                                        fontWeight="bold"
                                                                        color={
                                                                            idx === 0 ? 'warning.main'
                                                                                : idx === 1 ? 'text.secondary'
                                                                                    : idx === 2 ? '#cd7f32'
                                                                                        : 'text.primary'
                                                                        }
                                                                    >
                                                                        #{idx + 1}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <CopyableId value={c.wallet}><Link to={`/wallet/${c.wallet}`}>{abbreviateAddress(c.wallet)}</Link></CopyableId>
                                                                </TableCell>
                                                                <TableCell>${formatMicroAmount(c.total_paid_usd)}</TableCell>
                                                                <TableCell>{formatMicroAmount(c.total_paid_bluechip)}</TableCell>
                                                                <TableCell>${formatMicroAmount(c.last_payment_usd)}</TableCell>
                                                                <TableCell>{pct}%</TableCell>
                                                            </TableRow>
                                                        );
                                                    });
                                                })()}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Paper>
                            </Grid>
                        )}
                    </>
                )}
        </PageShell>
    );
};

export default CreatorPoolPage;
