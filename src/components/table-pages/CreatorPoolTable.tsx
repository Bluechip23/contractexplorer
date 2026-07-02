import * as React from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Typography,
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { Link } from 'react-router-dom';
import CopyableId from '../universal/CopyableId';
import { factoryAddress } from '../universal/IndividualPage.const';
import { usePagination, TableStatePaper, PoolStatusChip } from '../universal/tablePrimitives';
import {
    fetchAllPoolSummaries,
    formatMicroAmount,
    abbreviateAddress,
    PoolSummary,
} from '../../utils/contractQueries';
import { compareMicro } from '../../utils/bigintMath';
import PoolCompareModal from '../compare/PoolCompareModal';
import PoolActionMenu from '../actions/PoolActionMenu';

interface Column {
    id: string;
    label: string;
}

const columns: readonly Column[] = [
    { id: 'compare', label: '' },
    { id: 'rank', label: 'Rank' },
    { id: 'token', label: 'Token' },
    { id: 'address', label: 'Pool Address' },
    { id: 'status', label: 'Status' },
    { id: 'liquidity', label: 'Total Liquidity' },
    { id: 'feesCollected', label: 'Fees Collected' },
    { id: 'positions', label: 'LP Positions' },
    { id: 'committers', label: 'Committers' },
    { id: 'actions', label: '' },
];

/* ── Creator Pool Table ───────────────────────────────────────────── */

const CreatorPoolTable: React.FC = () => {
    const { page, rowsPerPage, paginate, paginationProps } = usePagination();
    const [rows, setRows] = React.useState<PoolSummary[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [comparedAddresses, setComparedAddresses] = React.useState<Set<string>>(new Set());
    const [showCompare, setShowCompare] = React.useState(false);

    React.useEffect(() => {
        async function loadPools() {
            try {
                if (!factoryAddress) {
                    setError('Factory address not configured. Set REACT_APP_FACTORY_ADDRESS env var.');
                    setLoading(false);
                    return;
                }
                const summaries = await fetchAllPoolSummaries(factoryAddress);
                summaries.sort((a, b) => compareMicro(b.totalLiquidity, a.totalLiquidity));
                setRows(summaries);
            } catch (err) {
                console.error('Error loading pools:', err);
                setError('Failed to load pool data from chain.');
            } finally {
                setLoading(false);
            }
        }
        loadPools();
    }, []);

    const toggleCompare = (addr: string) => {
        setComparedAddresses((prev) => {
            const next = new Set(prev);
            if (next.has(addr)) next.delete(addr);
            else next.add(addr);
            return next;
        });
    };

    if (loading) {
        return <TableStatePaper kind="loading" message="Loading pools from chain..." />;
    }

    if (error) {
        return <TableStatePaper kind="error" message={error} />;
    }

    if (rows.length === 0) {
        return <TableStatePaper kind="empty" message="No creator pools found on chain." />;
    }

    return (
        <>
            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                {/* Compare bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {comparedAddresses.size > 0 && (
                            <Chip
                                label={`${comparedAddresses.size} selected`}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                        )}
                    </Box>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<CompareArrowsIcon />}
                        disabled={comparedAddresses.size < 2}
                        onClick={() => setShowCompare(true)}
                    >
                        Compare Pools{comparedAddresses.size > 0 ? ` (${comparedAddresses.size})` : ''}
                    </Button>
                </Box>

                <TableContainer sx={{ maxHeight: 540, padding: '15px' }}>
                    <Table stickyHeader aria-label="creator pools table">
                        <TableHead>
                            <TableRow>
                                {columns.map((column) => (
                                    <TableCell key={column.id}>{column.label}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginate(rows)
                                .map((row, idx) => (
                                    <TableRow key={row.poolAddress} hover>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                size="small"
                                                checked={comparedAddresses.has(row.poolAddress)}
                                                onChange={() => toggleCompare(row.poolAddress)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">
                                                #{page * rowsPerPage + idx + 1}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Link to={`/creatorpool/${row.poolAddress}`}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Typography fontWeight="bold" variant="body2">{row.tokenSymbol}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{row.tokenName}</Typography>
                                                </Box>
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <CopyableId value={row.poolAddress}><Link to={`/creatorpool/${row.poolAddress}`}>
                                                {abbreviateAddress(row.poolAddress)}
                                            </Link></CopyableId>
                                        </TableCell>
                                        <TableCell>
                                            <PoolStatusChip thresholdReached={row.thresholdReached} />
                                        </TableCell>
                                        <TableCell>{formatMicroAmount(row.totalLiquidity)}</TableCell>
                                        <TableCell>{formatMicroAmount(row.totalFeesCollected0)}</TableCell>
                                        <TableCell>{row.totalPositions}</TableCell>
                                        <TableCell>{row.totalCommitters}</TableCell>
                                        <TableCell align="right">
                                            <PoolActionMenu
                                                poolAddress={row.poolAddress}
                                                tokenSymbol={row.tokenSymbol}
                                                creatorTokenAddress={row.creatorTokenAddress}
                                                thresholdReached={row.thresholdReached}
                                                compact
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination {...paginationProps(rows.length)} />
            </Paper>

            <PoolCompareModal
                open={showCompare}
                onClose={() => setShowCompare(false)}
                pools={rows.filter((r) => comparedAddresses.has(r.poolAddress))}
            />
        </>
    );
};

export default CreatorPoolTable;
