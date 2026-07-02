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
import axios from 'axios';
import { rpcEndpoint } from '../universal/IndividualPage.const';
import { usePagination } from '../universal/tablePrimitives';
import { useEffect, useState } from 'react';

interface Column {
    id: 'block' | 'age' | 'txn' | 'feeRecipient' | 'gasUsed' | 'reward';
    label: string;
    minWidth?: number;
    align?: 'right';
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'block', label: 'Block', },
    { id: 'age', label: 'Age', },
    {
        id: 'txn',
        label: 'Transactions',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'feeRecipient',
        label: 'Fee Recipient',
    },
    {
        id: 'gasUsed',
        label: 'Gas',
        format: (value: number) => value.toFixed(2),
    },
    {
        id: 'reward',
        label: 'Reward',
        format: (value: number) => value.toFixed(2),
    },
];

interface RecentBlocksTableProps {
    block: string;
    age: string;
    txn: number;
    feeRecipient: string;
    gasUsed: number;
    reward: number;
}

const MAX_BLOCKS = 100;

const RecentBlocksTable: React.FC = () => {
    const { paginate, paginationProps } = usePagination();
    const [rows, setRows] = useState<RecentBlocksTableProps[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalBlocks, setTotalBlocks] = useState(0);

    useEffect(() => {
        const controller = new AbortController();

        async function loadBlocks() {
            try {
                const rpc = await axios.get(`${rpcEndpoint}/status`, { signal: controller.signal });
                const latestHeight = Number(rpc.data.result.sync_info.latest_block_height);
                setTotalBlocks(latestHeight);

                const minHeight = Math.max(1, latestHeight - MAX_BLOCKS + 1);
                const response = await axios.get(
                    `${rpcEndpoint}/blockchain?minHeight=${minHeight}&maxHeight=${latestHeight}`,
                    { signal: controller.signal }
                );
                const blocks = response.data.result.block_metas;
                const blockRows = blocks.map((block: any) => ({
                    block: block.header.height,
                    age: block.header.time,
                    txn: block.header.num_txs || 0,
                    feeRecipient: block.block_id.hash,
                    gasUsed: block.header.gas_used || 0,
                    reward: block.header.total_reward || 0,
                }));

                setRows(blockRows);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Error loading blocks:', error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadBlocks();
        return () => controller.abort();
    }, []);

    if (loading) {
        return (
            <Paper sx={{ width: '100%', overflow: 'hidden', padding: '15px' }}>
                <Typography variant='h5'>Recent Blocks</Typography>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Typography key={i} sx={{ height: 32, bgcolor: 'grey.200', borderRadius: 1, mb: 1, animation: 'pulse 1.5s infinite' }} />
                ))}
            </Paper>
        );
    }

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440, padding: '15px' }}>
                <Typography variant='h5'>Recent Blocks</Typography>
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
                            .map((row) => (
                                <TableRow key={row.block}>
                                    <TableCell>
                                        <Link to={`/blockpage/${row.block}`}>{row.block}</Link>
                                    </TableCell>
                                    <TableCell>{row.age}</TableCell>
                                    <TableCell>{row.txn}</TableCell>
                                    <TableCell><Link to=''>{row.feeRecipient}</Link></TableCell>
                                    <TableCell>{row.gasUsed}</TableCell>
                                    <TableCell>{row.reward}</TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(totalBlocks || rows.length)} />
        </Paper>
    );
};

export default RecentBlocksTable;
