import React, { useEffect, useState } from 'react';
import { PoolStatusChip } from './universal/tablePrimitives';
import {
    Box,
    Card,
    CardContent,
    Chip,
    Divider,
    Grid,
    LinearProgress,
    MenuItem,
    Select,
    SelectChangeEvent,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PieChartIcon from '@mui/icons-material/PieChart';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LockIcon from '@mui/icons-material/Lock';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
    abbreviateAddress,
    CommitterInfo,
    formatMicroAmount,
    HolderDistribution,
    PoolAnalyticsResponse,
    PoolSummary,
    queryHolderDistribution,
    queryPoolAnalytics,
    queryPoolCommits,
    queryThresholdAnalytics,
    ThresholdAnalytics,
} from '../utils/contractQueries';
import { microToNumber, safeBigInt } from '../utils/bigintMath';
import { timeAgo } from '../utils/datetime';

type TimePeriod = '1m' | '3m' | '1y';

const PERIOD_LABELS: Record<TimePeriod, string> = {
    '1m': '1 Month',
    '3m': '3 Months',
    '1y': '1 Year',
};

const PERIOD_MS: Record<TimePeriod, number> = {
    '1m': 30 * 86400000,
    '3m': 90 * 86400000,
    '1y': 365 * 86400000,
};

function getActiveSubscribers(committers: CommitterInfo[], period: TimePeriod): number {
    const cutoffMs = BigInt(Date.now() - PERIOD_MS[period]);
    // last_committed is nanoseconds; divide by 1e6 for ms using BigInt to
    // avoid precision loss on timestamps above 2^53.
    return committers.filter(
        (c) => safeBigInt(c.last_committed) / 1_000_000n > cutoffMs
    ).length;
}

export function computeCurrentPrice(pool: PoolSummary): string {
    const r0 = microToNumber(pool.reserve0, 0);
    const r1 = microToNumber(pool.reserve1, 0);
    if (!r0 || !r1) return '-';
    const price = r0 / r1;
    return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function computeCreatorFeeRevenue(pool: PoolSummary): string {
    // Creator earns 5% of commit fees (commit_fee_creator = 0.05) — scale
    // with BigInt to preserve precision on large fee totals.
    const fee0 = safeBigInt(pool.totalFeesCollected0);
    const fee1 = safeBigInt(pool.totalFeesCollected1);
    const creatorShare = ((fee0 + fee1) * 500n) / 10_000n;
    return creatorShare.toString();
}

function computeCirculatingSupply(pool: PoolSummary): {
    circulating: number;
    locked: number;
    total: number;
} {
    // Supply values can exceed 2^53; accept Number-level precision only for
    // the chart/ratio display here — not for any on-chain math.
    const total = microToNumber(pool.totalSupply, 0);
    // Locked = tokens sitting in the pool reserves (reserve1 = creator token side)
    const locked = microToNumber(pool.reserve1, 0);
    const circulating = Math.max(0, total - locked);
    return { circulating, locked, total };
}

const MetricRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    subtext?: string;
    period?: TimePeriod;
    onPeriodChange?: (p: TimePeriod) => void;
    showDropdown?: boolean;
    valueColor?: string;
}> = ({ icon, label, value, subtext, period, onPeriodChange, showDropdown = false, valueColor }) => (
    <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 1.5,
            px: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&:last-child': { borderBottom: 'none' },
        }}
    >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {icon}
            <Box>
                <Typography variant="body2" color="text.secondary">
                    {label}
                </Typography>
                {subtext && (
                    <Typography variant="caption" color="text.disabled">
                        {subtext}
                    </Typography>
                )}
            </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" fontWeight="bold" sx={valueColor ? { color: valueColor } : undefined}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
            {showDropdown && period && onPeriodChange && (
                <Select
                    size="small"
                    value={period}
                    onChange={(e: SelectChangeEvent) => onPeriodChange(e.target.value as TimePeriod)}
                    sx={{ minWidth: 100, fontSize: '0.8rem' }}
                >
                    <MenuItem value="1m">{PERIOD_LABELS['1m']}</MenuItem>
                    <MenuItem value="3m">{PERIOD_LABELS['3m']}</MenuItem>
                    <MenuItem value="1y">{PERIOD_LABELS['1y']}</MenuItem>
                </Select>
            )}
        </Box>
    </Box>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1 }}>
        {icon}
        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {title}
        </Typography>
    </Box>
);

