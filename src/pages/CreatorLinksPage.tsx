import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    LinearProgress,
    Stack,
    Typography,
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PageShell from '../components/universal/PageShell';
import { useWallet } from '../context/WalletContext';
import { sanitizeOnChainString, validateBech32Address } from '../utils/security';
import {
    abbreviateAddress,
    fetchPoolSummary,
    formatMicroAmount,
    microToNumber,
    PoolSummary,
    queryPoolCreator,
} from '../utils/contractQueries';
import {
    CreatorLink,
    getProfile,
    isProfilesDemoMode,
    ProfileWithLinks,
    unlockLinks,
} from '../utils/profilesApi';
import CommitDialog from '../components/creator-links/CommitDialog';
import ProvideLiquidityDialog from '../components/creator-links/ProvideLiquidityDialog';
import LinkCard from '../components/creator-links/LinkCard';
import ProfileSearchBox from '../components/creator-links/ProfileSearchBox';

// One compact line of pool context under the creator header: raise progress
// while the pool is funding, price + subscriber count once fully committed.
const PoolStatsRow: React.FC<{ pool: PoolSummary }> = ({ pool }) => {
    if (pool.thresholdReached) {
        const price = parseFloat(pool.currentPrice1to0);
        return (
            <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" color="success" label="Fully committed" />
                {Number.isFinite(price) && price > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        1 {pool.tokenSymbol} ≈ {price.toFixed(6)} OSMO
                    </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                    {pool.totalCommitters} subscribers
                </Typography>
            </Stack>
        );
    }
    const raisedNum = microToNumber(pool.raised);
    const targetNum = microToNumber(pool.target);
    const pct = targetNum > 0 ? Math.min(100, (raisedNum / targetNum) * 100) : 0;
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Raised ${formatMicroAmount(pool.raised)} of ${formatMicroAmount(pool.target)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {pool.totalCommitters} subscribers
                </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} sx={{ borderRadius: 1, height: 8 }} />
        </Box>
    );
};

/**
 * Public link-in-bio page for a creator: /creator/:idOrName where the param
 * is a profile name, wallet address, or pool address. Gated links unlock
 * after the profiles service confirms the viewer's on-chain subscription
 * (committing_info on the creator's pool).
 */
