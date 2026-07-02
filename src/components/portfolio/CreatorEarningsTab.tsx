import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PaidIcon from '@mui/icons-material/Paid';
import LockClockIcon from '@mui/icons-material/LockClock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useWallet } from '../../context/WalletContext';
import {
    CreatorEarningsResponse,
    DistributionStateResponse,
    FactoryNotifyStatusResponse,
    PoolSummary,
    formatMicroAmount,
    queryCreatorEarnings,
    queryDistributionState,
    queryFactoryNotifyStatus,
    queryPoolCommits,
    queryPoolIsPaused,
} from '../../utils/contractQueries';
import { safeBigInt } from '../../utils/bigintMath';
import { nsToDate } from '../../utils/datetime';
import { fetchCreatorStatement, indexerHealth } from '../../utils/indexerApi';
import {
    assertWalletOnExpectedChain,
    humanizeContractError,
    sanitizeOnChainString,
} from '../../utils/security';

// Creator share of every commit (commit_fee_creator = 5%), in basis points.
const CREATOR_COMMIT_FEE_BPS = 500n;
// Creator tokens granted to the creator wallet at threshold crossing
// (THRESHOLD_PAYOUT_CREATOR_BASE_UNITS, 6-decimal base units).
const CREATOR_THRESHOLD_GRANT_MICRO = 325_000_000_000n;

interface CreatorEarningsTabProps {
    // Every pool created by the connected wallet (feeds the CSV exports).
    pools: PoolSummary[];
    // The pool currently selected in the dropdown (drives the live panels).
    pool: PoolSummary;
}

function commitFeeRevenueMicroUsd(pool: PoolSummary): bigint {
    return (safeBigInt(pool.totalUsdRaised) * CREATOR_COMMIT_FEE_BPS) / 10_000n;
}

// Micro-units → plain decimal string for spreadsheets (no thousands
// separators, full 6-decimal precision).
function microToCsvDecimal(amount: string | bigint | null | undefined): string {
    const n = safeBigInt(amount);
    const whole = n / 1_000_000n;
    const frac = (n % 1_000_000n).toString().padStart(6, '0');
    return `${whole}.${frac}`;
}

