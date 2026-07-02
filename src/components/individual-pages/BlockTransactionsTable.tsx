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
    id: 'hash' | 'method' | 'sender' | 'recipient' | 'value' | 'fee';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'hash', label: 'Hash', },
    { id: 'method', label: 'Method', },

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

interface TransactionRow {
    hash: string;
    method: string;
    sender: string;
    recipient: string;
    value: number;
    fee: number;
}
interface BlockTransactionsTableProps {
    rows: TransactionRow[];
}

const BlockTransactionsTable: React.FC<BlockTransactionsTableProps> = ({ rows }) => {
    const { paginate, paginationProps } = usePagination();

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440 }}>
                <Typography variant='h5'>The Block Transactions</Typography>
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
                        {paginate(rows)
                            .map((row) => {
                                return (
                                    <TableRow key={row.hash}>
                                        <TableCell >
                                            <CopyableId value={row.hash}><Link to={`/transactionpage/${row.hash}`}>{row.hash}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell  >
                                            {row.method}
                                        </TableCell>
                                        <TableCell  >
                                            <CopyableId value={row.sender}><Link to={`/transactionpage/${row.sender}`}>{row.sender}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell >
                                            <CopyableId value={row.recipient}><Link to={`/transactionpage/${row.recipient}`}>{row.recipient}</Link></CopyableId>
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
            <TablePagination {...paginationProps(rows.length)} />
        </Paper>
    );
}

export default BlockTransactionsTable;