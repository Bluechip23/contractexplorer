import React, { useCallback, useEffect, useState } from 'react';
import {
    Button,
    Card,
    CardContent,
    Chip,
    Grid,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import HotTubIcon from '@mui/icons-material/HotTub';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import PageShell from '../components/universal/PageShell';
import { profilesApiUrl } from '../components/universal/IndividualPage.const';
import {
    fetchAllPoolSummaries,
    abbreviateAddress,
    PoolSummary,
} from '../utils/contractQueries';
import { factoryAddress } from '../components/universal/IndividualPage.const';
import { sanitizeOnChainString } from '../utils/security';

interface ProfileSearchResult {
    name: string;
    wallet_address: string;
    pool_address: string | null;
}

// Directory + search for creator link pages. Two data sources, both
// optional: the profiles service (creators who named their page) and the
// factory registry (every creator pool, even without a profile yet).
const FindCreatorsPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialQuery = searchParams.get('q') ?? '';
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<ProfileSearchResult[] | null>(null);
    const [pools, setPools] = useState<PoolSummary[]>([]);
    const [loadingPools, setLoadingPools] = useState(true);
    const navigate = useNavigate();

    const runSearch = useCallback(async (q: string) => {
        const trimmed = q.trim();
        if (!trimmed) {
            setResults(null);
            return;
        }
        try {
            const res = await fetch(`${profilesApiUrl}/search?q=${encodeURIComponent(trimmed)}`);
            const body = res.ok ? await res.json() : null;
            setResults(Array.isArray(body?.results) ? body.results : []);
        } catch {
            setResults([]);
        }
    }, []);

    useEffect(() => {
        if (initialQuery) runSearch(initialQuery);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQuery]);

    useEffect(() => {
        let cancelled = false;
        fetchAllPoolSummaries(factoryAddress)
            .then((all) => { if (!cancelled) setPools(all); })
            .catch(() => { if (!cancelled) setPools([]); })
            .finally(() => { if (!cancelled) setLoadingPools(false); });
        return () => { cancelled = true; };
    }, []);

    const handleSubmit = () => {
        setSearchParams(query.trim() ? { q: query.trim() } : {});
        runSearch(query);
    };

    return (
        <PageShell title="Find Creators" showStats={false}>
            <Grid item xs={12} md={8}>
                <Card sx={{ mb: 2 }}>
                    <CardContent>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                label="Search by creator name, wallet, or pool contract"
                                size="small"
                                fullWidth
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                            />
                            <Button variant="contained" onClick={handleSubmit}>Search</Button>
                        </Stack>
                    </CardContent>
                </Card>

                {results !== null && (
                    <Card sx={{ mb: 2 }}>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                {results.length > 0 ? 'Creator pages' : 'No creator pages matched'}
                            </Typography>
                            {results.length === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    No profile matched that search. The creator may not have set up
                                    a links page yet — try their pool below, or search by the pool
                                    contract address.
                                </Typography>
                            )}
                            <List dense>
                                {results.map((r) => (
                                    <ListItemButton
                                        key={r.wallet_address}
                                        onClick={() => navigate(`/creator/${r.name || r.wallet_address}`)}
                                    >
                                        <ListItemIcon><PersonIcon /></ListItemIcon>
                                        <ListItemText
                                            primary={sanitizeOnChainString(r.name, 64) || abbreviateAddress(r.wallet_address)}
                                            secondary={abbreviateAddress(r.wallet_address)}
                                        />
                                        {r.pool_address && <Chip size="small" label="Has pool" />}
                                    </ListItemButton>
                                ))}
                            </List>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="h6">Creators with pools</Typography>
                            <Button component={RouterLink} to="/topcreatorpools" size="small" startIcon={<HotTubIcon />}>
                                Full pool table
                            </Button>
                        </Stack>
                        {loadingPools ? (
                            <Typography variant="body2" color="text.secondary">Loading pools…</Typography>
                        ) : pools.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No creator pools found.</Typography>
                        ) : (
                            <List dense>
                                {pools.map((p) => (
                                    <ListItemButton
                                        key={p.poolAddress}
                                        onClick={() => navigate(`/creator/${p.poolAddress}`)}
                                    >
                                        <ListItemIcon><HotTubIcon /></ListItemIcon>
                                        <ListItemText
                                            primary={`${p.tokenName} (${p.tokenSymbol})`}
                                            secondary={abbreviateAddress(p.poolAddress)}
                                        />
                                        <Chip
                                            size="small"
                                            color={p.thresholdReached ? 'success' : 'warning'}
                                            label={p.thresholdReached ? 'Live' : 'Raising'}
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        )}
                    </CardContent>
                </Card>
            </Grid>
        </PageShell>
    );
};

export default FindCreatorsPage;
