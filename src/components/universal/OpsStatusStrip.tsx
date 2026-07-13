import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Tooltip, Typography } from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import {
    fetchAllPoolSummaries,
    formatMicroAmount,
    queryDistributionState,
    queryFactoryNotifyStatus,
    queryNativeUsdRate,
} from '../../utils/contractQueries';
import { indexerHealth } from '../../utils/indexerApi';
import { NATIVE_SYMBOL } from '../../defi/types';
import { factoryAddress } from './IndividualPage.const';

// Protocol-health strip for the front page. Commits are valued through
// the factory's on-chain TWAP (Osmosis x/twap over the configured
// OSMO/USD-stable pool) and fail closed when that query errors, so
// surfacing these signals publicly turns "the site is broken" support
// pings into "the price query is down / a distribution is stalled".

// How many crossed pools to health-scan (keeps front-page load bounded).
const POOL_SCAN_CAP = 12;

type Tone = 'success' | 'warning' | 'error' | 'default';

interface StripState {
    // micro-USD per native token; null = TWAP query failing.
    twapRate: string | null;
    pendingNotifies: number;
    stalledDistributions: number;
    activeDistributions: number;
    indexerHeight: number | null;
    loaded: boolean;
}

const EMPTY: StripState = {
    twapRate: null,
    pendingNotifies: 0, stalledDistributions: 0, activeDistributions: 0,
    indexerHeight: null, loaded: false,
};

const OpsStatusStrip: React.FC = () => {
    const [s, setS] = useState<StripState>(EMPTY);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const [rate, idx, pools] = await Promise.all([
                queryNativeUsdRate(),
                indexerHealth(),
                fetchAllPoolSummaries(factoryAddress).catch(() => []),
            ]);

            const crossed = pools.filter((p) => p.thresholdReached).slice(0, POOL_SCAN_CAP);
            const healths = await Promise.all(crossed.map(async (p) => {
                const [notify, dist] = await Promise.all([
                    queryFactoryNotifyStatus(p.poolAddress),
                    queryDistributionState(p.poolAddress),
                ]);
                return { pending: !!notify.pending, dist };
            }));

            if (cancelled) return;
            setS({
                twapRate: rate?.rate_used ?? null,
                pendingNotifies: healths.filter((h) => h.pending).length,
                stalledDistributions: healths.filter((h) => h.dist?.is_stalled).length,
                activeDistributions: healths.filter((h) => h.dist?.is_distributing && !h.dist.is_stalled).length,
                indexerHeight: idx?.lastIndexedHeight ?? null,
                loaded: true,
            });
        }
        load();
        const interval = setInterval(load, 60_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    if (!s.loaded) return null;

    // The TWAP is computed live on-chain at query time, so the only
    // unhealthy state is the query itself failing (commits fail closed).
    const priceTone: Tone = s.twapRate === null ? 'error' : 'success';
    const priceLabel = s.twapRate === null
        ? `${NATIVE_SYMBOL}/USD: unavailable`
        : `${NATIVE_SYMBOL}/USD: $${formatMicroAmount(s.twapRate, 6, 4)}`;
    const priceTip = s.twapRate === null
        ? `The factory's ${NATIVE_SYMBOL}/USD TWAP query is failing — commits are valued through it and are being rejected until it recovers.`
        : `Live ${NATIVE_SYMBOL}/USD rate from the factory's on-chain TWAP (Osmosis x/twap over the configured pricing pool). Computed fresh every query — no keeper or staleness window.`;

    const payoutsTone: Tone = s.stalledDistributions > 0 ? 'error'
        : s.activeDistributions > 0 ? 'warning' : 'success';
    const payoutsLabel = s.stalledDistributions > 0
        ? `Payouts: ${s.stalledDistributions} stalled`
        : s.activeDistributions > 0
            ? `Payouts: ${s.activeDistributions} in progress`
            : 'Payouts: clear';
    const payoutsTip = 'Post-threshold supporter payouts across active pools. Stalled distributions need keeper/admin recovery; in-progress ones clear in batches.';

    const notifyTone: Tone = s.pendingNotifies > 0 ? 'warning' : 'success';
    const notifyLabel = s.pendingNotifies > 0
        ? `Notifies: ${s.pendingNotifies} pending`
        : 'Notifies: clear';
    const notifyTip = 'Factory notifications from threshold crossings awaiting retry. Anyone can call retry_factory_notify to clear them.';

    const indexerTone: Tone = s.indexerHeight === null ? 'default' : 'success';
    const indexerLabel = s.indexerHeight === null ? 'Indexer: offline' : `Indexer: #${s.indexerHeight}`;
    const indexerTip = s.indexerHeight === null
        ? 'No time-series indexer reachable — charts and history panels are disabled; live data is unaffected.'
        : 'Last block height ingested by the time-series indexer.';

    const chips: { label: string; tone: Tone; tip: string }[] = [
        { label: priceLabel, tone: priceTone, tip: priceTip },
        { label: payoutsLabel, tone: payoutsTone, tip: payoutsTip },
        { label: notifyLabel, tone: notifyTone, tip: notifyTip },
        { label: indexerLabel, tone: indexerTone, tip: indexerTip },
    ];

    return (
        <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <MonitorHeartIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" sx={{ mr: 1 }}>Protocol Health</Typography>
                    {chips.map((c) => (
                        <Tooltip key={c.label} title={c.tip} arrow>
                            <Chip
                                size="small"
                                label={c.label}
                                color={c.tone === 'default' ? undefined : c.tone}
                                variant={c.tone === 'success' ? 'outlined' : 'filled'}
                            />
                        </Tooltip>
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
};

export default OpsStatusStrip;