const HolderBar: React.FC<{ distribution: HolderDistribution }> = ({ distribution }) => {
    const { whales, mid, small, totalHolders } = distribution;
    if (totalHolders === 0) return null;
    const whalePct = (whales / totalHolders) * 100;
    const midPct = (mid / totalHolders) * 100;
    const smallPct = (small / totalHolders) * 100;

    return (
        <Box sx={{ px: 2, pb: 1.5 }}>
            <Box sx={{ display: 'flex', height: 12, borderRadius: 1, overflow: 'hidden', mb: 1 }}>
                <Box sx={{ width: `${whalePct}%`, bgcolor: '#f44336', minWidth: whalePct > 0 ? 4 : 0 }} />
                <Box sx={{ width: `${midPct}%`, bgcolor: '#ff9800', minWidth: midPct > 0 ? 4 : 0 }} />
                <Box sx={{ width: `${smallPct}%`, bgcolor: '#4caf50', minWidth: smallPct > 0 ? 4 : 0 }} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f44336' }} />
                    <Typography variant="caption">Whales (60K+): <strong>{whales}</strong></Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ff9800' }} />
                    <Typography variant="caption">Mid (100–60K): <strong>{mid}</strong></Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#4caf50' }} />
                    <Typography variant="caption">Small (&lt;100): <strong>{small}</strong></Typography>
                </Box>
            </Box>
        </Box>
    );
};

