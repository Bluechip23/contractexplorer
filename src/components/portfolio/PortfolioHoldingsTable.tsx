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
import { formatMicroAmount, WalletHolding } from '../../utils/contractQueries';
import { safeBigInt } from '../../utils/bigintMath';

interface PortfolioHoldingsTableProps {
    holdings: WalletHolding[];
    nativeBalance: string | null;
    loading: boolean;
}

const PortfolioHoldingsTable: React.FC<PortfolioHoldingsTableProps> = ({ holdings, nativeBalance, loading }) => {
    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" sx={{ mt: 1 }}>Scanning your token holdings...</Typography>
            </Box>
        );
    }

    const hasNative = !!nativeBalance && safeBigInt(nativeBalance) > 0n;
    if (!hasNative && holdings.length === 0) {
        return (
            <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">No token holdings found.</Typography>
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
                            <TableCell>Token</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Balance</TableCell>
                            <TableCell>Pool</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {hasNative && (
                            <TableRow hover>
                                <TableCell>
                                    <Typography fontWeight="bold" variant="body2">OSMO</Typography>
                                    <Typography variant="caption" color="text.secondary">Native Token</Typography>
                                </TableCell>
                                <TableCell><Chip label="Native" color="primary" size="small" variant="outlined" /></TableCell>
                                <TableCell>{formatMicroAmount(nativeBalance!)} OSMO</TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">-</Typography></TableCell>
                            </TableRow>
                        )}
                        {holdings.map((h) => (
                            <TableRow key={h.tokenAddress} hover>
                                <TableCell>
                                    <Link to={`/creatorpool/${h.poolAddress}`} style={{ textDecoration: 'none' }}>
                                        <Typography fontWeight="bold" variant="body2" color="primary">{h.tokenSymbol}</Typography>
                                        <Typography variant="caption" color="text.secondary">{h.tokenName}</Typography>
                                    </Link>
                                </TableCell>
                                <TableCell><Chip label="Creator Token" color="secondary" size="small" variant="outlined" /></TableCell>
                                <TableCell>{formatMicroAmount(h.balance, h.tokenDecimals)} {h.tokenSymbol}</TableCell>
                                <TableCell>
                                    <Link to={`/creatorpool/${h.poolAddress}`} style={{ textDecoration: 'none' }}>
                                        <Typography variant="body2" color="primary">{h.tokenSymbol} Pool</Typography>
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default PortfolioHoldingsTable;
