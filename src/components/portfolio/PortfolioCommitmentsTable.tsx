import React from 'react';
import { PoolStatusChip } from '../universal/tablePrimitives';
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
import { MyCommitment } from './types';

interface PortfolioCommitmentsTableProps {
    commitments: MyCommitment[];
    loading: boolean;
}

const PortfolioCommitmentsTable: React.FC<PortfolioCommitmentsTableProps> = ({ commitments, loading }) => {
    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Scanning pools for your commitments...</Typography>
            </Box>
        );
    }

    if (commitments.length === 0) {
        return (
            <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">You haven't committed to any pools yet.</Typography>
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
                            <TableCell>Status</TableCell>
                            <TableCell>My Total (USD)</TableCell>
                            <TableCell>My Total (bluechip)</TableCell>
                            <TableCell>Last Payment</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {commitments.map((c) => (
                            <TableRow key={c.pool.poolAddress} hover>
                                <TableCell>
                                    <Link to={`/creatorpool/${c.pool.poolAddress}`} style={{ textDecoration: 'none' }}>
                                        <Typography fontWeight="bold" variant="body2" color="primary">
                                            {c.pool.tokenSymbol}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {c.pool.tokenName}
                                        </Typography>
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    <PoolStatusChip thresholdReached={c.pool.thresholdReached} />
                                </TableCell>
                                <TableCell>${formatMicroAmount(c.commit.total_paid_usd)}</TableCell>
                                <TableCell>{formatMicroAmount(c.commit.total_paid_bluechip)}</TableCell>
                                <TableCell>${formatMicroAmount(c.commit.last_payment_usd)}</TableCell>
                                <TableCell align="right">
                                    <PoolActionMenu
                                        poolAddress={c.pool.poolAddress}
                                        tokenSymbol={c.pool.tokenSymbol}
                                        creatorTokenAddress={c.pool.creatorTokenAddress}
                                        thresholdReached={c.pool.thresholdReached}
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

export default PortfolioCommitmentsTable;