const CreatorLinksPage: React.FC = () => {
    const { idOrName } = useParams<{ idOrName: string }>();
    const { address, walletName, connect } = useWallet();

    const [loading, setLoading] = useState(true);
    const [profileData, setProfileData] = useState<ProfileWithLinks | null>(null);
    const [poolAddress, setPoolAddress] = useState<string | null>(null);
    const [poolSummary, setPoolSummary] = useState<PoolSummary | null>(null);
    // Set when the param is a pool address with no profile behind it.
    const [bareCreator, setBareCreator] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [unlockedUrls, setUnlockedUrls] = useState<Record<number, string>>({});
    const [unlockBusy, setUnlockBusy] = useState(false);
    const [unlockError, setUnlockError] = useState('');
    const [commitOpen, setCommitOpen] = useState(false);
    const [liquidityOpen, setLiquidityOpen] = useState(false);

    useEffect(() => {
        if (!idOrName) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setProfileData(null);
            setPoolAddress(null);
            setPoolSummary(null);
            setBareCreator(null);
            setNotFound(false);
            setUnlockedUrls({});
            setUnlockError('');
            try {
                let pool: string | null = null;
                const prof = await getProfile(idOrName!);
                if (cancelled) return;
                if (prof) {
                    setProfileData(prof);
                    pool = prof.profile.pool_address;
                } else if (validateBech32Address(idOrName!).ok) {
                    // No profile — maybe the param is a bare pool address.
                    const creator = await queryPoolCreator(idOrName!);
                    if (cancelled) return;
                    if (creator) {
                        setBareCreator(creator);
                        pool = idOrName!;
                    } else {
                        setNotFound(true);
                    }
                } else {
                    setNotFound(true);
                }
                if (pool) {
                    setPoolAddress(pool);
                    const summary = await fetchPoolSummary(pool);
                    if (!cancelled) setPoolSummary(summary);
                }
            } catch (err) {
                console.error('Error loading creator links page:', err);
                if (!cancelled) setNotFound(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [idOrName]);

    const links = profileData
        ? [...profileData.links].sort((a, b) => a.position - b.position || a.id - b.id)
        : [];
    const lockedLinks = links.filter((l) => l.gated && !unlockedUrls[l.id]);
    const ownerKey = profileData?.profile.wallet_address ?? idOrName ?? '';

    const mergeUnlocked = useCallback((revealed: CreatorLink[]) => {
        setUnlockedUrls((prev) => {
            const next = { ...prev };
            for (const l of revealed) {
                if (l.url) next[l.id] = l.url;
            }
            return next;
        });
    }, []);

    // Verify the viewer's subscription and reveal gated URLs. The profiles
    // service performs the real committing_info check; demo mode unlocks
    // immediately (no signature possible without an extension).
    const handleVerifySubscription = useCallback(async () => {
        if (!address) {
            await connect();
            return;
        }
        setUnlockBusy(true);
        setUnlockError('');
        try {
            const res = await unlockLinks(address, walletName, ownerKey);
            if (res.ok) mergeUnlocked(res.value ?? []);
            else setUnlockError(res.error);
        } finally {
            setUnlockBusy(false);
        }
    }, [address, walletName, ownerKey, connect, mergeUnlocked]);

    // Demo mode: gated links unlock automatically for a connected (demo)
    // wallet so the whole feature is browsable without a real subscription.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!profileData || !address) return;
            if (!profileData.links.some((l) => l.gated)) return;
            if (!(await isProfilesDemoMode())) return;
            const res = await unlockLinks(address, walletName, profileData.profile.wallet_address);
            if (!cancelled && res.ok) mergeUnlocked(res.value ?? []);
        })();
        return () => { cancelled = true; };
    }, [profileData, address, walletName, mergeUnlocked]);

    const actionsRow = poolAddress && (
        <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button
                variant="contained"
                startIcon={<VolunteerActivismIcon />}
                onClick={() => (address ? setCommitOpen(true) : connect())}
            >
                Commit / Subscribe
            </Button>
            <Button
                variant="outlined"
                startIcon={<AddCircleIcon />}
                onClick={() => (address ? setLiquidityOpen(true) : connect())}
            >
                Provide Liquidity
            </Button>
        </Stack>
    );

    const dialogs = poolAddress && (
        <>
            <CommitDialog
                open={commitOpen}
                onClose={() => setCommitOpen(false)}
                poolAddress={poolAddress}
                tokenSymbol={poolSummary?.tokenSymbol}
                thresholdReached={poolSummary?.thresholdReached ?? false}
            />
            <ProvideLiquidityDialog
                open={liquidityOpen}
                onClose={() => setLiquidityOpen(false)}
                poolAddress={poolAddress}
                tokenSymbol={poolSummary?.tokenSymbol}
                creatorTokenAddress={poolSummary?.creatorTokenAddress ?? undefined}
            />
        </>
    );

    return (
        <PageShell>
            <Grid item xs={12} md={10}>
                <Box sx={{ maxWidth: 680, mx: 'auto' }}>
                    {loading ? (
                        <Box sx={{ textAlign: 'center', py: 6 }}>
                            <CircularProgress />
                            <Typography variant="body2" sx={{ mt: 1 }}>Loading creator page...</Typography>
                        </Box>
                    ) : notFound ? (
                        <Stack spacing={2}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography variant="h6" sx={{ mb: 0.5 }}>Creator not found</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        No profile or pool matches "{sanitizeOnChainString(idOrName, 48)}".
                                    </Typography>
                                </CardContent>
                            </Card>
                            <ProfileSearchBox />
                        </Stack>
                    ) : profileData ? (
                        <Stack spacing={2}>
                            {/* Creator header */}
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h4" fontWeight="bold">
                                        {sanitizeOnChainString(profileData.profile.name, 32)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                                        {abbreviateAddress(profileData.profile.wallet_address)}
                                    </Typography>
                                    {profileData.profile.bio && (
                                        <Typography variant="body1" sx={{ mt: 1.5 }}>
                                            {sanitizeOnChainString(profileData.profile.bio, 280)}
                                        </Typography>
                                    )}
                                    {poolAddress && poolSummary && (
                                        <Chip
                                            size="small"
                                            label={poolSummary.tokenSymbol}
                                            component={RouterLink}
                                            to={`/creatorpool/${poolAddress}`}
                                            clickable
                                            sx={{ mt: 1.5 }}
                                        />
                                    )}
                                    {poolSummary && (
                                        <Box sx={{ mt: 2 }}>
                                            <PoolStatsRow pool={poolSummary} />
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>

                            {actionsRow}

                            {/* Gated-links hint + verification */}
                            {lockedLinks.length > 0 && (
                                <Alert
                                    severity="info"
                                    icon={<LockOpenIcon fontSize="small" />}
                                    action={
                                        <Stack direction="row" spacing={1}>
                                            {poolAddress && (
                                                <Button size="small" onClick={() => (address ? setCommitOpen(true) : connect())}>
                                                    Subscribe
                                                </Button>
                                            )}
                                            <Button size="small" onClick={handleVerifySubscription} disabled={unlockBusy}>
                                                {unlockBusy ? 'Checking...' : address ? 'Already subscribed?' : 'Connect wallet'}
                                            </Button>
                                        </Stack>
                                    }
                                >
                                    Subscribe to unlock {lockedLinks.length} link{lockedLinks.length === 1 ? '' : 's'}.
                                </Alert>
                            )}
                            {unlockError && <Alert severity="warning">{unlockError}</Alert>}

                            {/* The links */}
                            {links.length === 0 ? (
                                <Card>
                                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            This creator hasn't added any links yet.
                                        </Typography>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Stack spacing={1.5}>
                                    {links.map((link) => (
                                        <LinkCard
                                            key={link.id}
                                            link={link}
                                            unlockedUrl={unlockedUrls[link.id]}
                                            onLockedClick={handleVerifySubscription}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </Stack>
                    ) : (
                        /* Pool address with no profile behind it */
                        <Stack spacing={2}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h5" fontWeight="bold">
                                        {poolSummary ? sanitizeOnChainString(poolSummary.tokenName, 64) : 'Creator Pool'}
                                    </Typography>
                                    {bareCreator && (
                                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                                            Creator: {abbreviateAddress(bareCreator)}
                                        </Typography>
                                    )}
                                    {poolAddress && poolSummary && (
                                        <Chip
                                            size="small"
                                            label={poolSummary.tokenSymbol}
                                            component={RouterLink}
                                            to={`/creatorpool/${poolAddress}`}
                                            clickable
                                            sx={{ mt: 1.5 }}
                                        />
                                    )}
                                    {poolSummary && (
                                        <Box sx={{ mt: 2 }}>
                                            <PoolStatsRow pool={poolSummary} />
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                            <Alert severity="info">
                                This creator hasn't set up a links page yet — you can still
                                subscribe or provide liquidity below.
                            </Alert>
                            {actionsRow}
                        </Stack>
                    )}
                    {dialogs}
                </Box>
            </Grid>
        </PageShell>
    );
};

export default CreatorLinksPage;
