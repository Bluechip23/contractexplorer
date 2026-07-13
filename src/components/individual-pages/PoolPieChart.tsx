import React from 'react';
import { Box, Typography } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMicroAmount } from '../../utils/contractQueries';
import { microToNumber } from '../../utils/bigintMath';

const bluechip_COLOR = '#1976d2';
const CREATOR_COLOR = '#9932CC';

interface PoolPieChartProps {
    reserve0: string;
    reserve1: string;
    tokenSymbol: string;
    tokenDecimals: number;
}

const PoolPieChart: React.FC<PoolPieChartProps> = ({ reserve0, reserve1, tokenSymbol, tokenDecimals }) => {
    // Pie slice sizes are relative — Number precision is fine for chart layout,
    // but display values still use full-precision formatMicroAmount below.
    const r0 = microToNumber(reserve0, 0);
    const r1 = microToNumber(reserve1, 0);
    const total = r0 + r1;

    if (total === 0) {
        return (
            <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    No reserves available
                </Typography>
            </Box>
        );
    }

    const data = [
        {
            name: 'OSMO',
            value: r0,
            displayValue: formatMicroAmount(reserve0),
            color: bluechip_COLOR,
        },
        {
            name: tokenSymbol || 'Creator Token',
            value: r1,
            displayValue: formatMicroAmount(reserve1, tokenDecimals),
            color: CREATOR_COLOR,
        },
    ];

    const renderSliceLabel = (props: {
        cx?: number;
        cy?: number;
        midAngle?: number;
        innerRadius?: number;
        outerRadius?: number;
        index?: number;
    }) => {
        const cx = props.cx ?? 0;
        const cy = props.cy ?? 0;
        const midAngle = props.midAngle ?? 0;
        const innerRadius = props.innerRadius ?? 0;
        const outerRadius = props.outerRadius ?? 0;
        const index = props.index ?? 0;
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        const entry = data[index];
        const pct = ((entry.value / total) * 100).toFixed(1);
        return (
            <g>
                <text
                    x={x}
                    y={y - 8}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: 13, fontWeight: 700 }}
                >
                    {entry.displayValue}
                </text>
                <text
                    x={x}
                    y={y + 8}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}
                >
                    {pct}%
                </text>
            </g>
        );
    };

    return (
        <Box sx={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={0}
                        labelLine={false}
                        label={renderSliceLabel}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive
                    >
                        {data.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                        ))}
                    </Pie>
                    <RechartsTooltip
                        formatter={(_value, name, item) => {
                            const payload = (item as { payload?: { displayValue?: string } } | undefined)?.payload;
                            return [payload?.displayValue ?? '', name];
                        }}
                    />
                    <Legend verticalAlign="bottom" height={24} />
                </PieChart>
            </ResponsiveContainer>
        </Box>
    );
};

export default PoolPieChart;
