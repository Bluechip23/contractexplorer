import React, { useEffect, useState } from 'react';
import {
    Card,
    CardContent,
    Grid,
    Stack,
    Tab,
    Tabs,
    Typography,
} from '@mui/material';
import PageShell from '../components/universal/PageShell';
import { useWallet } from '../context/WalletContext';
import { TabPanel, NotConnectedView } from '../components/universal/PortfolioShared';
import StatCard from '../components/universal/StatCard';
import PortfolioCommitmentsTable from '../components/portfolio/PortfolioCommitmentsTable';
import PortfolioPositionsTable from '../components/portfolio/PortfolioPositionsTable';
import PortfolioTransactionsTable from '../components/portfolio/PortfolioTransactionsTable';
import PortfolioHoldingsTable from '../components/portfolio/PortfolioHoldingsTable';
import { MyCommitment, MyPosition } from '../components/portfolio/types';
import {
    fetchAllPoolSummaries,
    queryPoolCommits,
    queryPositions,
    queryWalletHoldings,
    formatMicroAmount,
    WalletHolding,
} from '../utils/contractQueries';
import { safeBigInt } from '../utils/bigintMath';
import { factoryAddress } from '../components/universal/IndividualPage.const';

const ChainPortfolioPage: React.FC = () => {
    const { address, balance } = useWallet();
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [commitments, setCommitments] = useState<MyCommitment[]>([]);
    const [positions, setPositions] = useState<MyPosition[]>([]);
    const [holdings, setHoldings] = useState<WalletHolding[]>([]);

    useEffect(() => {
        if (!address || !factoryAddress) return;
        let cancelled = false;

        async function loadPortfolio() {
            setLoading(true);
            try {
                const pools = await fetchAllPoolSummaries(factoryAddress);
                if (cancelled) return;

                const myCommitments: MyCommitment[] = [];
                const myPositions: MyPosition[] = [];

                // Process pools in batches of 3 to limit concurrent requests
                const BATCH_SIZE = 3;
                for (let i = 0; i < pools.length; i += BATCH_SIZE) {
                    if (cancelled) return;
                    const batch = pools.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (pool) => {
                        const commits = await queryPoolCommits(pool.poolAddress);
                        if (commits?.committers) {
                            const myCommit = commits.committers.find((c) => c.wallet === address);
                            if (myCommit) myCommitments.push({ pool, commit: myCommit });
                        }
                        if (pool.thresholdReached) {
                            const positionsResp = await queryPositions(pool.poolAddress);
                            if (positionsResp?.positions) {
                                positionsResp.positions
                                    .filter((p) => p.owner === address)
                                    .forEach((p) => myPositions.push({ pool, position: p }));
                            }
                        }
                    }));
                }

                const myHoldings = await queryWalletHoldings(address, pools);
                if (!cancelled) { setCommitments(myCommitments); setPositions(myPositions); setHoldings(myHoldings); }
            } catch (err) { console.error('Error loading portfolio:', err); }
            finally { if (!cancelled) setLoading(false); }
        }

        loadPortfolio();
        return () => { cancelled = true; };
    }, [address]);

    const totalCommittedUsd = commitments.reduce<bigint>((sum, c) => sum + safeBigInt(c.commit.total_paid_usd), 0n);
    const totalCommittedBluechip = commitments.reduce<bigint>((sum, c) => sum + safeBigInt(c.commit.total_paid_bluechip), 0n);
    const totalUnclaimedFees0 = positions.reduce<bigint>((sum, p) => sum + safeBigInt(p.position.unclaimed_fees_0), 0n);
    const totalUnclaimedFees1 = positions.reduce<bigint>((sum, p) => sum + safeBigInt(p.position.unclaimed_fees_1), 0n);
    const totalLiquidity = positions.reduce<bigint>((sum, p) => sum + safeBigInt(p.position.liquidity), 0n);
    const lastFeeCollection = positions.reduce((latest, p) => { const ts = p.position.last_fee_collection || 0; return ts > latest ? ts : latest; }, 0);

    return (
        <PageShell>
                <Grid item xs={12} md={10}>
                    {!address ? <NotConnectedView /> : (
                        <Stack spacing={2}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>Chain Portfolio</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{address}</Typography>
                                    {balance && <Typography variant="body2" sx={{ mt: 0.5 }}>Wallet Balance: <strong>{formatMicroAmount(balance.amount)} bluechip</strong></Typography>}
                                </CardContent>
                            </Card>

                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={3}><StatCard label="Tokens Held" value={holdings.length + (balance && safeBigInt(balance.amount) > 0n ? 1 : 0)} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Pools Committed" value={commitments.length} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Total Committed (USD)" value={`$${formatMicroAmount(totalCommittedUsd.toString())}`} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Total Committed (bluechip)" value={formatMicroAmount(totalCommittedBluechip.toString())} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="LP Positions" value={positions.length} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Total Liquidity Provided" value={formatMicroAmount(totalLiquidity.toString())} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Unclaimed Fees (bluechip)" value={formatMicroAmount(totalUnclaimedFees0.toString())} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Unclaimed Fees (Token)" value={formatMicroAmount(totalUnclaimedFees1.toString())} /></Grid>
                                <Grid item xs={6} sm={3}><StatCard label="Last Fee Collection" value={lastFeeCollection > 0 ? new Date(lastFeeCollection * 1000).toLocaleDateString() : 'Never'} /></Grid>
                            </Grid>

                            <Card>
                                <CardContent sx={{ pb: 0 }}>
                                    <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                        <Tab label={`My Holdings (${holdings.length + (balance && safeBigInt(balance.amount) > 0n ? 1 : 0)})`} />
                                        <Tab label={`Pools I Committed To (${commitments.length})`} />
                                        <Tab label={`My LP Positions (${positions.length})`} />
                                        <Tab label="My Transactions" />
                                    </Tabs>
                                </CardContent>
                                <CardContent>
                                    <TabPanel value={tab} index={0}><PortfolioHoldingsTable holdings={holdings} nativeBalance={balance?.amount || null} loading={loading} /></TabPanel>
                                    <TabPanel value={tab} index={1}><PortfolioCommitmentsTable commitments={commitments} loading={loading} /></TabPanel>
                                    <TabPanel value={tab} index={2}><PortfolioPositionsTable positions={positions} loading={loading} /></TabPanel>
                                    <TabPanel value={tab} index={3}><PortfolioTransactionsTable commitments={commitments} positions={positions} loading={loading} /></TabPanel>
                                </CardContent>
                            </Card>
                        </Stack>
                    )}
                </Grid>
        </PageShell>
    );
};

export default ChainPortfolioPage;
