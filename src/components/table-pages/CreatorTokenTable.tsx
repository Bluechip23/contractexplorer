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
import { factoryAddress } from '../universal/IndividualPage.const';
import { usePagination, TableStatePaper, PoolStatusChip } from '../universal/tablePrimitives';
import {
    fetchAllPoolSummaries,
    formatMicroAmount,
    PoolSummary,
} from '../../utils/contractQueries';
import PoolCompareModal from '../compare/PoolCompareModal';
import { TOKEN_COMPARE_METRICS } from '../portfolio/poolMetrics';

interface Column {
    id: string;
    label: string;
}

const columns: readonly Column[] = [
    { id: 'compare', label: '' },
    { id: 'token', label: 'Token' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'totalSupply', label: 'Total Supply' },
    { id: 'poolLiquidity', label: 'Pool Liquidity' },
    { id: 'status', label: 'Status' },
    { id: 'committers', label: 'Committers' },
];

/* ── Creator Token Table ──────────────────────────────────────────── */

const CreatorTokenTable: React.FC = () => {
    const { paginate, paginationProps } = usePagination();
    const [rows, setRows] = React.useState<PoolSummary[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [comparedAddresses, setComparedAddresses] = React.useState<Set<string>>(new Set());
    const [showCompare, setShowCompare] = React.useState(false);

    React.useEffect(() => {
        async function loadTokens() {
            try {
                if (!factoryAddress) {
                    setError('Factory address not configured. Set REACT_APP_FACTORY_ADDRESS env var.');
                    setLoading(false);
                    return;
                }
                const summaries = await fetchAllPoolSummaries(factoryAddress);
                setRows(summaries);
            } catch (err) {
                console.error('Error loading tokens:', err);
                setError('Failed to load token data from chain.');
            } finally {
                setLoading(false);
            }
        }
        loadTokens();
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
        return <TableStatePaper kind="loading" message="Loading tokens from chain..." />;
    }

    if (error) {
        return <TableStatePaper kind="error" message={error} />;
    }

    if (rows.length === 0) {
        return <TableStatePaper kind="empty" message="No creator tokens found on chain." />;
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
                        Compare Tokens{comparedAddresses.size > 0 ? ` (${comparedAddresses.size})` : ''}
                    </Button>
                </Box>

                <TableContainer sx={{ maxHeight: 540, padding: '15px' }}>
                    <Table stickyHeader aria-label="creator tokens table">
                        <TableHead>
                            <TableRow>
                                {columns.map((column) => (
                                    <TableCell key={column.id}>{column.label}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginate(rows)
                                .map((row) => (
                                    <TableRow key={row.creatorTokenAddress || row.poolAddress} hover>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                size="small"
                                                checked={comparedAddresses.has(row.poolAddress)}
                                                onChange={() => toggleCompare(row.poolAddress)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Link to={`/creatortoken/${row.creatorTokenAddress}`}>
                                                {row.tokenName}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold">{row.tokenSymbol}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            {formatMicroAmount(row.totalSupply, row.tokenDecimals)}
                                        </TableCell>
                                        <TableCell>
                                            {formatMicroAmount(row.totalLiquidity)}
                                        </TableCell>
                                        <TableCell>
                                            <PoolStatusChip thresholdReached={row.thresholdReached} />
                                        </TableCell>
                                        <TableCell>{row.totalCommitters}</TableCell>
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
                title="Compare Tokens"
                metrics={TOKEN_COMPARE_METRICS}
                extraRows={[
                    { label: 'Total Supply', value: (p) => formatMicroAmount(p.totalSupply, p.tokenDecimals) },
                    { label: 'Pool Liquidity', value: (p) => formatMicroAmount(p.totalLiquidity) },
                ]}
            />
        </>
    );
};

export default CreatorTokenTable;
