import React from 'react';
import { PoolStatusChip } from '../universal/tablePrimitives';
import {
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Grid,
    Stack,
    Typography,
} from '@mui/material';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Link } from 'react-router-dom';
import PoolActionMenu from '../actions/PoolActionMenu';
import StatCard from '../universal/StatCard';
import { formatMicroAmount, PoolSummary } from '../../utils/contractQueries';
import { safeBigInt } from '../../utils/bigintMath';

interface PortfolioCreatedPoolsTableProps {
    createdPools: PoolSummary[];
    loading: boolean;
    onCreatePool: () => void;
}

const PortfolioCreatedPoolsTable: React.FC<PortfolioCreatedPoolsTableProps> = ({ createdPools, loading, onCreatePool }) => {
    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Checking if you've created any pools...</Typography>
            </Box>
        );
    }

    if (createdPools.length === 0) {
        return (
            <Card>
                <CardContent sx={{ textAlign: 'center', py: 6 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        You have not created a pool yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Create your own creator token and liquidity pool. Subscribers will commit OSMO
                        to fund your pool, and you'll earn fees on every transaction.
                    </Typography>
                    <Button variant="contained" size="large" onClick={onCreatePool}>
                        Create Pool
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const totalFeesEarned0 = createdPools.reduce<bigint>(
        (sum, p) => sum + safeBigInt(p.totalFeesCollected0), 0n
    );
    const totalFeesEarned1 = createdPools.reduce<bigint>(
        (sum, p) => sum + safeBigInt(p.totalFeesCollected1), 0n
    );
    const totalPoolLiquidity = createdPools.reduce<bigint>(
        (sum, p) => sum + safeBigInt(p.totalLiquidity), 0n
    );
    const totalSubscribers = createdPools.reduce(
        (sum, p) => sum + p.totalCommitters, 0
    );
    const totalLpPositions = createdPools.reduce(
        (sum, p) => sum + p.totalPositions, 0
    );

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Pools Created" value={createdPools.length} />
                </Grid>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Total Subscribers" value={totalSubscribers} />
                </Grid>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Total LP Positions" value={totalLpPositions} />
                </Grid>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Total TVL" value={formatMicroAmount(totalPoolLiquidity.toString())} />
                </Grid>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Fees Earned (OSMO)" value={formatMicroAmount(totalFeesEarned0.toString())} />
                </Grid>
                <Grid item xs={6} sm={4}>
                    <StatCard label="Fees Earned (Token)" value={formatMicroAmount(totalFeesEarned1.toString())} />
                </Grid>
            </Grid>

            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                <TableContainer>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Pool</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>TVL</TableCell>
                                <TableCell>Fees (OSMO)</TableCell>
                                <TableCell>Fees (Token)</TableCell>
                                <TableCell>Subscribers</TableCell>
                                <TableCell>LP Positions</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {createdPools.map((pool) => (
                                <TableRow key={pool.poolAddress} hover>
                                    <TableCell>
                                        <Link to={`/creatorpool/${pool.poolAddress}`} style={{ textDecoration: 'none' }}>
                                            <Typography fontWeight="bold" variant="body2" color="primary">
                                                {pool.tokenSymbol}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {pool.tokenName}
                                            </Typography>
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <PoolStatusChip thresholdReached={pool.thresholdReached} />
                                    </TableCell>
                                    <TableCell>{formatMicroAmount(pool.totalLiquidity)}</TableCell>
                                    <TableCell>{formatMicroAmount(pool.totalFeesCollected0)}</TableCell>
                                    <TableCell>{formatMicroAmount(pool.totalFeesCollected1)}</TableCell>
                                    <TableCell>{pool.totalCommitters}</TableCell>
                                    <TableCell>{pool.totalPositions}</TableCell>
                                    <TableCell align="right">
                                        <PoolActionMenu
                                            poolAddress={pool.poolAddress}
                                            tokenSymbol={pool.tokenSymbol}
                                            creatorTokenAddress={pool.creatorTokenAddress}
                                            thresholdReached={pool.thresholdReached}
                                            compact
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Box sx={{ textAlign: 'center' }}>
                <Button variant="outlined" onClick={onCreatePool}>
                    Create Another Pool
                </Button>
            </Box>
        </Stack>
    );
};

export default PortfolioCreatedPoolsTable;
