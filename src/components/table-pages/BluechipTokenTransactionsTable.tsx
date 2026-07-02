import React, { useEffect, useState } from 'react';
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
import { denom, apiEndpoint } from '../universal/IndividualPage.const';
import { usePagination } from '../universal/tablePrimitives';
import axios from 'axios';

interface Column {
    id: 'bluechip' | 'hash' | 'method' | 'block' | 'sender' | 'recipient' | 'value' | 'fee';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'bluechip', label: 'blue chip' },
    { id: 'hash', label: 'Hash' },
    { id: 'method', label: 'Method' },
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

interface Data {
    bluechip: string;
    hash: string;
    method: string;
    block: number;
    sender: string;
    recipient: string;
    value: number;
    fee: number;
}

const BlueChipTokenTransactionsTable: React.FC = () => {
    const [rows, setRows] = useState<Data[]>([]); // State for storing rows
    const { paginate, paginationProps } = usePagination();

    useEffect(() => {
        const MAX_PAGES = 3;
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 2000;
        const controller = new AbortController();

        const fetchTokenTransactions = async () => {
            const allTransactions: Data[] = [];
            let nextKey: string | null = null;
            let pageCount = 0;
            let retries = MAX_RETRIES;

            do {
                try {
                    const url: string = `${apiEndpoint}/cosmos/tx/v1beta1/txs?events=transfer.amount.contains('${denom}')${nextKey ? `&pagination.key=${nextKey}` : ''}`;
                    const txQuery: any = await axios.get(url, { signal: controller.signal });
                    const transactions = txQuery.data.txs || [];
                    if (transactions.length === 0 && !nextKey) break;

                    for (const tx of transactions) {
                        allTransactions.push({
                            bluechip: 'YourToken',
                            hash: tx.txhash,
                            method: 'Transfer',
                            block: tx.height.toString(),
                            sender: tx.body.messages[0].from_address,
                            recipient: tx.body.messages[0].to_address,
                            value: Number(tx.body.messages[0].amount[0].amount),
                            fee: Number(tx.auth_info.fee.amount[0]?.amount || 0),
                        });
                    }

                    nextKey = txQuery.data.pagination?.next_key;
                    pageCount++;
                } catch (error) {
                    if (controller.signal.aborted) return;
                    if (retries > 0) {
                        retries--;
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    } else {
                        break;
                    }
                }
            } while (nextKey && pageCount < MAX_PAGES);

            if (!controller.signal.aborted) {
                setRows(allTransactions);
            }
        };

        fetchTokenTransactions();
        return () => controller.abort();
    }, []);

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440, padding: '15px' }}>
                <Typography variant='h5'>Token Transactions</Typography>
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
                        {paginate(rows)
                            .map((row, index) => {
                                return (
                                    <TableRow key={row.hash || index}>
                                        <TableCell>
                                            {row.bluechip}
                                        </TableCell>
                                        <TableCell>
                                            <Link to={`/transaction/${row.hash}`}>{row.hash}</Link>
                                        </TableCell>
                                        <TableCell>{row.method}</TableCell>
                                        <TableCell>
                                            {row.block}
                                        </TableCell>
                                        <TableCell>
                                            {row.sender}
                                        </TableCell>
                                        <TableCell>
                                            {row.recipient}
                                        </TableCell>
                                        <TableCell>{row.value}</TableCell>
                                        <TableCell>{row.fee}</TableCell>
                                    </TableRow>
                                );
                            })}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(rows.length)} />
        </Paper>
    );
};

export default BlueChipTokenTransactionsTable;
