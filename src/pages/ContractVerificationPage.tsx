import React, { useState } from 'react';
import PageShell from '../components/universal/PageShell';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Divider,
    Grid,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { apiEndpoint } from '../components/universal/IndividualPage.const';
import axios from 'axios';
import { CardSkeleton } from '../components/universal/LoadingSkeleton';

interface ContractInfo {
    address: string;
    codeId: string;
    creator: string;
    admin: string;
    label: string;
}

interface ContractState {
    models: { key: string; value: string }[];
}

const ContractVerificationPage: React.FC = () => {
    const [contractAddress, setContractAddress] = useState('');
    const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
    const [contractState, setContractState] = useState<ContractState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState(0);
    const [queryMsg, setQueryMsg] = useState('{}');
    const [queryResult, setQueryResult] = useState('');

    const fetchContract = async () => {
        if (!contractAddress) return;
        setLoading(true);
        setError('');
        setContractInfo(null);
        setContractState(null);

        try {
            const infoRes = await axios.get(
                `${apiEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}`
            );
            const info = infoRes.data.contract_info;
            setContractInfo({
                address: contractAddress,
                codeId: info.code_id,
                creator: info.creator,
                admin: info.admin || 'None',
                label: info.label,
            });

            try {
                const stateRes = await axios.get(
                    `${apiEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/state`
                );
                setContractState({ models: stateRes.data.models || [] });
            } catch {}
        } catch (err) {
            setError('Contract not found. Please check the address.');
        } finally {
            setLoading(false);
        }
    };

    const queryContract = async () => {
        if (!contractAddress || !queryMsg) return;
        setQueryResult('');
        try {
            const encoded = btoa(queryMsg);
            const res = await axios.get(
                `${apiEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encoded}`
            );
            setQueryResult(JSON.stringify(res.data.data, null, 2));
        } catch (err: any) {
            setQueryResult(`Error: ${err.response?.data?.message || err.message}`);
        }
    };

    return (
        <PageShell>
                <Grid item xs={10}>
                    <Typography variant="h4" sx={{ mb: 2 }}>
                        Smart Contract Explorer
                    </Typography>
                </Grid>
                <Grid item xs={10}>
                    <Card sx={{ mb: 2 }}>
                        <CardContent>
                            <Stack direction="row" spacing={2}>
                                <TextField
                                    label="Contract Address"
                                    fullWidth
                                    value={contractAddress}
                                    onChange={(e) => setContractAddress(e.target.value)}
                                />
                                <Button variant="contained" onClick={fetchContract} disabled={loading}>
                                    {loading ? 'Loading...' : 'Look Up'}
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                {error && (
                    <Grid item xs={10}>
                        <Alert severity="error">{error}</Alert>
                    </Grid>
                )}

                {loading && (
                    <Grid item xs={10}>
                        <CardSkeleton />
                    </Grid>
                )}

                {contractInfo && (
                    <Grid item xs={10}>
                        <Card>
                            <CardContent>
                                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                                    <Tab label="Info" />
                                    <Tab label="State" />
                                    <Tab label="Query" />
                                </Tabs>

                                {tab === 0 && (
                                    <Stack spacing={1}>
                                        <Typography><strong>Address:</strong> {contractInfo.address}</Typography>
                                        <Typography><strong>Code ID:</strong> {contractInfo.codeId}</Typography>
                                        <Typography><strong>Creator:</strong> {contractInfo.creator}</Typography>
                                        <Typography><strong>Admin:</strong> {contractInfo.admin}</Typography>
                                        <Typography><strong>Label:</strong> {contractInfo.label}</Typography>
                                    </Stack>
                                )}

                                {tab === 1 && (
                                    <Box>
                                        {contractState && contractState.models.length > 0 ? (
                                            <Box
                                                component="pre"
                                                sx={{
                                                    bgcolor: 'grey.100',
                                                    p: 2,
                                                    borderRadius: 1,
                                                    overflow: 'auto',
                                                    maxHeight: 400,
                                                    fontSize: '0.85rem',
                                                }}
                                            >
                                                {JSON.stringify(contractState.models, null, 2)}
                                            </Box>
                                        ) : (
                                            <Typography color="text.secondary">
                                                No state data available.
                                            </Typography>
                                        )}
                                    </Box>
                                )}

                                {tab === 2 && (
                                    <Stack spacing={2}>
                                        <TextField
                                            label="Query Message (JSON)"
                                            multiline
                                            rows={4}
                                            fullWidth
                                            value={queryMsg}
                                            onChange={(e) => setQueryMsg(e.target.value)}
                                            sx={{ fontFamily: 'monospace' }}
                                        />
                                        <Button variant="contained" onClick={queryContract}>
                                            Run Query
                                        </Button>
                                        {queryResult && (
                                            <Box
                                                component="pre"
                                                sx={{
                                                    bgcolor: 'grey.100',
                                                    p: 2,
                                                    borderRadius: 1,
                                                    overflow: 'auto',
                                                    maxHeight: 300,
                                                    fontSize: '0.85rem',
                                                }}
                                            >
                                                {queryResult}
                                            </Box>
                                        )}
                                    </Stack>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                )}
        </PageShell>
    );
};

export default ContractVerificationPage;
