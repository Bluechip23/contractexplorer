import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
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
import { formatMicroAmount } from '../../utils/contractQueries';
import { safeBigInt } from '../../utils/bigintMath';
import { MyCommitment, MyPosition, TxRecord } from './types';
import { formatNsTimestamp, formatSecondsTimestamp } from '../../utils/datetime';

interface PortfolioTransactionsTableProps {
    commitments: MyCommitment[];
    positions: MyPosition[];
    loading: boolean;
}

const PortfolioTransactionsTable: React.FC<PortfolioTransactionsTableProps> = ({ commitments, positions, loading }) => {
    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Loading transactions...</Typography>
            </Box>
        );
    }

    const txs: TxRecord[] = [];

    commitments.forEach((c) => {
        txs.push({
            pool: c.pool,
            type: 'commit',
            amount: `$${formatMicroAmount(c.commit.total_paid_usd)}`,
            timestamp: formatNsTimestamp(c.commit.last_committed),
        });
    });

    positions.forEach((p) => {
        txs.push({
            pool: p.pool,
            type: 'position',
            amount: formatMicroAmount(p.position.liquidity),
            timestamp: formatSecondsTimestamp(p.position.created_at),
        });
    });

    if (txs.length === 0) {
        return (
            <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">No transaction history found.</Typography>
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
                            <TableCell>Type</TableCell>
                            <TableCell>Amount</TableCell>
                            <TableCell>Date</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {txs.map((tx, i) => (
                            <TableRow key={i} hover>
                                <TableCell>
                                    <Link to={`/creatorpool/${tx.pool.poolAddress}`} style={{ textDecoration: 'none' }}>
                                        <Typography variant="body2" color="primary" fontWeight="bold">
                                            {tx.pool.tokenSymbol}
                                        </Typography>
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={tx.type === 'commit' ? 'Commitment' : 'LP Position'}
                                        color={tx.type === 'commit' ? 'info' : 'secondary'}
                                        size="small"
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell>{tx.amount}</TableCell>
                                <TableCell>{tx.timestamp}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default PortfolioTransactionsTable;
