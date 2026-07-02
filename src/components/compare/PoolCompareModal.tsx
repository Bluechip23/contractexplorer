import React, { useState } from 'react';
import { PoolStatusChip } from '../universal/tablePrimitives';
import {
    Box,
    Button,
    Checkbox,
    Collapse,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    Grid,
    IconButton,
    Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import TokenPerformanceMetrics from '../TokenPerformanceMetrics';
import FocusMetricCard from './FocusMetricCard';
import { PoolSummary } from '../../utils/contractQueries';
import {
    formatPoolMetric,
    getHighlightMap,
    PoolMetricDef,
    POOL_COMPARE_METRICS,
} from '../portfolio/poolMetrics';

export interface PoolCompareModalProps {
    open: boolean;
    onClose: () => void;
    pools: PoolSummary[];
    /** Dialog title, e.g. "Compare Pools" / "Compare Tokens". */
    title?: string;
    /** Metrics offered in the Further Focus picker and the full compare rows. */
    metrics?: PoolMetricDef[];
    /**
     * Optional shorter list rendered as the full-view quick rows. When set,
     * the full view shows only these (the portfolio view uses this to lead
     * with a summary before the embedded performance panel).
     */
    summaryMetrics?: PoolMetricDef[];
    /** Embed the full TokenPerformanceMetrics panel under each pool. */
    showPerformance?: boolean;
    /** Extra non-highlighted rows appended to each pool's full view. */
    extraRows?: { label: string; value: (pool: PoolSummary) => string }[];
    maxWidth?: 'lg' | 'xl';
}

const PoolHeader: React.FC<{ pool: PoolSummary }> = ({ pool }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight="bold">
            {pool.tokenSymbol}
        </Typography>
        <Typography variant="body2" color="text.secondary">
            {pool.tokenName}
        </Typography>
        <PoolStatusChip thresholdReached={pool.thresholdReached} sx={{ ml: 'auto' }} />
    </Box>
);

/**
 * Side-by-side pool/token comparison with per-metric "highest value"
 * highlighting and a "Further Focus" flow for drilling into a chosen
 * subset of metrics. Shared by the top-pools table, the top-tokens table,
 * and the creator portfolio (which additionally embeds the performance
 * panel per pool).
 */
const PoolCompareModal: React.FC<PoolCompareModalProps> = ({
    open,
    onClose,
    pools,
    title = 'Compare Pools',
    metrics = POOL_COMPARE_METRICS,
    summaryMetrics,
    showPerformance = false,
    extraRows,
    maxWidth = 'lg',
}) => {
    const [focusOpen, setFocusOpen] = useState(false);
    const [focusMetrics, setFocusMetrics] = useState<Set<string>>(new Set());
    const [deepCompare, setDeepCompare] = useState(false);

    const toggleFocusMetric = (key: string) => {
        setFocusMetrics((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const fullViewMetrics = summaryMetrics ?? metrics;
    const highlightMap = getHighlightMap(pools, fullViewMetrics.map((m) => m.key));
    const focusHighlightMap = getHighlightMap(pools, Array.from(focusMetrics));
    const columnWidth = Math.max(4, Math.floor(12 / Math.max(pools.length, 1)));

    return (
        <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight="bold">
                    {title} ({pools.length})
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            {/* Further Focus dropdown */}
            <Box sx={{ px: 3, pb: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FilterListIcon />}
                    endIcon={focusOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    onClick={() => setFocusOpen(!focusOpen)}
                >
                    Further Focus{focusMetrics.size > 0 ? ` (${focusMetrics.size})` : ''}
                </Button>
                <Collapse in={focusOpen}>
                    <Box sx={{ mt: 1, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Select specific metrics to dive deeper into:
                        </Typography>
                        <Grid container spacing={0}>
                            {metrics.map((m) => (
                                <Grid item xs={6} sm={4} md={3} key={m.key}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={focusMetrics.has(m.key)}
                                                onChange={() => toggleFocusMetric(m.key)}
                                            />
                                        }
                                        label={<Typography variant="body2">{m.label}</Typography>}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<CompareArrowsIcon />}
                                disabled={focusMetrics.size === 0}
                                onClick={() => { setDeepCompare(true); setFocusOpen(false); }}
                            >
                                Compare Selected Metrics
                            </Button>
                        </Box>
                    </Box>
                </Collapse>
            </Box>

            <DialogContent dividers>
                {deepCompare && focusMetrics.size > 0 ? (
                    /* ── Deep Compare: focused metric cards ── */
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle1" fontWeight="bold">
                                Focused Comparison — {focusMetrics.size} metric{focusMetrics.size !== 1 ? 's' : ''}
                            </Typography>
                            <Button size="small" onClick={() => setDeepCompare(false)}>
                                Back to Full Compare
                            </Button>
                        </Box>
                        <Grid container spacing={2}>
                            {pools.map((pool) => (
                                <Grid item xs={12} md={columnWidth} key={pool.poolAddress}>
                                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                                        <PoolHeader pool={pool} />
                                        {metrics.filter((m) => focusMetrics.has(m.key)).map((m) => (
                                            <FocusMetricCard
                                                key={m.key}
                                                pool={pool}
                                                metricKey={m.key}
                                                metricLabel={m.label}
                                                isHighest={focusHighlightMap.get(m.key)?.has(pool.poolAddress) ?? false}
                                            />
                                        ))}
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </>
                ) : (
                    /* ── Full Compare: side-by-side with green highlights ── */
                    <Grid container spacing={2}>
                        {pools.map((pool) => (
                            <Grid item xs={12} md={columnWidth} key={pool.poolAddress}>
                                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                                    <PoolHeader pool={pool} />
                                    {fullViewMetrics.map((m) => {
                                        const isHighest = highlightMap.get(m.key)?.has(pool.poolAddress) ?? false;
                                        return (
                                            <Box key={m.key} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                                                <Typography variant="body2" color="text.secondary">{m.label}</Typography>
                                                <Typography variant="body2" fontWeight="bold" sx={isHighest ? { color: 'success.main' } : undefined}>
                                                    {formatPoolMetric(pool, m.key)}
                                                </Typography>
                                            </Box>
                                        );
                                    })}
                                    {extraRows?.map((row) => (
                                        <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                                            <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                                            <Typography variant="body2">{row.value(pool)}</Typography>
                                        </Box>
                                    ))}
                                    {showPerformance && (
                                        <>
                                            <Divider sx={{ my: 1 }} />
                                            <TokenPerformanceMetrics pool={pool} />
                                        </>
                                    )}
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default PoolCompareModal;
