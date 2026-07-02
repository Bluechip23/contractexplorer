import React from 'react';
import { Box, Typography } from '@mui/material';
import { PoolSummary } from '../../utils/contractQueries';
import { formatPoolMetric } from '../portfolio/poolMetrics';

interface FocusMetricCardProps {
    pool: PoolSummary;
    metricKey: string;
    metricLabel: string;
    isHighest: boolean;
}

/** Quick metric card for the "Further Focus" deep-compare view */
const FocusMetricCard: React.FC<FocusMetricCardProps> = ({ pool, metricKey, metricLabel, isHighest }) => (
    <Box sx={{ py: 1.5, px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">{metricLabel}</Typography>
        <Typography variant="h6" fontWeight="bold" sx={isHighest ? { color: 'success.main' } : undefined}>
            {formatPoolMetric(pool, metricKey)}
        </Typography>
    </Box>
);

export default FocusMetricCard;
