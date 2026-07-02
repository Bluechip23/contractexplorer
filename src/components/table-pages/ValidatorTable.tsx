import * as React from 'react';
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
import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiEndpoint } from '../universal/IndividualPage.const';
import { usePagination } from '../universal/tablePrimitives';

interface Column {
    id: 'validator' | 'commision' | 'maxCommision' | 'totalStaked' | 'delegated';
    label: string;
    format?: (value: number) => string;
}

const columns: readonly Column[] = [
    { id: 'validator', label: 'Validator', },
    { id: 'commision', label: 'Commision', },
    {
        id: 'maxCommision',
        label: 'Max Commision',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'totalStaked',
        label: 'Total Staked',
        format: (value: number) => value.toLocaleString('en-US'),
    },
    {
        id: 'delegated',
        label: 'Delegated',
        format: (value: number) => value.toFixed(2),
    },
];

interface ValidatorRow {
    validator: string;
    commision: number;
    maxCommision: number;
    totalStaked: number;
    delegated: number;
    valId: string;
}

const ValidatorTable: React.FC = () => {
    const { paginate, paginationProps } = usePagination();
    const [rows, setRows] = useState<ValidatorRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const topValidator = async () => {
            try {
                const response = await axios.get(`${apiEndpoint}/validators`);
                const validatorData = response.data.result;

                const validatorRows = validatorData.map((validator: any) => ({
                    validator: validator.address,
                    commision: validator.balance,
                    maxCommision: validator.percentage,
                    totalStaked: validator.totalTransactions,
                    delegated: validator.delegated,
                    valId: validator.valId
                }));
                setRows(validatorRows);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching wallet data:', error);
                setLoading(false);
            }
        };

        topValidator();
    }, []);

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440, padding: '15px' }}>
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
                            .map((row) => (
                                <TableRow key={row.valId}>
                                    <TableCell>
                                        <CopyableId value={row.valId}><Link to={`/validator/${row.valId}`}>{row.validator}</Link></CopyableId>
                                    </TableCell>
                                    <TableCell>
                                        {row.commision}
                                    </TableCell>
                                    <TableCell>
                                        {row.maxCommision}
                                    </TableCell>
                                    <TableCell>
                                        {row.totalStaked}
                                    </TableCell>
                                    <TableCell>
                                        {row.delegated}
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination {...paginationProps(rows.length)} />
        </Paper>
    );
}

export default ValidatorTable;