const ThresholdSection: React.FC<{
    pool: PoolSummary;
    analytics: ThresholdAnalytics | null;
    committers: CommitterInfo[];
    totalCommitCount: number;
}> = ({ pool, analytics, committers, totalCommitCount }) => {
    const raised = safeBigInt(pool.raised);
    const target = safeBigInt(pool.target);
    const progressPct = target > 0n
        ? Math.min(100, Number((raised * 10000n) / target) / 100)
        : 0;

    if (!pool.thresholdReached) {
        // ── Pre-threshold: show progress bar and live stats ──
        const avgCommitUsd = committers.length > 0
            ? raised / BigInt(committers.length)
            : 0n;

        return (
            <Box>
                <SectionHeader icon={<RocketLaunchIcon fontSize="small" color="warning" />} title="Threshold Progress" />
                <Box sx={{ px: 2, pb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight="bold">
                            ${formatMicroAmount(raised.toString())} raised
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            ${formatMicroAmount(target.toString())} target
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        sx={{ height: 10, borderRadius: 1, mb: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        {progressPct.toFixed(1)}% funded — {committers.length} committer{committers.length !== 1 ? 's' : ''}
                    </Typography>
                </Box>
                <MetricRow
                    icon={<MonetizationOnIcon fontSize="small" color="primary" />}
                    label="Total Committed"
                    value={`$${formatMicroAmount(
                        committers.reduce<bigint>((sum, c) => sum + safeBigInt(c.total_paid_usd), 0n).toString()
                    )}`}
                    subtext="Aggregate of all commit contributions"
                />
                <MetricRow
                    icon={<GroupIcon fontSize="small" color="primary" />}
                    label="Number of Commits"
                    value={totalCommitCount.toLocaleString()}
                    subtext={`${committers.length} unique committer${committers.length !== 1 ? 's' : ''}`}
                />
                {analytics && (
                    <Box>
                        <MetricRow
                            icon={<MonetizationOnIcon fontSize="small" color="action" />}
                            label="Avg Commit Value"
                            value={`$${formatMicroAmount(avgCommitUsd.toString())}`}
                        />
                        <MetricRow
                            icon={<GroupIcon fontSize="small" color="action" />}
                            label="Committer Breakdown"
                            value={`${analytics.walletBreakdown.whaleCommitters}W / ${analytics.walletBreakdown.midCommitters}M / ${analytics.walletBreakdown.smallCommitters}S`}
                            subtext="Whale ($5K+) / Mid ($500–$5K) / Small (<$500)"
                        />
                    </Box>
                )}
            </Box>
        );
    }

    // ── Post-threshold: show crossing analytics ──
    return (
        <Box>
            <SectionHeader icon={<CheckCircleIcon fontSize="small" color="success" />} title="Threshold Achieved" />
            <MetricRow
                icon={<EmojiEventsIcon fontSize="small" sx={{ color: '#ffd700' }} />}
                label="Total Raised"
                value={`$${formatMicroAmount(pool.raised)}`}
                subtext={`Target: $${formatMicroAmount(pool.target)}`}
            />
            <MetricRow
                icon={<MonetizationOnIcon fontSize="small" color="primary" />}
                label="Total Committed"
                value={`$${formatMicroAmount(
                    committers.reduce((sum, c) => sum + parseInt(c.total_paid_usd || '0'), 0).toString()
                )}`}
                subtext="Aggregate of all commit contributions"
            />
            <MetricRow
                icon={<GroupIcon fontSize="small" color="primary" />}
                label="Number of Commits"
                value={totalCommitCount.toLocaleString()}
                subtext={`${committers.length} unique committer${committers.length !== 1 ? 's' : ''}`}
            />
            {analytics && (
                <>
                    {analytics.daysToThreshold !== null && (
                        <MetricRow
                            icon={<RocketLaunchIcon fontSize="small" color="success" />}
                            label="Time to Threshold"
                            value={`${analytics.daysToThreshold} days`}
                            subtext="From pool creation to fully funded"
                        />
                    )}
                    <MetricRow
                        icon={<MonetizationOnIcon fontSize="small" color="action" />}
                        label="Avg Commit to Cross"
                        value={`$${formatMicroAmount(analytics.avgCommitValueUsd)}`}
                        subtext={`${analytics.totalCommittersAtThreshold} committers`}
                    />
                    <MetricRow
                        icon={<GroupIcon fontSize="small" color="action" />}
                        label="Committer Breakdown"
                        value={`${analytics.walletBreakdown.whaleCommitters}W / ${analytics.walletBreakdown.midCommitters}M / ${analytics.walletBreakdown.smallCommitters}S`}
                        subtext="Whale ($5K+) / Mid ($500–$5K) / Small (<$500)"
                    />
                </>
            )}
        </Box>
    );
};

interface TokenPerformanceMetricsProps {
    pool: PoolSummary;
}

const TokenPerformanceMetrics: React.FC<TokenPerformanceMetricsProps> = ({ pool }) => {
    const [period, setPeriod] = useState<TimePeriod>('1m');
    const [committers, setCommitters] = useState<CommitterInfo[]>([]);
    const [totalCommitCount, setTotalCommitCount] = useState<number>(0);
    const [holders, setHolders] = useState<HolderDistribution | null>(null);
    const [thresholdAnalytics, setThresholdAnalytics] = useState<ThresholdAnalytics | null>(null);
    const [onChainAnalytics, setOnChainAnalytics] = useState<PoolAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const [commitData, holderData, analyticsData] = await Promise.all([
                    queryPoolCommits(pool.poolAddress),
                    pool.creatorTokenAddress
                        ? queryHolderDistribution(pool.creatorTokenAddress)
                        : Promise.resolve(null),
                    queryPoolAnalytics(pool.poolAddress),
                ]);

                if (cancelled) return;
                const fetchedCommitters = commitData?.committers || [];
                setCommitters(fetchedCommitters);
                // Total commit transactions come from the Analytics query.
                // PoolCommits' page_count is just the size of the returned
                // page of unique committers, not a commit-transaction total.
                setTotalCommitCount(
                    analyticsData?.analytics.total_commit_count ?? fetchedCommitters.length
                );
                setHolders(holderData);
                setOnChainAnalytics(analyticsData);

                const threshold = await queryThresholdAnalytics(pool.poolAddress, fetchedCommitters);
                if (!cancelled) setThresholdAnalytics(threshold);
            } catch (err) {
                console.error('Error loading performance metrics:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [pool.poolAddress, pool.creatorTokenAddress]);

    // ── Computed values ──
    const currentPrice = onChainAnalytics && onChainAnalytics.current_price_1_to_0 !== '0'
        ? parseFloat(onChainAnalytics.current_price_1_to_0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
        : computeCurrentPrice(pool);
    const activeSubscribers = getActiveSubscribers(committers, period);
    const totalSubscribers = pool.totalCommitters;
    const creatorFeeRevenue = computeCreatorFeeRevenue(pool);
    const supply = computeCirculatingSupply(pool);

    const avgCommitSize = committers.length > 0
        ? (
              committers.reduce<bigint>((s, c) => s + safeBigInt(c.total_paid_usd), 0n) / BigInt(committers.length)
          ).toString()
        : '0';

    const avgLiquidityPosition = pool.totalPositions > 0
        ? (safeBigInt(pool.totalLiquidity) / BigInt(pool.totalPositions)).toString()
        : '0';

    const totalFeesProduced = (
        safeBigInt(pool.totalFeesCollected0) + safeBigInt(pool.totalFeesCollected1)
    ).toString();

    if (loading) {
        return (
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                        {pool.tokenSymbol} — Performance
                    </Typography>
                    <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card variant="outlined">
            <CardContent sx={{ pb: '8px !important' }}>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        {pool.tokenSymbol} — Performance
                    </Typography>
                    <PoolStatusChip thresholdReached={pool.thresholdReached} />
                </Box>


                <SectionHeader icon={<ViewInArIcon fontSize="small" color="action" />} title="Pool Timeline" />
                <MetricRow
                    icon={<ViewInArIcon color="action" />}
                    label="Pool Created"
                    value={`Block #${pool.createdAtBlock.toLocaleString()}`}
                />
                <MetricRow
                    icon={<ViewInArIcon color={pool.thresholdCrossedAtBlock ? 'success' : 'disabled'} />}
                    label="Threshold Crossed"
                    value={pool.thresholdCrossedAtBlock ? `Block #${pool.thresholdCrossedAtBlock.toLocaleString()}` : 'Pending'}
                />

                <Divider sx={{ my: 1 }} />


                <SectionHeader icon={<TrendingUpIcon fontSize="small" color="primary" />} title="Price & Activity" />
                <MetricRow
                    icon={<TrendingUpIcon color="primary" />}
                    label="Token Price"
                    value={pool.thresholdReached ? `${currentPrice} BLC` : 'Pre-threshold'}
                />
                <MetricRow
                    icon={<PersonAddIcon color="success" />}
                    label="Active Subscribers"
                    value={activeSubscribers}
                    subtext="Wallets with commit activity in period"
                    period={period}
                    onPeriodChange={setPeriod}
                    showDropdown
                />
                <MetricRow
                    icon={<GroupIcon color="info" />}
                    label="Total Subscribers"
                    value={totalSubscribers}
                    subtext="All-time unique committers"
                />

                <Divider sx={{ my: 1 }} />


                {holders && (
                    <>
                        <SectionHeader icon={<PieChartIcon fontSize="small" color="secondary" />} title="Holder Distribution" />
                        <MetricRow
                            icon={<GroupIcon color="secondary" />}
                            label="Token Holders"
                            value={holders.totalHolders}
                        />
                        <HolderBar distribution={holders} />

                        {holders.topHolders.length > 0 && (
                            <Box sx={{ px: 2, pb: 1.5 }}>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Top Holders
                                </Typography>
                                <TableContainer sx={{ maxHeight: 200 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ py: 0.5 }}>#</TableCell>
                                                <TableCell sx={{ py: 0.5 }}>Wallet</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5 }}>Balance</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5 }}>% Supply</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {holders.topHolders.map((h, i) => {
                                                const bal = safeBigInt(h.balance);
                                                const totalSupply = safeBigInt(pool.totalSupply);
                                                const pctSupply = totalSupply > 0n
                                                    ? (Number((bal * 10000n) / totalSupply) / 100).toFixed(2)
                                                    : '0';
                                                const tierColor = bal >= 60_000_000_000n ? '#f44336'
                                                    : bal >= 100_000_000n ? '#ff9800'
                                                    : '#4caf50';
                                                return (
                                                    <TableRow key={h.address} hover>
                                                        <TableCell sx={{ py: 0.5 }}>{i + 1}</TableCell>
                                                        <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tierColor, flexShrink: 0 }} />
                                                                {abbreviateAddress(h.address)}
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5 }}>
                                                            {formatMicroAmount(h.balance, pool.tokenDecimals)}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5 }}>{pctSupply}%</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}

                        <Divider sx={{ my: 1 }} />
                    </>
                )}


                <SectionHeader icon={<LockIcon fontSize="small" color="action" />} title="Supply" />
                <Box sx={{ px: 2, pb: 1.5 }}>
                    <Grid container spacing={1}>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary">Total</Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {formatMicroAmount(supply.total.toString(), pool.tokenDecimals)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary">Circulating</Typography>
                                <Typography variant="body2" fontWeight="bold" color="success.main">
                                    {formatMicroAmount(supply.circulating.toString(), pool.tokenDecimals)}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={4}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary">Locked in Pool</Typography>
                                <Typography variant="body2" fontWeight="bold" color="warning.main">
                                    {formatMicroAmount(supply.locked.toString(), pool.tokenDecimals)}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                    {supply.total > 0 && (
                        <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', mt: 1 }}>
                            <Box sx={{ width: `${(supply.circulating / supply.total) * 100}%`, bgcolor: 'success.main' }} />
                            <Box sx={{ width: `${(supply.locked / supply.total) * 100}%`, bgcolor: 'warning.main' }} />
                        </Box>
                    )}
                </Box>

                <Divider sx={{ my: 1 }} />


                <SectionHeader icon={<MonetizationOnIcon fontSize="small" color="success" />} title="Fees & Revenue" />
                <MetricRow
                    icon={<AccountBalanceIcon color="success" />}
                    label="Total Fees Produced"
                    value={formatMicroAmount(totalFeesProduced)}
                    subtext={`bluechip: ${formatMicroAmount(pool.totalFeesCollected0)} | Token: ${formatMicroAmount(pool.totalFeesCollected1)}`}
                />
                <MetricRow
                    icon={<MonetizationOnIcon sx={{ color: '#ffd700' }} />}
                    label="Creator Fee Revenue"
                    value={formatMicroAmount(creatorFeeRevenue)}
                    subtext="5% of commit fees earned by creator"
                />

                <Divider sx={{ my: 1 }} />


                <SectionHeader icon={<WaterDropIcon fontSize="small" color="info" />} title="Pool Metrics" />
                <MetricRow
                    icon={<MonetizationOnIcon color="action" />}
                    label="Avg Commitment Size"
                    value={`$${formatMicroAmount(avgCommitSize)}`}
                    subtext={`Across ${committers.length} committer${committers.length !== 1 ? 's' : ''}`}
                />
                <MetricRow
                    icon={<WaterDropIcon color="info" />}
                    label="Avg Liquidity Position"
                    value={formatMicroAmount(avgLiquidityPosition)}
                    subtext={`${pool.totalPositions} position${pool.totalPositions !== 1 ? 's' : ''} in pool`}
                />

                <Divider sx={{ my: 1 }} />

                {/* On-chain trading activity from Analytics query */}
                {onChainAnalytics && (
                    <>
                        <SectionHeader icon={<SyncAltIcon fontSize="small" color="primary" />} title="Trading Activity (On-Chain)" />
                        <MetricRow
                            icon={<SyncAltIcon color="primary" />}
                            label="Total Swaps"
                            value={onChainAnalytics.analytics.total_swap_count.toLocaleString()}
                            subtext="All-time swap transactions"
                        />
                        <MetricRow
                            icon={<TrendingUpIcon color="action" />}
                            label="Volume (bluechip)"
                            value={formatMicroAmount(onChainAnalytics.analytics.total_volume_0)}
                            subtext="Cumulative bluechip volume through swaps"
                        />
                        <MetricRow
                            icon={<TrendingUpIcon color="action" />}
                            label={`Volume (${pool.tokenSymbol})`}
                            value={formatMicroAmount(onChainAnalytics.analytics.total_volume_1)}
                            subtext="Cumulative creator token volume through swaps"
                        />
                        <MetricRow
                            icon={<WaterDropIcon color="info" />}
                            label="LP Deposits / Withdrawals"
                            value={`${onChainAnalytics.analytics.total_lp_deposit_count} / ${onChainAnalytics.analytics.total_lp_withdrawal_count}`}
                            subtext="Total liquidity add vs remove operations"
                        />
                        <MetricRow
                            icon={<MonetizationOnIcon color="warning" />}
                            label="Unclaimed Fee Reserves"
                            value={`${formatMicroAmount(onChainAnalytics.fee_reserve_0)} BLC / ${formatMicroAmount(onChainAnalytics.fee_reserve_1)} ${pool.tokenSymbol}`}
                            subtext="Fees accrued but not yet collected by LPs"
                        />
                        {onChainAnalytics.analytics.last_trade_timestamp > 0 && (
                            <MetricRow
                                icon={<ViewInArIcon color="action" />}
                                label="Last Trade"
                                value={timeAgo(onChainAnalytics.analytics.last_trade_timestamp)}
                                subtext={`Block #${onChainAnalytics.analytics.last_trade_block.toLocaleString()}`}
                            />
                        )}

                        <Divider sx={{ my: 1 }} />
                    </>
                )}

                <ThresholdSection
                    pool={pool}
                    analytics={thresholdAnalytics}
                    committers={committers}
                    totalCommitCount={totalCommitCount}
                />
            </CardContent>
        </Card>
    );
};

export default TokenPerformanceMetrics;
