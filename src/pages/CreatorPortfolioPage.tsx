import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    Stack,
    Tab,
    Tabs,
    Typography,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import InsightsIcon from '@mui/icons-material/Insights';
import PaidIcon from '@mui/icons-material/Paid';
import { Link } from 'react-router-dom';
import { Layout } from '../ui';
import BlockExpTopBar from '../navigation/BlockExpTopBar';
import BlockExpSideBar from '../navigation/BlockExpSideBar';
import BlockExplorerNavBar from '../navigation/BlockExplorerNavBar';
import GeneralStats from '../navigation/GeneralStats';
import { useWallet } from '../context/WalletContext';
import CreatePoolModal from '../components/actions/CreatePoolModal';
import TokenPerformanceMetrics from '../components/TokenPerformanceMetrics';
import { NotConnectedView } from '../components/universal/PortfolioShared';
import StatCard from '../components/universal/StatCard';
import PoolSelectorDropdown from '../components/portfolio/PoolSelectorDropdown';
import PoolCompareModal from '../components/compare/PoolCompareModal';
import { POOL_FOCUS_METRICS } from '../components/portfolio/poolMetrics';
import CreatorEarningsTab from '../components/portfolio/CreatorEarningsTab';
import NoPoolsView from '../components/portfolio/NoPoolsView';
import {
    fetchAllPoolSummaries,
    findPoolsByCreator,
    formatMicroAmount,
    PoolSummary,
} from '../utils/contractQueries';
import { safeBigInt } from '../utils/bigintMath';
import { factoryAddress } from '../components/universal/IndividualPage.const';

