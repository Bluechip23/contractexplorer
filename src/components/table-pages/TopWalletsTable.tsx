import * as React from 'react';
import axios from 'axios';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { Link } from 'react-router-dom';
import CopyableId from '../universal/CopyableId';
import { apiEndpoint } from '../universal/IndividualPage.const';
import { usePagination } from '../universal/tablePrimitives';
import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';

interface Column {
    id: 'walletAddress' | 'balance' | 'percentage' | 'totalTransactions';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'walletAddress', label: 'Wallet Address' },
    { id: 'balance', label: 'Balance(BCP)' },
    {
        id: 'percentage',
        label: 'Percentage',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'totalTransactions',
        label: 'Total Txn',
        format: (value: number) => value.toLocaleString('en-US'),
    },
];

interface TopWalletsTableProps {
    walletAddress: string;
    balance: string; 
    percentage: number;
    totalTransactions: number;
}

const TopWalletsTable: React.FC = () => {
    const { paginate, paginationProps } = usePagination();
    const [rows, setRows] = useState<TopWalletsTableProps[]>([]);

    useEffect(() => {
        const BATCH_SIZE = 10;
        const controller = new AbortController();

        const fetchTopWallets = async () => {
            try {
                const response = await axios.get(`${apiEndpoint}/bluehcip/auth/v1beta1/accounts`, { signal: controller.signal });
                const accounts = response.data.accounts;

                // Fetch balances in batches to avoid overwhelming the server
                const balanceResponses: any[] = [];
                for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
                    if (controller.signal.aborted) return;
                    const batch = accounts.slice(i, i + BATCH_SIZE);
                    const batchResults = await Promise.all(
                        batch.map((account: any) =>
                            axios.get(`${apiEndpoint}/bluechip/bank/v1beta1/balances/${account.address}`, { signal: controller.signal })
                        )
                    );
                    balanceResponses.push(...batchResults);
                }

                if (controller.signal.aborted) return;

                let walletsData = accounts.map((account: any, index: number) => ({
                    address: account.address,
                    balance: balanceResponses[index].data.balances[0]?.amount || '0',
                    totalTransactions: 0,
                }));

                walletsData.sort((a: any, b: any) => Number(b.balance) - Number(a.balance));
                const totalBalance = walletsData.reduce((sum: number, wallet: any) => sum + Number(wallet.balance), 0);
                const walletRows = walletsData.slice(0, 100).map((wallet: any) => ({
                    walletAddress: wallet.address,
                    balance: wallet.balance,
                    percentage: (Number(wallet.balance) / totalBalance) * 100,
                    totalTransactions: wallet.totalTransactions,
                }));

                setRows(walletRows);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Error fetching wallet data:', error);
                }
            }
        };

        fetchTopWallets();
        return () => controller.abort();
    }, []);

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440, padding: '15px' }}>
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
                            .map((row) => {
                                return (
                                    <TableRow key={row.walletAddress}>
                                        <TableCell>
                                            <CopyableId value={row.walletAddress}><Link to={`/wallet/${row.walletAddress}`}>{row.walletAddress}</Link></CopyableId>
                                        </TableCell>
                                        <TableCell>{row.balance}</TableCell>
                                        <TableCell>{row.percentage}</TableCell>
                                        <TableCell>{row.totalTransactions}</TableCell>
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

export default TopWalletsTable;