function csvEscape(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
    const lines = [header, ...rows].map((r) => r.map(csvEscape).join(','));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const CreatorEarningsTab: React.FC<CreatorEarningsTabProps> = ({ pools, pool }) => {
    const { client, address } = useWallet();
    const [earnings, setEarnings] = useState<CreatorEarningsResponse | null>(null);
    const [distribution, setDistribution] = useState<DistributionStateResponse | null>(null);
    const [paused, setPaused] = useState(false);
    const [notifyStatus, setNotifyStatus] = useState<FactoryNotifyStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [claimStatus, setClaimStatus] = useState('');
    const [claiming, setClaiming] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Per-transaction statements need the time-series indexer.
    const [indexerOk, setIndexerOk] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        indexerHealth().then((h) => { if (!cancelled) setIndexerOk(!!h?.ok); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setClaimStatus('');
            try {
                const [earn, dist, isPaused, notify] = await Promise.all([
                    queryCreatorEarnings(pool.poolAddress),
                    queryDistributionState(pool.poolAddress),
                    queryPoolIsPaused(pool.poolAddress),
                    queryFactoryNotifyStatus(pool.poolAddress),
                ]);
                if (cancelled) return;
                setEarnings(earn);
                setDistribution(dist);
                setPaused(isPaused);
                setNotifyStatus(notify);
            } catch (err) {
                console.error('Error loading creator earnings:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [pool.poolAddress]);

    const symbol = sanitizeOnChainString(pool.tokenSymbol, 16) || 'Token';
    const isCreatorWallet = !!earnings && earnings.creator_wallet_address === address;

    const feeRevenueMicroUsd = commitFeeRevenueMicroUsd(pool);
    const grantValueBluechip = pool.thresholdReached && parseFloat(pool.currentPrice1to0) > 0
        ? 325_000 * parseFloat(pool.currentPrice1to0)
        : null;

    const potBluechip = safeBigInt(earnings?.fee_pot.amount_0);
    const potToken = safeBigInt(earnings?.fee_pot.amount_1);
    const hasClaimableFees = potBluechip > 0n || potToken > 0n;

    const excess = earnings?.excess ?? null;
    const excessUnlockDate = excess ? nsToDate(excess.unlock_time) : null;
    const excessDaysLeft = excessUnlockDate
        ? Math.max(0, Math.ceil((excessUnlockDate.getTime() - Date.now()) / 86_400_000))
        : null;

    // ---- Claim actions (same security gates as the action modals) ----

    const executeClaim = async (kind: 'fees' | 'excess') => {
        if (!client || !address) { setClaimStatus('Error: Connect your wallet first'); return; }

        // SECURITY: Assert chain ID before signing.
        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setClaimStatus(`Error: ${chainCheck.error}`); return; }

        setClaiming(true);
        setClaimStatus(kind === 'fees' ? 'Claiming fees...' : 'Claiming excess liquidity...');
        try {
            const deadlineNs = ((Date.now() + 20 * 60000) * 1000000).toString();
            const msg = kind === 'fees'
                ? { claim_creator_fees: { transaction_deadline: deadlineNs } }
                : { claim_creator_excess_liquidity: { transaction_deadline: deadlineNs } };
            const result = await client.execute(
                address,
                pool.poolAddress,
                msg,
                { amount: [], gas: '400000' },
                kind === 'fees' ? 'Claim Creator Fees' : 'Claim Creator Excess Liquidity',
            );
            setClaimStatus(`Success! Tx: ${result.transactionHash}`);
        } catch (err) {
            setClaimStatus('Error: ' + humanizeContractError(err));
        } finally {
            setClaiming(false);
        }
    };

    // ---- CSV exports ----

    const exportEarningsSummary = async () => {
        setExporting(true);
        try {
            const rows: string[][] = [];
            for (const p of pools) {
                const earn = await queryCreatorEarnings(p.poolAddress);
                rows.push([
                    p.tokenSymbol,
                    p.poolAddress,
                    p.thresholdReached ? 'active' : 'pre-threshold',
                    microToCsvDecimal(p.totalUsdRaised),
                    microToCsvDecimal(commitFeeRevenueMicroUsd(p)),
                    p.thresholdReached ? '325000' : '0',
                    microToCsvDecimal(earn?.fee_pot.amount_0),
                    microToCsvDecimal(earn?.fee_pot.amount_1),
                    microToCsvDecimal(earn?.excess?.bluechip_amount),
                    microToCsvDecimal(earn?.excess?.token_amount),
                    earn?.excess ? (nsToDate(earn.excess.unlock_time)?.toISOString() ?? '') : '',
                    String(p.totalCommitters),
                ]);
            }
            downloadCsv(
                `bluechip-creator-earnings-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                    'token_symbol', 'pool_address', 'status',
                    'total_usd_raised', 'commit_fee_revenue_usd_est', 'threshold_grant_tokens',
                    'claimable_fees_bluechip', 'claimable_fees_token',
                    'locked_excess_bluechip', 'locked_excess_token', 'excess_unlock_utc',
                    'subscribers',
                ],
                rows,
            );
        } finally {
            setExporting(false);
        }
    };

    const exportSupporterLedger = async () => {
        setExporting(true);
        try {
            const rows: string[][] = [];
            for (const p of pools) {
                const commits = await queryPoolCommits(p.poolAddress);
                for (const c of commits?.committers ?? []) {
                    const last = nsToDate(c.last_committed);
                    rows.push([
                        p.tokenSymbol,
                        p.poolAddress,
                        c.wallet,
                        microToCsvDecimal(c.total_paid_usd),
                        microToCsvDecimal(c.total_paid_bluechip),
                        microToCsvDecimal(c.last_payment_usd),
                        microToCsvDecimal(c.last_payment_bluechip),
                        last ? last.toISOString() : '',
                    ]);
                }
            }
            downloadCsv(
                `bluechip-supporter-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                    'token_symbol', 'pool_address', 'supporter_wallet',
                    'total_paid_usd', 'total_paid_bluechip',
                    'last_payment_usd', 'last_payment_bluechip', 'last_committed_utc',
                ],
                rows,
            );
        } finally {
            setExporting(false);
        }
    };

    // Transaction-level income statement from the indexer: the creator's
    // fee share of every individual commit plus claim payouts, with block
    // timestamps — the bookkeeping-grade export the on-chain cumulative
    // ledger can't provide.
    const exportPerTxStatement = async () => {
        setExporting(true);
        try {
            const rows: string[][] = [];
            for (const p of pools) {
                const lines = await fetchCreatorStatement(p.poolAddress);
                for (const ln of lines ?? []) {
                    rows.push([
                        new Date(ln.ts * 1000).toISOString(),
                        p.tokenSymbol,
                        p.poolAddress,
                        ln.type,
                        ln.counterparty ?? '',
                        ln.phase ?? '',
                        microToCsvDecimal(ln.gross_usd),
                        microToCsvDecimal(ln.fee_share_usd),
                        microToCsvDecimal(ln.amount_0),
                        microToCsvDecimal(ln.amount_1),
                        ln.txhash,
                    ]);
                }
            }
            downloadCsv(
                `bluechip-creator-statement-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                    'timestamp_utc', 'token_symbol', 'pool_address', 'type',
                    'counterparty', 'phase', 'gross_commit_usd', 'creator_fee_share_usd',
                    'claim_bluechip', 'claim_token', 'txhash',
                ],
                rows,
            );
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Loading earnings...</Typography>
            </Box>
        );
    }

    // ---- Operational alerts for the selected pool ----
    const alerts: { severity: 'error' | 'warning' | 'info'; text: string }[] = [];
    if (paused) {
        alerts.push({
            severity: 'error',
            text: 'This pool is PAUSED — commits, swaps, and liquidity actions are currently rejected on-chain.',
        });
    }
    if (distribution?.is_stalled) {
        alerts.push({
            severity: 'error',
            text: `Threshold payout distribution is STALLED with ${distribution.distributions_remaining} supporter payouts remaining. The pool admin needs to run stuck-state recovery before payouts can resume.`,
        });
    } else if (distribution?.is_distributing) {
        alerts.push({
            severity: 'info',
            text: `Threshold payout distribution in progress: ${distribution.distributions_remaining} supporter payouts remaining (${formatMicroAmount(distribution.distributed_so_far)} of ${formatMicroAmount(distribution.total_to_distribute)} ${symbol} minted so far).`,
        });
    }
    if (notifyStatus?.pending) {
        alerts.push({
            severity: 'warning',
            text: 'A factory notification from this pool is pending retry. Threshold-related processing may be delayed until it lands (anyone can call retry_factory_notify).',
        });
    }

    return (
        <Stack spacing={2}>
            {/* ---- Revenue summary ---- */}
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">Commit Fee Revenue (est.)</Typography>
                            <Typography variant="h6" fontWeight="bold">${formatMicroAmount(feeRevenueMicroUsd.toString())}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Your 5% share of ${formatMicroAmount(pool.totalUsdRaised)} gross commits
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">Threshold Grant</Typography>
                            <Typography variant="h6" fontWeight="bold">
                                {pool.thresholdReached ? `325,000 ${symbol}` : '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {pool.thresholdReached
                                    ? grantValueBluechip
                                        ? `≈ ${grantValueBluechip.toLocaleString(undefined, { maximumFractionDigits: 0 })} bluechip at current price`
                                        : 'Granted at threshold crossing'
                                    : `Granted when the pool crosses its threshold`}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">Claimable Now</Typography>
                            <Typography variant="h6" fontWeight="bold">
                                {hasClaimableFees
                                    ? `${formatMicroAmount(potBluechip.toString())} bluechip`
                                    : '0'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {hasClaimableFees
                                    ? `+ ${formatMicroAmount(potToken.toString())} ${symbol} in LP fee clips`
                                    : 'No unclaimed creator fees'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">Locked Excess</Typography>
                            <Typography variant="h6" fontWeight="bold">
                                {excess ? `${formatMicroAmount(excess.bluechip_amount)} bluechip` : '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {excess
                                    ? excess.claimable_now
                                        ? 'Unlocked — claim below'
                                        : `+ ${formatMicroAmount(excess.token_amount)} ${symbol} · unlocks in ${excessDaysLeft} day${excessDaysLeft === 1 ? '' : 's'}`
                                    : 'No excess liquidity position'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ---- Operational alerts ---- */}
            <Box>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Pool Health</Typography>
                {alerts.length === 0 ? (
                    <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />}>
                        No operational issues detected for this pool.
                    </Alert>
                ) : (
                    <Stack spacing={1}>
                        {alerts.map((a, i) => <Alert key={i} severity={a.severity}>{a.text}</Alert>)}
                    </Stack>
                )}
            </Box>

            <Divider />

            {/* ---- Claimables ---- */}
            <Box>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Claims</Typography>
                {!isCreatorWallet && earnings && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                        Claims pay out to the pool's configured creator wallet
                        ({earnings.creator_wallet_address.slice(0, 14)}...), which is not the connected
                        wallet — the contract will reject claim transactions from this address.
                    </Alert>
                )}
                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <PaidIcon color={hasClaimableFees ? 'success' : 'disabled'} />
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                            <Typography variant="body2" fontWeight="bold">Creator fee pot</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatMicroAmount(potBluechip.toString())} bluechip + {formatMicroAmount(potToken.toString())} {symbol}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            disabled={!hasClaimableFees || claiming || !client}
                            onClick={() => executeClaim('fees')}
                        >
                            Claim Fees
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <LockClockIcon color={excess?.claimable_now ? 'success' : 'disabled'} />
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                            <Typography variant="body2" fontWeight="bold">Excess liquidity</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {excess
                                    ? `${formatMicroAmount(excess.bluechip_amount)} bluechip + ${formatMicroAmount(excess.token_amount)} ${symbol}` +
                                      (excess.claimable_now
                                          ? ' — unlocked'
                                          : ` — unlocks ${excessUnlockDate?.toLocaleDateString()} (${excessDaysLeft} day${excessDaysLeft === 1 ? '' : 's'})`)
                                    : 'None recorded for this pool'}
                            </Typography>
                        </Box>
                        <Tooltip title={excess && !excess.claimable_now ? 'Still time-locked by the contract' : ''}>
                            <span>
                                <Button
                                    size="small"
                                    variant="contained"
                                    disabled={!excess || !excess.claimable_now || claiming || !client}
                                    onClick={() => executeClaim('excess')}
                                >
                                    Claim Excess
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>
                    {claimStatus && (
                        <Alert severity={claimStatus.startsWith('Success') ? 'success' : claimStatus.startsWith('Error') ? 'error' : 'info'}>
                            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{claimStatus}</Typography>
                        </Alert>
                    )}
                </Stack>
            </Box>

            <Divider />

            {/* ---- Exports ---- */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" fontWeight="bold">Bookkeeping Exports</Typography>
                    <Chip size="small" variant="outlined" label={`${pools.length} pool${pools.length === 1 ? '' : 's'}`} />
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={exporting ? <CircularProgress size={14} /> : <DownloadIcon />}
                        disabled={exporting}
                        onClick={exportEarningsSummary}
                    >
                        Earnings Summary (CSV)
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={exporting ? <CircularProgress size={14} /> : <DownloadIcon />}
                        disabled={exporting}
                        onClick={exportSupporterLedger}
                    >
                        Supporter Ledger (CSV)
                    </Button>
                    <Tooltip title={indexerOk === false
                        ? 'Requires the time-series indexer (see indexer/README.md in this repo)'
                        : ''}>
                        <span>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={exporting ? <CircularProgress size={14} /> : <DownloadIcon />}
                                disabled={exporting || !indexerOk}
                                onClick={exportPerTxStatement}
                            >
                                Per-Transaction Statement (CSV)
                            </Button>
                        </span>
                    </Tooltip>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Amounts are in whole units (USD and tokens, 6-decimal precision). The supporter ledger
                    reflects current on-chain totals per wallet; the per-transaction statement comes from the
                    indexer and lists every commit's fee share and every claim payout with block timestamps.
                </Typography>
            </Box>
        </Stack>
    );
};

export default CreatorEarningsTab;
