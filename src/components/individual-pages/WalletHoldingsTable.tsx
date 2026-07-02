import * as React from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { usePagination } from '../universal/tablePrimitives';


interface Column {
    id: 'token' | 'amount' | 'value';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'token', label: 'Token', },
    { id: 'amount', label: 'Amount', },
    { id: 'value', label: 'Value', },
];

interface WalletHoldings {
    token: string;
    amount: string;
    value: string;
}
interface WalletHoldingProps {
    walletHoldings: WalletHoldings[];
}

const WalletsHoldingsTable: React.FC<WalletHoldingProps> = ({walletHoldings}) => {
    const { paginate, paginationProps } = usePagination();

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440 }}>
                <Typography variant='h5'>Wallets Holdings</Typography>
                <Table stickyHeader aria-label="sticky table">
                    <TableHead>
                        <TableRow>
                            {columns.map((column) => (
                                <TableCell
                                    key={column.id}
                                >
                                    {column.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paginate(walletHoldings)
                            .map((row) => {
                                return (
                                    <TableRow>
                                        <TableCell >
                                            <Link to={`/tokenpage/${row.token}`}>{row.token}</Link>
                                        </TableCell>
                                        <TableCell  >
                                            {row.amount}
                                        </TableCell>
                                        <TableCell  >
                                            {row.value}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(walletHoldings.length)} />
        </Paper>
    );
}

export default WalletsHoldingsTable;