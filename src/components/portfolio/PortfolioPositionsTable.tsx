import React from 'react';
import {
    Box,
    Card,
    CardContent,
    CircularProgress,
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
import { formatMicroAmount } from '../../utils/contractQueries';
import { safeBigInt } from '../../utils/bigintMath';
import { MyPosition } from './types';
import { formatSecondsDate } from '../../utils/datetime';

interface PortfolioPositionsTableProps {
    positions: MyPosition[];
    loading: boolean;
}

const PortfolioPositionsTable: React.FC<PortfolioPositionsTableProps> = ({ positions, loading }) => {
    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Scanning pools for your positions...</Typography>
            </Box>
        );
    }

    if (positions.length === 0) {
        return (
            <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">You don't have any LP positions yet.</Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Pool</TableCell>
                            <TableCell>Position ID</TableCell>
                            <TableCell>Liquidity</TableCell>
                            <TableCell>Unclaimed Fees (bluechip)</TableCell>
                            <TableCell>Unclaimed Fees (Token)</TableCell>
                            <TableCell>Last Fee Collection</TableCell>
                            <TableCell>Created</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {positions.map((p) => (
                            <TableRow key={`${p.pool.poolAddress}-${p.position.position_id}`} hover>
                                <TableCell>
                                    <Link to={`/creatorpool/${p.pool.poolAddress}`} style={{ textDecoration: 'none' }}>
                                        <Typography fontWeight="bold" variant="body2" color="primary">
                                            {p.pool.tokenSymbol}
                                        </Typography>
                                    </Link>
                                </TableCell>
                                <TableCell>{p.position.position_id}</TableCell>
                                <TableCell>{formatMicroAmount(p.position.liquidity)}</TableCell>
                                <TableCell>{formatMicroAmount(p.position.unclaimed_fees_0)}</TableCell>
                                <TableCell>{formatMicroAmount(p.position.unclaimed_fees_1)}</TableCell>
                                <TableCell>
                                    {p.position.last_fee_collection ? formatSecondsDate(p.position.last_fee_collection) : 'Never'}
                                </TableCell>
                                <TableCell>
                                    {formatSecondsDate(p.position.created_at)}
                                </TableCell>
                                <TableCell align="right">
                                    <PoolActionMenu
                                        poolAddress={p.pool.poolAddress}
                                        tokenSymbol={p.pool.tokenSymbol}
                                        creatorTokenAddress={p.pool.creatorTokenAddress}
                                        thresholdReached={p.pool.thresholdReached}
                                        compact
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default PortfolioPositionsTable;
