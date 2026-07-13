import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    FormGroup,
    Grid,
    IconButton,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import LockIcon from '@mui/icons-material/Lock';
import PageShell from '../components/universal/PageShell';
import { useWallet } from '../context/WalletContext';
import { NotConnectedView } from '../components/universal/PortfolioShared';
import { factoryAddress } from '../components/universal/IndividualPage.const';
import { sanitizeOnChainString } from '../utils/security';
import { validateTokenAmount } from '../utils/security';
import {
    abbreviateAddress,
    fetchAllPoolSummaries,
    findPoolsByCreator,
    formatMicroAmount,
    PoolSummary,
} from '../utils/contractQueries';
import {
    addLink,
    addTier,
    CreatorLink,
    deleteLink,
    deleteTier,
    getProfile,
    isProfilesDemoMode,
    ProfileWithLinks,
    saveProfile,
    Tier,
    updateLink,
    updateTier,
} from '../utils/profilesApi';
import { isSafeHttpUrl } from '../components/creator-links/LinkCard';
import EmbedSnippetCard from '../components/creator-links/EmbedSnippetCard';

const NAME_PATTERN = /^[a-zA-Z0-9 _.-]{3,32}$/;
const MAX_TIERS = 5;

// Client-side mirror of the server's field rules so users get instant
// feedback; the server re-validates everything.
function checkProfileInput(name: string, bio: string): string {
    if (!NAME_PATTERN.test(name.trim())) {
        return 'Display name must be 3-32 characters of letters, digits, spaces, "_", "." or "-".';
    }
    if (bio.trim().length > 280) return 'Bio must be at most 280 characters.';
    return '';
}

function checkLinkInput(title: string, url: string): string {
    if (!title.trim() || title.trim().length > 80) return 'Title must be 1-80 characters.';
    if (url.length > 2048 || !isSafeHttpUrl(url)) return 'URL must be a valid http(s) address.';
    return '';
}

// "$12.50" (USD, 2dp on screen) ↔ micro-USD (6 decimals) using the audited
// string-math converter — never floats for money.
function priceToMicro(usd: string): { micro?: string; error?: string } {
    const res = validateTokenAmount(usd, 6);
    if (!res.ok) return { error: res.error };
    return { micro: res.micro };
}

function formatPriceUsd(micro: string): string {
    return `$${formatMicroAmount(micro, 6, 2)}`;
}

/**
 * Wallet-gated manage page (/mylinks): set display name + bio + featured pool,
 * define subscription tiers, and curate the public links list. Pools are only
 * ever chosen from those the wallet created on-chain (resolved via
 * findPoolsByCreator) — there is no free-text pool entry. Every mutation is an
 * ADR-36-signed profiles API call, then the page refetches.
 */
