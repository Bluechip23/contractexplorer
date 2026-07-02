import React, { useEffect, useState } from 'react';
import PageShell from '../components/universal/PageShell';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Typography,
    Paper,
    Alert,
} from '@mui/material';
import { apiEndpoint } from '../components/universal/IndividualPage.const';
import { formatAmount } from '../utils/txDecoder';
import { compareMicro, safeBigInt } from '../utils/bigintMath';
import axios from 'axios';
import { Link } from 'react-router-dom';
import CopyableId from '../components/universal/CopyableId';
import { TableSkeleton } from '../components/universal/LoadingSkeleton';

interface ValidatorInfo {
    operator_address: string;
    description: {
        moniker: string;
        identity: string;
        website: string;
        details: string;
    };
    status: string;
    tokens: string;
    commission: {
        commission_rates: {
            rate: string;
            max_rate: string;
            max_change_rate: string;
        };
    };
    jailed: boolean;
}

const StakingPage: React.FC = () => {
    const [validators, setValidators] = useState<ValidatorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [stakingPool, setStakingPool] = useState({ bonded: '0', notBonded: '0' });
    const [delegateDialog, setDelegateDialog] = useState(false);
    const [selectedValidator, setSelectedValidator] = useState<string>('');
    const [delegateAmount, setDelegateAmount] = useState('');
    const [walletAddress, setWalletAddress] = useState('');

    useEffect(() => {
        const fetchValidators = async () => {
            try {
                const [validatorsRes, poolRes] = await Promise.all([
                    axios.get(`${apiEndpoint}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`),
                    axios.get(`${apiEndpoint}/cosmos/staking/v1beta1/pool`),
                ]);
                const sorted = (validatorsRes.data.validators || []).sort(
                    (a: ValidatorInfo, b: ValidatorInfo) => compareMicro(b.tokens, a.tokens)
                );
                setValidators(sorted);
                setStakingPool({
                    bonded: poolRes.data.pool?.bonded_tokens || '0',
                    notBonded: poolRes.data.pool?.not_bonded_tokens || '0',
                });
            } catch (error) {
                console.error('Error fetching staking data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchValidators();
    }, []);

    const totalBonded = safeBigInt(stakingPool.bonded);

    const handleDelegate = (validatorAddr: string) => {
        setSelectedValidator(validatorAddr);
        setDelegateDialog(true);
    };

    return (
        <PageShell>
                <Grid item xs={10}>
                    <Typography variant="h4" sx={{ mb: 2 }}>
                        Staking
                    </Typography>
                </Grid>
                <Grid item xs={10}>
                    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                        <Card sx={{ flex: 1 }}>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary">
                                    Total Bonded
                                </Typography>
                                <Typography variant="h6">
                                    {formatAmount(stakingPool.bonded, 'ubluechip')} bluechip
                                </Typography>
                            </CardContent>
                        </Card>
                        <Card sx={{ flex: 1 }}>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary">
                                    Total Unbonded
                                </Typography>
                                <Typography variant="h6">
                                    {formatAmount(stakingPool.notBonded, 'ubluechip')} bluechip
                                </Typography>
                            </CardContent>
                        </Card>
                        <Card sx={{ flex: 1 }}>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary">
                                    Active Validators
                                </Typography>
                                <Typography variant="h6">{validators.length}</Typography>
                            </CardContent>
                        </Card>
                    </Stack>
                </Grid>
                <Grid item xs={10}>
                    {loading ? (
                        <TableSkeleton columns={6} rows={10} />
                    ) : (
                        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                            <TableContainer sx={{ maxHeight: 600, padding: '15px' }}>
                                <Typography variant="h5" sx={{ mb: 1 }}>
                                    Validators
                                </Typography>
                                <Table stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Rank</TableCell>
                                            <TableCell>Validator</TableCell>
                                            <TableCell>Voting Power</TableCell>
                                            <TableCell>Commission</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {validators
                                            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                            .map((v, i) => {
                                                const votingPower = totalBonded > 0n
                                                    ? (Number((safeBigInt(v.tokens) * 10000n) / totalBonded) / 100).toFixed(2)
                                                    : '0';
                                                return (
                                                    <TableRow key={v.operator_address}>
                                                        <TableCell>{page * rowsPerPage + i + 1}</TableCell>
                                                        <TableCell>
                                                            <CopyableId value={v.operator_address}><Link to={`/validator/${v.operator_address}`}>
                                                                {v.description.moniker || v.operator_address}
                                                            </Link></CopyableId>
                                                        </TableCell>
                                                        <TableCell>
                                                            {formatAmount(v.tokens, 'ubluechip')} ({votingPower}%)
                                                        </TableCell>
                                                        <TableCell>
                                                            {(parseFloat(v.commission.commission_rates.rate) * 100).toFixed(1)}%
                                                        </TableCell>
                                                        <TableCell>
                                                            {v.jailed ? (
                                                                <Chip label="Jailed" color="error" size="small" />
                                                            ) : (
                                                                <Chip label="Active" color="success" size="small" />
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                onClick={() => handleDelegate(v.operator_address)}
                                                            >
                                                                Delegate
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <TablePagination
                                rowsPerPageOptions={[10, 25, 100]}
                                component="div"
                                count={validators.length}
                                rowsPerPage={rowsPerPage}
                                page={page}
                                onPageChange={(_, p) => setPage(p)}
                                onRowsPerPageChange={(e) => {
                                    setRowsPerPage(parseInt(e.target.value, 10));
                                    setPage(0);
                                }}
                            />
                        </Paper>
                    )}
                </Grid>

            <Dialog open={delegateDialog} onClose={() => setDelegateDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Delegate to Validator</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Connect your Keplr wallet to delegate tokens. This will open a signing request.
                    </Alert>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Your Wallet Address"
                            fullWidth
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value)}
                        />
                        <TextField
                            label="Validator Address"
                            fullWidth
                            value={selectedValidator}
                            disabled
                        />
                        <TextField
                            label="Amount (bluechip)"
                            fullWidth
                            type="number"
                            value={delegateAmount}
                            onChange={(e) => setDelegateAmount(e.target.value)}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDelegateDialog(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            alert('Keplr wallet integration required. Connect your wallet to sign the delegation transaction.');
                            setDelegateDialog(false);
                        }}
                    >
                        Delegate
                    </Button>
                </DialogActions>
            </Dialog>
        </PageShell>
    );
};

export default StakingPage;