const CreatorPortfolioPage: React.FC = () => {
    const { address, balance } = useWallet();
    const [loading, setLoading] = useState(false);
    const [createdPools, setCreatedPools] = useState<PoolSummary[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loadKey, setLoadKey] = useState(0);
    const [selectedPool, setSelectedPool] = useState<PoolSummary | null>(null);
    const [comparedAddresses, setComparedAddresses] = useState<Set<string>>(new Set());
    const [showCompare, setShowCompare] = useState(false);
    const [poolTab, setPoolTab] = useState(0);

    useEffect(() => {
        if (!address || !factoryAddress) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const pools = await fetchAllPoolSummaries(factoryAddress);
                if (cancelled) return;
                const myPools = await findPoolsByCreator(pools, address);
                if (!cancelled) {
                    setCreatedPools(myPools);
                    if (myPools.length > 0 && !selectedPool) setSelectedPool(myPools[0]);
                }
            } catch (err) { console.error('Error loading creator portfolio:', err); }
            finally { if (!cancelled) setLoading(false); }
        }

        load();
        return () => { cancelled = true; };
    }, [address, loadKey]);

    const totalFeesEarned0 = createdPools.reduce<bigint>((s, p) => s + safeBigInt(p.totalFeesCollected0), 0n);
    const totalFeesEarned1 = createdPools.reduce<bigint>((s, p) => s + safeBigInt(p.totalFeesCollected1), 0n);
    const totalPoolLiquidity = createdPools.reduce<bigint>((s, p) => s + safeBigInt(p.totalLiquidity), 0n);
    const totalSubscribers = createdPools.reduce((s, p) => s + p.totalCommitters, 0);
    const totalLpPositions = createdPools.reduce((s, p) => s + p.totalPositions, 0);

    return (
        <Layout NavBar={<BlockExpTopBar />} SideBar={<BlockExpSideBar />}>
            <Grid container justifyContent="center" spacing={2}>
                <Grid item xs={12} md={10} sx={{ mt: '10px' }}>
                    <Stack spacing={2}><BlockExplorerNavBar /><GeneralStats /></Stack>
                </Grid>
                <Grid item xs={12} md={10}>
                    {!address ? <NotConnectedView /> : loading ? (
                        <Box sx={{ textAlign: 'center', py: 6 }}>
                            <CircularProgress />
                            <Typography variant="body2" sx={{ mt: 1 }}>Loading your creator pools...</Typography>
                        </Box>
                    ) : createdPools.length === 0 ? (
                        <>
                            <NoPoolsView onCreatePool={() => setShowCreateModal(true)} />
                            <CreatePoolModal
                                open={showCreateModal}
                                onClose={() => setShowCreateModal(false)}
                                onSuccess={() => setLoadKey((k) => k + 1)}
                            />
                        </>
                    ) : (
                        <Stack spacing={2}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                        <Box>
                                            <Typography variant="h5" fontWeight="bold" sx={{ mb: 0.5 }}>Creator Portfolio</Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{address}</Typography>
                                        </Box>
                                        <Button variant="outlined" onClick={() => setShowCreateModal(true)} startIcon={<RocketLaunchIcon />}>
                                            Create Another Pool
                                        </Button>
                                    </Box>
                                    {balance && <Typography variant="body2" sx={{ mt: 0.5 }}>Wallet Balance: <strong>{formatMicroAmount(balance.amount)} bluechip</strong></Typography>}
                                </CardContent>
                            </Card>

                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={4}><StatCard label="Pools Created" value={createdPools.length} /></Grid>
                                <Grid item xs={6} sm={4}><StatCard label="Total Subscribers" value={totalSubscribers} /></Grid>
                                <Grid item xs={6} sm={4}><StatCard label="Total LP Positions" value={totalLpPositions} /></Grid>
                                <Grid item xs={6} sm={4}><StatCard label="Total TVL" value={formatMicroAmount(totalPoolLiquidity.toString())} /></Grid>
                                <Grid item xs={6} sm={4}><StatCard label="Fees Earned (bluechip)" value={formatMicroAmount(totalFeesEarned0.toString())} /></Grid>
                                <Grid item xs={6} sm={4}><StatCard label="Fees Earned (Token)" value={formatMicroAmount(totalFeesEarned1.toString())} /></Grid>
                            </Grid>

                            <PoolSelectorDropdown
                                pools={createdPools}
                                selectedPool={selectedPool}
                                onSelectPool={setSelectedPool}
                                comparedPools={comparedAddresses}
                                onToggleCompare={(addr) => {
                                    setComparedAddresses((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(addr)) next.delete(addr);
                                        else next.add(addr);
                                        return next;
                                    });
                                }}
                                onCompare={() => setShowCompare(true)}
                            />

                            {selectedPool && (
                                <Card>
                                    <CardContent sx={{ pb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="h6" fontWeight="bold">
                                                {selectedPool.tokenSymbol}
                                            </Typography>
                                            <Chip
                                                label={selectedPool.thresholdReached ? 'Active' : 'Pre-threshold'}
                                                color={selectedPool.thresholdReached ? 'success' : 'warning'}
                                                size="small"
                                                variant="outlined"
                                            />
                                            <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                                                <Link to={`/creatorpool/${selectedPool.poolAddress}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                                    View full details →
                                                </Link>
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                    <Tabs
                                        value={poolTab}
                                        onChange={(_, v) => setPoolTab(v)}
                                        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
                                    >
                                        <Tab icon={<InsightsIcon fontSize="small" />} iconPosition="start" label="Performance" />
                                        <Tab icon={<PaidIcon fontSize="small" />} iconPosition="start" label="Earnings" />
                                    </Tabs>
                                    <CardContent>
                                        {poolTab === 0 && (
                                            <TokenPerformanceMetrics key={selectedPool.poolAddress} pool={selectedPool} />
                                        )}
                                        {poolTab === 1 && (
                                            <CreatorEarningsTab
                                                key={selectedPool.poolAddress}
                                                pools={createdPools}
                                                pool={selectedPool}
                                            />
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            <PoolCompareModal
                                open={showCompare}
                                onClose={() => setShowCompare(false)}
                                pools={createdPools.filter((p) => comparedAddresses.has(p.poolAddress))}
                                metrics={POOL_FOCUS_METRICS}
                                summaryMetrics={[
                                    { key: 'totalLiquidity', label: 'TVL' },
                                    { key: 'totalFeesCollected', label: 'Total Fees' },
                                    { key: 'totalCommitters', label: 'Committers' },
                                    { key: 'tokenPrice', label: 'Price' },
                                    { key: 'marketCap', label: 'Market Cap' },
                                ]}
                                showPerformance
                                maxWidth="xl"
                            />

                            <CreatePoolModal
                                open={showCreateModal}
                                onClose={() => setShowCreateModal(false)}
                                onSuccess={() => setLoadKey((k) => k + 1)}
                            />
                        </Stack>
                    )}
                </Grid>
            </Grid>
        </Layout>
    );
};

export default CreatorPortfolioPage;
