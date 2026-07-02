import React, { useEffect, useState } from 'react';
import { PoolStatusChip } from '../../components/universal/tablePrimitives';
import { Card, CardContent, CircularProgress, Divider, Grid, Typography, Box } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import {
    queryTokenInfo,
    fetchAllPoolSummaries,
    formatMicroAmount,
    abbreviateAddress,
    CW20TokenInfo,
    PoolSummary,
} from '../../utils/contractQueries';
import { factoryAddress } from '../../components/universal/IndividualPage.const';
import CopyableId from '../../components/universal/CopyableId';

const CreatorTokenPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [tokenInfo, setTokenInfo] = useState<CW20TokenInfo | null>(null);
    const [pool, setPool] = useState<PoolSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchToken = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const ti = await queryTokenInfo(id);
                setTokenInfo(ti);

                if (factoryAddress) {
                    const summaries = await fetchAllPoolSummaries(factoryAddress);
                    const match = summaries.find(s => s.creatorTokenAddress === id);
                    if (match) setPool(match);
                }
            } catch (error) {
                console.error('Error fetching token:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchToken();
    }, [id]);

    if (!id) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Token Not Found</Typography></Grid></PageShell>;
    }

    return (
        <PageShell width={8}>
                <Grid item xs={12} md={8}>
                    {loading ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <CircularProgress />
                            <Typography variant="body2" sx={{ mt: 1 }}>Loading token data from chain...</Typography>
                        </Box>
                    ) : !tokenInfo ? (
                        <Typography color="error">Could not load token data for this address.</Typography>
                    ) : (
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                    <Typography variant='h5'>{tokenInfo.name} ({tokenInfo.symbol})</Typography>
                                    {pool && (
                                        <PoolStatusChip thresholdReached={pool.thresholdReached} variant="filled" />
                                    )}
                                </Box>
                                <Divider />
                                <Typography sx={{ mt: 1 }}>Contract Address: <CopyableId value={id}>{abbreviateAddress(id)}</CopyableId></Typography>
                                <Typography>Decimals: {tokenInfo.decimals}</Typography>
                                <Typography>Total Supply: {formatMicroAmount(tokenInfo.total_supply, tokenInfo.decimals)}</Typography>
                                {pool && (
                                    <>
                                        <Divider sx={{ my: 1 }} />
                                        <Typography variant="subtitle2" color="text.secondary">Pool Info</Typography>
                                        <Typography>
                                            Pool: <CopyableId value={pool.poolAddress}><Link to={`/creatorpool/${pool.poolAddress}`} style={{ color: '#1976d2' }}>{abbreviateAddress(pool.poolAddress)}</Link></CopyableId>
                                        </Typography>
                                        <Typography>Total Liquidity: {formatMicroAmount(pool.totalLiquidity)}</Typography>
                                        <Typography>LP Positions: {pool.totalPositions}</Typography>
                                        <Typography>Committers: {pool.totalCommitters}</Typography>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </Grid>
        </PageShell>
    );
};

export default CreatorTokenPage;
