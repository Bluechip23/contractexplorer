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
import { apiEndpoint } from '../universal/IndividualPage.const';
import { usePagination } from '../universal/tablePrimitives';
import axios from 'axios';
import { useEffect, useState } from 'react';

interface Column {
    id: 'hash' | 'method' | 'block' | 'sender' | 'recipient' | 'value' | 'fee';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'hash', label: 'Hash' },
    { id: 'method', label: 'Method' },
    { id: 'block', label: 'Block' },
    { id: 'sender', label: 'Sender' },
    { id: 'recipient', label: 'Recipient' },
    { id: 'value', label: 'Value' },
    { id: 'fee', label: 'Fees' },
];

interface RecentTransactionTableProps {
    hash: string;
    method: string;
    block: string;
    sender: string;
    recipient: string;
    value: number;
    fee: number;
}

const RecentTransactionsTable: React.FC = () => {
    const { page, rowsPerPage, paginationProps } = usePagination();
    const [rows, setRows] = useState<RecentTransactionTableProps[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();

        async function loadTx() {
            try {
                const response = await axios.get(`${apiEndpoint}/tx_search`, {
                    params: {
                        query: 'tx.height>0',
                        page: page + 1,
                        per_page: rowsPerPage,
                        order_by: 'desc',
                    },
                    signal: controller.signal,
                });
                const transactions = response.data.result.txs;

                const blockRows = transactions.map((tx: any) => ({
                    hash: tx.txhash,
                    method: tx.tx.body.messages[0].type,
                    block: tx.height,
                    sender: tx.tx.body.messages[0].sender,
                    recipient: tx.tx.body.messages[0].recipient,
                    value: tx.tx.body.messages[0].amount[0].amount,
                    fee: tx.tx.auth_info.fee.amount[0].amount,
                }));
                setRows(blockRows);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Error loading transactions:', error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadTx();
        return () => controller.abort();
    }, [page, rowsPerPage]);

    if (loading) {
        return (
            <Paper sx={{ width: '100%', overflow: 'hidden', padding: '15px' }}>
                <Typography variant='h5'>Recent Transactions</Typography>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Typography key={i} sx={{ height: 32, bgcolor: 'grey.200', borderRadius: 1, mb: 1, animation: 'pulse 1.5s infinite' }} />
                ))}
            </Paper>
        );
    }

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440, padding: '15px' }}>
                <Typography variant='h5'>Recent Transactions</Typography>
                <Table stickyHeader aria-label="sticky table">
                    <TableHead>
                        <TableRow>
                            {columns.map((column) => (
                                <TableCell key={column.id}>
                                    {column.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                                <TableRow key={row.hash}>
                                    <TableCell>
                                        <CopyableId value={row.hash}><Link to={`/transactionpage/${row.hash}`}>{row.hash}</Link></CopyableId>
                                    </TableCell>
                                    <TableCell>{row.method}</TableCell>
                                    <TableCell>
                                        <Link to={`/block/${row.block}`}>{row.block}</Link>
                                    </TableCell>
                                    <TableCell>
                                        <CopyableId value={row.sender}><Link to={`/wallet/${row.sender}`}>{row.sender}</Link></CopyableId>
                                    </TableCell>
                                    <TableCell>
                                        <CopyableId value={row.recipient}><Link to={`/wallet/${row.recipient}`}>{row.recipient}</Link></CopyableId>
                                    </TableCell>
                                    <TableCell>{row.value}</TableCell>
                                    <TableCell>{row.fee}</TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(rows.length)} />
        </Paper>
    );
}

export default RecentTransactionsTable;
