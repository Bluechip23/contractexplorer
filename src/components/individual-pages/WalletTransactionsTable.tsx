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
import CopyableId from '../universal/CopyableId';
import { usePagination } from '../universal/tablePrimitives';


interface Column {
    id: 'hash' | 'method' | 'block' | 'sender' | 'recipient' | 'value' | 'fee';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'hash', label: 'Hash', },
    { id: 'method', label: 'Method', },
    {
        id: 'block',
        label: 'Block',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'sender',
        label: 'Sender',
    },
    {
        id: 'recipient',
        label: 'Recipient',
    },
    {
        id: 'value',
        label: 'Value',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'fee',
        label: 'Fees',
        format: (value: number) => value.toLocaleString('en-US'),
    },
];

interface WalletTransactionsTable {
    hash: string;
    method: string;
    block: string;
    sender: string;
    recipient: string;
    value: number;
    fee: number;
}

interface WalletTransactionsTableProps {
    walletTx: WalletTransactionsTable[];
}

const WalletTransactionsTable: React.FC<WalletTransactionsTableProps> = ({ walletTx }) => {
    const { paginate, paginationProps } = usePagination();

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440 }}>
                <Typography variant='h5'>Wallets Recent Transactions</Typography>
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
                        {paginate(walletTx)
                            .map((row) => {
                                return (
                                    <TableRow>
                                        <TableCell >
                                            <CopyableId value={row.hash}><Link to={`/transactionpage/${row.hash}`}>{row.hash}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell  >
                                            {row.method}
                                        </TableCell>
                                        <TableCell  >
                                            <Link to={`/blockpage/${row.block}`}>{row.block}</Link>
                                        </TableCell>
                                        <TableCell  >
                                            <CopyableId value={row.sender}><Link to={`/walletpage/${row.sender}`}>{row.sender}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell >
                                            <CopyableId value={row.recipient}><Link to={`/walletpage/${row.recipient}`}>{row.recipient}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell >
                                            {row.value}
                                        </TableCell>
                                        <TableCell >
                                            {row.fee}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(walletTx.length)} />
        </Paper>
    );
}

export default WalletTransactionsTable;