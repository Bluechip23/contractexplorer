import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    Grid,
    IconButton,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Stack,
    Switch,
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
import { sanitizeOnChainString, validateBech32Address } from '../utils/security';
import {
    abbreviateAddress,
    fetchAllPoolSummaries,
    findPoolsByCreator,
    PoolSummary,
} from '../utils/contractQueries';
import {
    addLink,
    CreatorLink,
    deleteLink,
    getProfile,
    isProfilesDemoMode,
    ProfileWithLinks,
    saveProfile,
    updateLink,
} from '../utils/profilesApi';
import { isSafeHttpUrl } from '../components/creator-links/LinkCard';
import EmbedSnippetCard from '../components/creator-links/EmbedSnippetCard';

const NAME_PATTERN = /^[a-zA-Z0-9 _.-]{3,32}$/;
const CUSTOM_POOL = '__custom__';

// Client-side mirror of the server's field rules so users get instant
// feedback; the server re-validates everything.
function checkProfileInput(name: string, bio: string, pool: string | null): string {
    if (!NAME_PATTERN.test(name.trim())) {
        return 'Display name must be 3-32 characters of letters, digits, spaces, "_", "." or "-".';
    }
    if (bio.trim().length > 280) return 'Bio must be at most 280 characters.';
    if (pool) {
        const check = validateBech32Address(pool);
        if (!check.ok) return `Pool address invalid: ${check.error}`;
    }
    return '';
}

function checkLinkInput(title: string, url: string): string {
    if (!title.trim() || title.trim().length > 80) return 'Title must be 1-80 characters.';
    if (url.length > 2048 || !isSafeHttpUrl(url)) return 'URL must be a valid http(s) address.';
    return '';
}

/**
 * Wallet-gated manage page (/mylinks): set display name + bio + pool, and
 * curate the public links list. Every mutation is an ADR-36-signed profiles
 * API call (nonce → signArbitrary → request), then the page refetches.
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
    const [customPool, setCustomPool] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSaved, setProfileSaved] = useState(false);

    // Link manager
    const [newTitle, setNewTitle] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [newGated, setNewGated] = useState(false);
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkError, setLinkError] = useState('');
    const [editing, setEditing] = useState<CreatorLink | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editGated, setEditGated] = useState(false);

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
                    setCustomPool('');
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
    const selectedPool = poolChoice === CUSTOM_POOL ? customPool.trim() : poolChoice;
    // The saved pool may not be one of the wallet's factory pools (free-text
    // entry) — keep it selectable rather than silently dropping it.
    const knownPoolAddresses = myPools.map((p) => p.poolAddress);
    const savedUnknownPool = profileData?.profile.pool_address
        && !knownPoolAddresses.includes(profileData.profile.pool_address)
        ? profileData.profile.pool_address
        : null;

    const handleSaveProfile = async () => {
        if (!address) return;
        setProfileError('');
        setProfileSaved(false);
        const validation = checkProfileInput(name, bio, selectedPool || null);
        if (validation) {
            setProfileError(validation);
            return;
        }
        setSavingProfile(true);
        try {
            const res = await saveProfile(address, walletName, {
                name: name.trim(),
                pool_address: selectedPool || null,
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
                gated: newGated,
            });
            if (res.ok) {
                setNewTitle('');
                setNewUrl('');
                setNewGated(false);
                refetch();
            } else {
                setLinkError(res.error);
            }
        } finally {
            setLinkBusy(false);
        }
    };

    const handleToggleGated = async (link: CreatorLink) => {
        if (!address) return;
        setLinkError('');
        setLinkBusy(true);
        try {
            const res = await updateLink(address, walletName, link.id, { gated: !link.gated });
            if (res.ok) refetch();
            else setLinkError(res.error);
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
        setEditGated(link.gated);
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
                gated: editGated,
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

    const publicPageKey = profileData?.profile.name || address;

    return (
        <PageShell>
            <Grid item xs={12} md={10}>
                {!address ? (
                    <NotConnectedView description="Connect your wallet to set up your creator links page: display name, bio, and subscriber-only links." />
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
                                        label="Creator pool"
                                        value={poolChoice}
                                        onChange={(e) => setPoolChoice(e.target.value)}
                                        fullWidth
                                        helperText="Subscribers to this pool can unlock your gated links"
                                    >
                                        <MenuItem value="">None</MenuItem>
                                        {myPools.map((p) => (
                                            <MenuItem key={p.poolAddress} value={p.poolAddress}>
                                                {p.tokenSymbol} — {abbreviateAddress(p.poolAddress)}
                                            </MenuItem>
                                        ))}
                                        {savedUnknownPool && (
                                            <MenuItem value={savedUnknownPool}>
                                                {abbreviateAddress(savedUnknownPool)} (saved)
                                            </MenuItem>
                                        )}
                                        <MenuItem value={CUSTOM_POOL}>Custom pool address…</MenuItem>
                                    </TextField>
                                    {poolChoice === CUSTOM_POOL && (
                                        <TextField
                                            label="Pool contract address"
                                            value={customPool}
                                            onChange={(e) => setCustomPool(e.target.value)}
                                            fullWidth
                                            placeholder="osmo1..."
                                        />
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
                                                            <Tooltip title="Subscribers only">
                                                                <Switch
                                                                    size="small"
                                                                    checked={link.gated}
                                                                    onChange={() => handleToggleGated(link)}
                                                                    disabled={linkBusy}
                                                                />
                                                            </Tooltip>
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
                                                        sx={{ pr: 22 }}
                                                        primary={
                                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                                {link.gated && <LockIcon sx={{ fontSize: 14 }} color="disabled" />}
                                                                <span>{sanitizeOnChainString(link.title, 80)}</span>
                                                            </Stack>
                                                        }
                                                        secondary={link.url
                                                            ? sanitizeOnChainString(link.url, 96)
                                                            : 'URL hidden (subscribers only)'}
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
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <FormControlLabel
                                                control={<Switch checked={newGated} onChange={(e) => setNewGated(e.target.checked)} />}
                                                label="Subscribers only"
                                            />
                                            <Button
                                                variant="contained"
                                                startIcon={<AddCircleIcon />}
                                                onClick={handleAddLink}
                                                disabled={linkBusy || !newTitle.trim() || !newUrl.trim() || links.length >= 50}
                                            >
                                                Add Link
                                            </Button>
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ) : (
                            <Alert severity="info">
                                Create your profile above to start adding links.
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
                            <FormControlLabel
                                control={<Switch checked={editGated} onChange={(e) => setEditGated(e.target.checked)} />}
                                label="Subscribers only"
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditing(null)} disabled={linkBusy}>Cancel</Button>
                        <Button variant="contained" onClick={handleSaveEdit} disabled={linkBusy}>
                            {linkBusy ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Grid>
        </PageShell>
    );
};

export default ManageLinksPage;
