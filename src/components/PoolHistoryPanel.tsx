import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    fetchPriceSeries,
    fetchRecentTrades,
    fetchVolumeSeries,
    indexerHealth,
    IndexedTrade,
    PricePoint,
    VolumePoint,
} from '../utils/indexerApi';
import { formatMicroAmount } from '../utils/contractQueries';
import { sanitizeOnChainString } from '../utils/security';

type Range = '24h' | '7d' | '30d';

const RANGES: Record<Range, { seconds: number; bucket: number }> = {
    '24h': { seconds: 86_400, bucket: 3_600 },        // hourly
    '7d': { seconds: 7 * 86_400, bucket: 21_600 },    // 6-hourly
    '30d': { seconds: 30 * 86_400, bucket: 86_400 },  // daily
};

interface ChartRow {
    t: number;
    label: string;
    close: number | null;
    volume: number | null;      // whole OSMO
    buyVolume: number | null;
    sellVolume: number | null;
}

function buildRows(range: Range, prices: PricePoint[], volumes: VolumePoint[]): ChartRow[] {
    const byT = new Map<number, ChartRow>();
    const label = (t: number) => {
        const d = new Date(t * 1000);
        return range === '24h'
            ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    for (const p of prices) {
        byT.set(p.t, {
            t: p.t, label: label(p.t), close: p.close,
            volume: p.volume_bluechip / 1e6, buyVolume: null, sellVolume: null,
        });
    }
    for (const v of volumes) {
        const row = byT.get(v.t) ?? { t: v.t, label: label(v.t), close: null, volume: null, buyVolume: null, sellVolume: null };
        row.buyVolume = v.buy_volume_bluechip / 1e6;
        row.sellVolume = v.sell_volume_bluechip / 1e6;
        if (row.volume === null) row.volume = (v.buy_volume_bluechip + v.sell_volume_bluechip) / 1e6;
        byT.set(v.t, row);
    }
    return Array.from(byT.values()).sort((a, b) => a.t - b.t);
}

const PoolHistoryPanel: React.FC<{ poolAddress: string; tokenSymbol?: string }> = ({ poolAddress, tokenSymbol }) => {
    const [available, setAvailable] = useState<boolean | null>(null);
    const [range, setRange] = useState<Range>('7d');
    const [rows, setRows] = useState<ChartRow[]>([]);
    const [trades, setTrades] = useState<IndexedTrade[]>([]);
    const [loading, setLoading] = useState(false);

    const symbol = sanitizeOnChainString(tokenSymbol, 16) || 'Token';

    useEffect(() => {
        let cancelled = false;
        indexerHealth().then((h) => { if (!cancelled) setAvailable(!!h?.ok); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!available) return;
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const { seconds, bucket } = RANGES[range];
                const to = Math.floor(Date.now() / 1000) + 60;
                const from = to - seconds;
                const [prices, volumes, recent] = await Promise.all([
                    fetchPriceSeries(poolAddress, bucket, from, to),
                    fetchVolumeSeries(poolAddress, bucket, from, to),
                    fetchRecentTrades(poolAddress, 12),
                ]);
                if (cancelled) return;
                setRows(buildRows(range, prices ?? [], volumes ?? []));
                setTrades(recent ?? []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [available, range, poolAddress]);

    return (
        <Card>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <ShowChartIcon color="primary" fontSize="small" />
                    <Typography variant="h6">Price &amp; Volume History</Typography>
                    {available && (
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={range}
                            onChange={(_, v) => v && setRange(v)}
                            sx={{ ml: 'auto' }}
                        >
                            <ToggleButton value="24h">24H</ToggleButton>
                            <ToggleButton value="7d">7D</ToggleButton>
                            <ToggleButton value="30d">30D</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                </Box>

                {available === null && (
                    <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={22} /></Box>
                )}

                {available === false && (
                    <Alert severity="info">
                        Time-series data needs the BlueChip indexer, which isn't reachable right now.
                        Run it from <code>indexer/</code> in this repository (see its README) and set
                        <code> REACT_APP_INDEXER_URL</code> if it isn't on the default port.
                    </Alert>
                )}

                {available && (
                    <>
                        {loading && rows.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={22} /></Box>
                        ) : rows.length === 0 ? (
                            <Alert severity="info">
                                No indexed trades for this pool in the selected window yet. Trading
                                history appears here once the pool has post-threshold activity.
                            </Alert>
                        ) : (
                            <Box sx={{ height: 280, width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={rows} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="4 4" opacity={0.4} />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                                        <YAxis yAxisId="price" orientation="left" tick={{ fontSize: 11 }}
                                            domain={['auto', 'auto']} width={64} />
                                        <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 11 }} width={56} />
                                        <Tooltip
                                            formatter={(value: any, name: any) => {
                                                if (name === 'Price') return [Number(value).toFixed(6), `Price (OSMO/${symbol})`];
                                                return [Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }), name];
                                            }}
                                        />
                                        <Bar yAxisId="vol" dataKey="buyVolume" name="Buy Volume" stackId="v" fill="#4caf50" opacity={0.55} />
                                        <Bar yAxisId="vol" dataKey="sellVolume" name="Sell Volume" stackId="v" fill="#ef5350" opacity={0.55} />
                                        <Line yAxisId="price" type="monotone" dataKey="close" name="Price"
                                            stroke="#1976d2" strokeWidth={2} dot={false} connectNulls />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </Box>
                        )}

                        {trades.length > 0 && (
                            <>
                                <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
                                    Recent Trades
                                </Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Time</TableCell>
                                            <TableCell>Side</TableCell>
                                            <TableCell align="right">OSMO</TableCell>
                                            <TableCell align="right">{symbol}</TableCell>
                                            <TableCell align="right">Price</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {trades.map((t) => {
                                            const bluechip = t.side === 'buy' ? t.offer_amount : t.return_amount;
                                            const token = t.side === 'buy' ? t.return_amount : t.offer_amount;
                                            return (
                                                <TableRow key={`${t.txhash}-${t.ts}`}>
                                                    <TableCell>{new Date(t.ts * 1000).toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size="small"
                                                            label={t.source === 'commit' ? 'commit' : t.side}
                                                            color={t.side === 'buy' ? 'success' : 'error'}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right">{formatMicroAmount(bluechip ?? '0')}</TableCell>
                                                    <TableCell align="right">{formatMicroAmount(token ?? '0')}</TableCell>
                                                    <TableCell align="right">{t.price !== null ? t.price.toFixed(6) : '-'}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default PoolHistoryPanel;