const ManageLinksPage: React.FC = () => {
    const { address, walletName } = useWallet();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [loadKey, setLoadKey] = useState(0);
    const [profileData, setProfileData] = useState<ProfileWithLinks | null>(null);
    const [myPools, setMyPools] = useState<PoolSummary[]>([]);
    const [demoMode, setDemoMode] = useState(false);

    // Profile form
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [poolChoice, setPoolChoice] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSaved, setProfileSaved] = useState(false);

    // Tier manager
    const [tierPool, setTierPool] = useState('');
    const [tierName, setTierName] = useState('');
    const [tierPrice, setTierPrice] = useState('');
    const [tierBusy, setTierBusy] = useState(false);
    const [tierError, setTierError] = useState('');
    const [editingTier, setEditingTier] = useState<Tier | null>(null);
    const [editTierName, setEditTierName] = useState('');
    const [editTierPrice, setEditTierPrice] = useState('');

    // Link manager
    const [newTitle, setNewTitle] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [newTierIds, setNewTierIds] = useState<number[]>([]);
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkError, setLinkError] = useState('');
    const [editing, setEditing] = useState<CreatorLink | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editTierIds, setEditTierIds] = useState<number[]>([]);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const [prof, demo] = await Promise.all([
                    getProfile(address),
                    isProfilesDemoMode(),
                ]);
                if (cancelled) return;
                setDemoMode(demo);
                setProfileData(prof);
                if (prof) {
                    setName(prof.profile.name);
                    setBio(prof.profile.bio ?? '');
                    setPoolChoice(prof.profile.pool_address ?? '');
                }
                if (factoryAddress) {
                    const pools = await fetchAllPoolSummaries(factoryAddress);
                    if (cancelled) return;
                    const mine = await findPoolsByCreator(pools, address);
                    if (!cancelled) setMyPools(mine);
                }
            } catch (err) {
                console.error('Error loading manage links page:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [address, loadKey]);

    const refetch = () => setLoadKey((k) => k + 1);
    const links = profileData
        ? [...profileData.links].sort((a, b) => a.position - b.position || a.id - b.id)
        : [];
    const tiers = useMemo(
        () => (profileData ? [...profileData.tiers].sort((a, b) => a.position - b.position || a.id - b.id) : []),
        [profileData],
    );

    // Symbol lookup for a pool the creator owns; falls back to an abbreviated
    // address when the pool is no longer in their owned set.
    const symbolForPool = (pool: string): string => {
        const match = myPools.find((p) => p.poolAddress === pool);
        return match ? sanitizeOnChainString(match.tokenSymbol, 16) : abbreviateAddress(pool);
    };

    const tierLabel = (t: Tier): string => `${sanitizeOnChainString(t.name, 40)} · ${symbolForPool(t.pool_address)} (${formatPriceUsd(t.price_usd)})`;

    // The saved featured pool may not be in the owned set (e.g. ownership
    // changed) — keep it selectable so saving the profile doesn't silently
    // drop it, but never expose a free-text field.
    const knownPoolAddresses = myPools.map((p) => p.poolAddress);
    const savedPool = profileData?.profile.pool_address ?? null;
    const savedUnknownPool = savedPool && !knownPoolAddresses.includes(savedPool) ? savedPool : null;

    const handleSaveProfile = async () => {
        if (!address) return;
        setProfileError('');
        setProfileSaved(false);
        const validation = checkProfileInput(name, bio);
        if (validation) {
            setProfileError(validation);
            return;
        }
        setSavingProfile(true);
        try {
            const res = await saveProfile(address, walletName, {
                name: name.trim(),
                pool_address: poolChoice || null,
                bio: bio.trim() || null,
            });
            if (res.ok) {
                setProfileSaved(true);
                refetch();
            } else {
                setProfileError(res.error);
            }
        } finally {
            setSavingProfile(false);
        }
    };

    // ---- Tiers ----------------------------------------------------------

    const handleAddTier = async () => {
        if (!address) return;
        setTierError('');
        if (!tierPool) { setTierError('Choose which of your pools this tier belongs to.'); return; }
        if (!tierName.trim() || tierName.trim().length > 40) { setTierError('Tier name must be 1-40 characters.'); return; }
        const { micro, error } = priceToMicro(tierPrice.trim());
        if (!micro) { setTierError(error || 'Enter a valid USD price.'); return; }
        setTierBusy(true);
        try {
            const res = await addTier(address, walletName, {
                pool_address: tierPool,
                name: tierName.trim(),
                price_usd: micro,
            });
            if (res.ok) {
                setTierName('');
                setTierPrice('');
                refetch();
            } else {
                setTierError(res.error);
            }
        } finally {
            setTierBusy(false);
        }
    };

    const openEditTier = (t: Tier) => {
        setEditingTier(t);
        setEditTierName(t.name);
        setEditTierPrice(formatMicroAmount(t.price_usd, 6, 2));
        setTierError('');
    };

    const handleSaveEditTier = async () => {
        if (!address || !editingTier) return;
        setTierError('');
        if (!editTierName.trim() || editTierName.trim().length > 40) { setTierError('Tier name must be 1-40 characters.'); return; }
        const { micro, error } = priceToMicro(editTierPrice.trim());
        if (!micro) { setTierError(error || 'Enter a valid USD price.'); return; }
        setTierBusy(true);
        try {
            const res = await updateTier(address, walletName, editingTier.id, {
                name: editTierName.trim(),
                price_usd: micro,
            });
            if (res.ok) {
                setEditingTier(null);
                refetch();
            } else {
                setTierError(res.error);
            }
        } finally {
            setTierBusy(false);
        }
    };

    const handleDeleteTier = async (t: Tier) => {
        if (!address) return;
        setTierError('');
        setTierBusy(true);
        try {
            const res = await deleteTier(address, walletName, t.id);
            if (res.ok) refetch();
            else setTierError(res.error);
        } finally {
            setTierBusy(false);
        }
    };

    // ---- Links ----------------------------------------------------------

    const toggleTierId = (list: number[], id: number): number[] =>
        (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

    const handleAddLink = async () => {
        if (!address) return;
        setLinkError('');
        const validation = checkLinkInput(newTitle, newUrl.trim());
        if (validation) {
            setLinkError(validation);
            return;
        }
        setLinkBusy(true);
        try {
            const res = await addLink(address, walletName, {
                title: newTitle.trim(),
                url: newUrl.trim(),
                tier_ids: newTierIds,
            });
            if (res.ok) {
                setNewTitle('');
                setNewUrl('');
                setNewTierIds([]);
                refetch();
            } else {
                setLinkError(res.error);
            }
        } finally {
            setLinkBusy(false);
        }
    };

    // Up/down reordering: swap the two neighbors' position values (fall back
    // to their list indices when positions collide). Two signed updates.
    const handleMove = async (index: number, direction: -1 | 1) => {
        if (!address) return;
        const target = index + direction;
        if (target < 0 || target >= links.length) return;
        const a = links[index];
        const b = links[target];
        const posA = a.position !== b.position ? b.position : target;
        const posB = a.position !== b.position ? a.position : index;
        setLinkError('');
        setLinkBusy(true);
        try {
            const resA = await updateLink(address, walletName, a.id, { position: posA });
            if (!resA.ok) {
                setLinkError(resA.error);
                return;
            }
            const resB = await updateLink(address, walletName, b.id, { position: posB });
            if (!resB.ok) setLinkError(resB.error);
            refetch();
        } finally {
            setLinkBusy(false);
        }
    };

    const handleDeleteLink = async (link: CreatorLink) => {
        if (!address) return;
        setLinkError('');
        setLinkBusy(true);
        try {
            const res = await deleteLink(address, walletName, link.id);
            if (res.ok) refetch();
            else setLinkError(res.error);
        } finally {
            setLinkBusy(false);
        }
    };

    const openEdit = (link: CreatorLink) => {
        setEditing(link);
        setEditTitle(link.title);
        setEditUrl(link.url ?? '');
        setEditTierIds(link.tier_ids ?? []);
    };

    const handleSaveEdit = async () => {
        if (!address || !editing) return;
        setLinkError('');
        // Public reads hide gated URLs, so an empty URL field here means
        // "keep the stored URL" rather than "clear it".
        const urlPatch = editUrl.trim() ? editUrl.trim() : undefined;
        const validation = checkLinkInput(editTitle, urlPatch ?? 'https://placeholder.invalid');
        if (validation) {
            setLinkError(validation);
            return;
        }
        setLinkBusy(true);
        try {
            const res = await updateLink(address, walletName, editing.id, {
                title: editTitle.trim(),
                url: urlPatch,
                tier_ids: editTierIds,
            });
            if (res.ok) {
                setEditing(null);
                refetch();
            } else {
                setLinkError(res.error);
            }
        } finally {
            setLinkBusy(false);
        }
    };

    // A checkbox list of every tier the creator has, used in both the add and
    // edit link forms. Selected ids drive tier_ids; ≥1 selected → gated.
    const TierCheckboxes: React.FC<{ selected: number[]; onToggle: (id: number) => void }> = ({ selected, onToggle }) => {
        if (tiers.length === 0) {
            return (
                <Typography variant="caption" color="text.secondary">
                    Define subscription tiers above to gate this link. With no tiers checked the link is public.
                </Typography>
            );
        }
        return (
            <Box>
                <Typography variant="caption" color="text.secondary">
                    Gate behind subscription tiers (leave all unchecked for a public link):
                </Typography>
                <FormGroup>
                    {tiers.map((t) => (
                        <FormControlLabel
                            key={t.id}
                            control={(
                                <Checkbox
                                    size="small"
                                    checked={selected.includes(t.id)}
                                    onChange={() => onToggle(t.id)}
                                />
                            )}
                            label={<Typography variant="body2">{tierLabel(t)}</Typography>}
                        />
                    ))}
                </FormGroup>
                <Typography variant="caption" color="text.secondary">
                    If you check several tiers in the same pool, the cheapest one sets the unlock price; any pool you satisfy unlocks the link.
                </Typography>
            </Box>
        );
    };

    const publicPageKey = profileData?.profile.name || address;
    const noOwnedPools = factoryAddress ? myPools.length === 0 : false;

    // Group tiers by pool for the tiers list display.
    const tiersByPool = useMemo(() => {
        const groups = new Map<string, Tier[]>();
        for (const t of tiers) {
            const arr = groups.get(t.pool_address) ?? [];
            arr.push(t);
            groups.set(t.pool_address, arr);
        }
        return [...groups.entries()];
    }, [tiers]);

    return (
        <PageShell>
            <Grid item xs={12} md={10}>
                {!address ? (
                    <NotConnectedView description="Connect your wallet to set up your creator links page: display name, bio, subscription tiers, and subscriber-only links." />
                ) : loading ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <CircularProgress />
                        <Typography variant="body2" sx={{ mt: 1 }}>Loading your links page...</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        {demoMode && (
                            <Alert severity="info">
                                Demo mode — your profile is stored locally in this browser
                                (no signatures required, nothing published).
                            </Alert>
                        )}

                        {/* Profile form */}
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                    <Box>
                                        <Typography variant="h5" fontWeight="bold">My Links Page</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                            {address}
                                        </Typography>
                                    </Box>
                                    {profileData && (
                                        <Button
                                            variant="outlined"
                                            startIcon={<LaunchIcon />}
                                            onClick={() => navigate(`/creator/${encodeURIComponent(publicPageKey!)}`)}
                                        >
                                            View my public page
                                        </Button>
                                    )}
                                </Box>
                                <Divider sx={{ my: 2 }} />
                                <Stack spacing={2}>
                                    <TextField
                                        label="Display name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        fullWidth
                                        helperText='3-32 characters: letters, digits, spaces, "_", "." or "-"'
                                    />
                                    <TextField
                                        label="Bio (optional)"
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        fullWidth
                                        multiline
                                        minRows={2}
                                        helperText={`${bio.trim().length}/280 characters`}
                                    />
                                    <TextField
                                        select
                                        label="Featured pool"
                                        value={poolChoice}
                                        onChange={(e) => setPoolChoice(e.target.value)}
                                        fullWidth
                                        helperText="Only pools your wallet created on-chain are listed"
                                    >
                                        <MenuItem value="">None</MenuItem>
                                        {myPools.map((p) => (
                                            <MenuItem key={p.poolAddress} value={p.poolAddress}>
                                                {sanitizeOnChainString(p.tokenSymbol, 16)} — {abbreviateAddress(p.poolAddress)}
                                            </MenuItem>
                                        ))}
                                        {savedUnknownPool && (
                                            <MenuItem value={savedUnknownPool}>
                                                {abbreviateAddress(savedUnknownPool)} (saved)
                                            </MenuItem>
                                        )}
                                    </TextField>
                                    {noOwnedPools && (
                                        <Alert severity="info">
                                            Your wallet hasn't created any pools yet. Create a creator pool to
                                            feature it here and to define subscription tiers.
                                        </Alert>
                                    )}
                                    {profileError && <Alert severity="error">{profileError}</Alert>}
                                    {profileSaved && !profileError && (
                                        <Alert severity="success" onClose={() => setProfileSaved(false)}>
                                            Profile saved.
                                        </Alert>
                                    )}
                                    <Button
                                        variant="contained"
                                        onClick={handleSaveProfile}
                                        disabled={savingProfile || !name.trim()}
                                        startIcon={savingProfile ? <CircularProgress size={16} color="inherit" /> : null}
                                    >
                                        {savingProfile ? 'Saving...' : profileData ? 'Update Profile' : 'Create Profile'}
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>

                        {/* Subscription tiers */}
                        {profileData && (
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>
                                        Subscription tiers ({tiers.length}/{MAX_TIERS})
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                        Named USD price points on the pools you created. Followers who commit at
                                        least a tier's price unlock the links gated by it.
                                    </Typography>
                                    {tierError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setTierError('')}>{tierError}</Alert>}

                                    {tiers.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                                            No tiers yet — add one below.
                                        </Typography>
                                    ) : (
                                        <Stack spacing={1.5} sx={{ mb: 1 }}>
                                            {tiersByPool.map(([pool, group]) => (
                                                <Box key={pool}>
                                                    <Chip size="small" label={symbolForPool(pool)} sx={{ mb: 0.5 }} />
                                                    <List dense disablePadding>
                                                        {group.map((t) => (
                                                            <ListItem
                                                                key={t.id}
                                                                disableGutters
                                                                secondaryAction={(
                                                                    <Stack direction="row" spacing={0.5}>
                                                                        <IconButton size="small" onClick={() => openEditTier(t)} disabled={tierBusy}>
                                                                            <EditIcon fontSize="small" />
                                                                        </IconButton>
                                                                        <IconButton size="small" onClick={() => handleDeleteTier(t)} disabled={tierBusy}>
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Stack>
                                                                )}
                                                            >
                                                                <ListItemText
                                                                    primary={sanitizeOnChainString(t.name, 40)}
                                                                    secondary={formatPriceUsd(t.price_usd)}
                                                                />
                                                            </ListItem>
                                                        ))}
                                                    </List>
                                                </Box>
                                            ))}
                                        </Stack>
                                    )}

                                    <Divider sx={{ my: 1.5 }} />
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>Add a tier</Typography>
                                    {tiers.length >= MAX_TIERS ? (
                                        <Alert severity="info">
                                            You've reached the maximum of {MAX_TIERS} tiers. Delete one to add another.
                                        </Alert>
                                    ) : (
                                        <Stack spacing={1.5}>
                                            <TextField
                                                select
                                                label="Pool"
                                                size="small"
                                                value={tierPool}
                                                onChange={(e) => setTierPool(e.target.value)}
                                                fullWidth
                                                helperText="Only pools your wallet created on-chain"
                                                disabled={myPools.length === 0}
                                            >
                                                {myPools.map((p) => (
                                                    <MenuItem key={p.poolAddress} value={p.poolAddress}>
                                                        {sanitizeOnChainString(p.tokenSymbol, 16)} — {abbreviateAddress(p.poolAddress)}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                                <TextField
                                                    label="Tier name"
                                                    size="small"
                                                    value={tierName}
                                                    onChange={(e) => setTierName(e.target.value)}
                                                    fullWidth
                                                    placeholder="e.g. Gold"
                                                />
                                                <TextField
                                                    label="Price (USD)"
                                                    size="small"
                                                    value={tierPrice}
                                                    onChange={(e) => setTierPrice(e.target.value)}
                                                    fullWidth
                                                    placeholder="12.50"
                                                    InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
                                                />
                                            </Stack>
                                            <Box>
                                                <Button
                                                    variant="contained"
                                                    startIcon={<AddCircleIcon />}
                                                    onClick={handleAddTier}
                                                    disabled={tierBusy || myPools.length === 0 || !tierName.trim() || !tierPrice.trim() || !tierPool}
                                                >
                                                    Add Tier
                                                </Button>
                                            </Box>
                                        </Stack>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Link manager */}
                        {profileData ? (
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                                        Links ({links.length}/50)
                                    </Typography>
                                    {linkError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setLinkError('')}>{linkError}</Alert>}
                                    {links.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                            No links yet — add your first one below.
                                        </Typography>
                                    ) : (
                                        <List dense>
                                            {links.map((link, i) => (
                                                <ListItem
                                                    key={link.id}
                                                    divider={i < links.length - 1}
                                                    secondaryAction={
                                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                                            <IconButton size="small" onClick={() => handleMove(i, -1)} disabled={linkBusy || i === 0}>
                                                                <ArrowUpwardIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => handleMove(i, 1)} disabled={linkBusy || i === links.length - 1}>
                                                                <ArrowDownwardIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => openEdit(link)} disabled={linkBusy}>
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => handleDeleteLink(link)} disabled={linkBusy}>
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Stack>
                                                    }
                                                >
                                                    <ListItemText
                                                        sx={{ pr: 18 }}
                                                        primary={
                                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                                {link.gated && <LockIcon sx={{ fontSize: 14 }} color="disabled" />}
                                                                <span>{sanitizeOnChainString(link.title, 80)}</span>
                                                            </Stack>
                                                        }
                                                        secondary={
                                                            <>
                                                                {link.url ? sanitizeOnChainString(link.url, 96) : 'URL hidden (subscribers only)'}
                                                                {link.gated && link.tier_ids.length > 0 && (
                                                                    <Box component="span" sx={{ display: 'block', mt: 0.25 }}>
                                                                        {link.tier_ids
                                                                            .map((id) => tiers.find((t) => t.id === id))
                                                                            .filter((t): t is Tier => !!t)
                                                                            .map((t) => tierLabel(t))
                                                                            .join(' · ')}
                                                                    </Box>
                                                                )}
                                                            </>
                                                        }
                                                    />
                                                </ListItem>
                                            ))}
                                        </List>
                                    )}

                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>Add a link</Typography>
                                    <Stack spacing={1.5}>
                                        <TextField
                                            label="Title"
                                            size="small"
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            fullWidth
                                        />
                                        <TextField
                                            label="URL"
                                            size="small"
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            fullWidth
                                            placeholder="https://..."
                                        />
                                        <TierCheckboxes selected={newTierIds} onToggle={(id) => setNewTierIds((prev) => toggleTierId(prev, id))} />
                                        <Box>
                                            <Button
                                                variant="contained"
                                                startIcon={<AddCircleIcon />}
                                                onClick={handleAddLink}
                                                disabled={linkBusy || !newTitle.trim() || !newUrl.trim() || links.length >= 50}
                                            >
                                                Add Link
                                            </Button>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ) : (
                            <Alert severity="info">
                                Create your profile above to start adding tiers and links.
                            </Alert>
                        )}

                        {/* Widget embed snippet */}
                        {profileData?.profile.pool_address && (
                            <EmbedSnippetCard poolAddress={profileData.profile.pool_address} />
                        )}
                    </Stack>
                )}

                {/* Edit link dialog */}
                <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
                    <DialogTitle>Edit link</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField
                                label="Title"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="URL"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                fullWidth
                                placeholder="https://..."
                                helperText={editing && !editing.url
                                    ? 'Leave blank to keep the current (hidden) URL'
                                    : undefined}
                            />
                            <TierCheckboxes selected={editTierIds} onToggle={(id) => setEditTierIds((prev) => toggleTierId(prev, id))} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditing(null)} disabled={linkBusy}>Cancel</Button>
                        <Button variant="contained" onClick={handleSaveEdit} disabled={linkBusy}>
                            {linkBusy ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Edit tier dialog */}
                <Dialog open={!!editingTier} onClose={() => setEditingTier(null)} maxWidth="xs" fullWidth>
                    <DialogTitle>Edit tier</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Tooltip title="Move a tier to another pool by deleting it and creating a new one">
                                <TextField
                                    label="Pool"
                                    value={editingTier ? symbolForPool(editingTier.pool_address) : ''}
                                    fullWidth
                                    disabled
                                />
                            </Tooltip>
                            <TextField
                                label="Tier name"
                                value={editTierName}
                                onChange={(e) => setEditTierName(e.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="Price (USD)"
                                value={editTierPrice}
                                onChange={(e) => setEditTierPrice(e.target.value)}
                                fullWidth
                                InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
                            />
                            {tierError && <Alert severity="error">{tierError}</Alert>}
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditingTier(null)} disabled={tierBusy}>Cancel</Button>
                        <Button variant="contained" onClick={handleSaveEditTier} disabled={tierBusy}>
                            {tierBusy ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Grid>
        </PageShell>
    );
};

export default ManageLinksPage;
