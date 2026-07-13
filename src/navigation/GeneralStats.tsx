import { Button, Paper, Stack, TextField, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { factoryAddress, profilesApiUrl } from '../components/universal/IndividualPage.const';
import { getCosmWasmClient } from '../utils/contractQueries';
import { formatMicroAmount } from '../utils/bigintMath';
import { NATIVE_SYMBOL } from '../defi/types';

// Search + protocol stats strip. Everything here reads from the factory /
// creator-pool contracts (and the optional profiles service) — no chain
// module endpoints. All stats degrade to an em-dash when unreachable.

async function smartQuery<T>(contract: string, msg: Record<string, unknown>): Promise<T> {
    const client = await getCosmWasmClient();
    return client.queryContractSmart(contract, msg) as Promise<T>;
}

interface ProfileSearchResult {
    name: string;
    wallet_address: string;
    pool_address: string | null;
}

async function searchProfiles(q: string): Promise<ProfileSearchResult[]> {
    if (!profilesApiUrl) return [];
    try {
        const res = await fetch(`${profilesApiUrl}/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body?.results) ? body.results : [];
    } catch {
        return [];
    }
}

const GeneralStats: React.FC = () => {
    const [searchValue, setSearchValue] = useState('');
    const [price, setPrice] = useState('');
    const [threshold, setThreshold] = useState('');
    const [poolCount, setPoolCount] = useState('');
    const [error, setError] = useState('');
    const [searching, setSearching] = useState(false);
    const navigateTo = useNavigate();

    useEffect(() => {
        let cancelled = false;

        const fetchStats = async () => {
            // Live OSMO/USD TWAP the contracts use to value commits.
            try {
                const conv = await smartQuery<{ rate_used: string }>(factoryAddress, {
                    pool_factory_query: { convert_native_to_usd: { amount: '1000000' } },
                });
                if (!cancelled && conv?.rate_used) {
                    setPrice(`$${formatMicroAmount(conv.rate_used, 6, 4)}`);
                }
            } catch { /* factory unreachable — leave the dash */ }

            try {
                const cfg = await smartQuery<{ factory: { commit_threshold_limit_usd: string } }>(
                    factoryAddress,
                    { factory: {} },
                );
                if (!cancelled && cfg?.factory?.commit_threshold_limit_usd) {
                    setThreshold(`$${formatMicroAmount(cfg.factory.commit_threshold_limit_usd, 6, 0)}`);
                }
            } catch { /* ignore */ }

            try {
                const res = await smartQuery<{ pools: unknown[] }>(factoryAddress, {
                    pools: { start_after: null, limit: 100 },
                });
                if (!cancelled && Array.isArray(res?.pools)) {
                    setPoolCount(res.pools.length >= 100 ? '100+' : String(res.pools.length));
                }
            } catch { /* ignore */ }
        };

        fetchStats();
        return () => { cancelled = true; };
    }, []);

    // Resolve the search input in priority order:
    //   1. osmo1... contract address registered as a pool  -> pool page
    //   2. osmo1... / name known to the profiles service   -> creator links page
    //   3. bare number                                     -> pool id lookup
    //   4. anything else                                   -> creator directory search
    const handleSearch = async () => {
        const q = searchValue.trim();
        if (!q) return;
        setError('');
        setSearching(true);
        try {
            if (/^osmo1[0-9a-z]{20,}$/.test(q)) {
                try {
                    const registered = await smartQuery<{ pool_id: number } | null>(factoryAddress, {
                        pool_by_address: { pool_addr: q },
                    });
                    if (registered) {
                        navigateTo(`/creatorpool/${q}`);
                        return;
                    }
                } catch { /* not a registered pool — keep resolving */ }

                const profiles = await searchProfiles(q);
                if (profiles.length > 0) {
                    navigateTo(`/creator/${profiles[0].name || profiles[0].wallet_address}`);
                    return;
                }
                if (q.length > 50) {
                    // Contract-length address that isn't a registered pool:
                    // assume it's a creator token CW20.
                    navigateTo(`/creatortoken/${q}`);
                    return;
                }
                setError('No creator pool or links page found for that address.');
                return;
            }

            if (/^\d+$/.test(q)) {
                const id = Number(q);
                const res = await smartQuery<{ pools: Array<{ pool_id: number; pool_addr: string }> }>(
                    factoryAddress,
                    { pools: { start_after: id > 0 ? id - 1 : null, limit: 1 } },
                );
                const hit = res?.pools?.[0];
                if (hit && hit.pool_id === id) {
                    navigateTo(`/creatorpool/${hit.pool_addr}`);
                    return;
                }
                setError(`No creator pool with id ${id}.`);
                return;
            }

            // Creator name search via the profiles service.
            const profiles = await searchProfiles(q);
            if (profiles.length === 1) {
                navigateTo(`/creator/${profiles[0].name}`);
                return;
            }
            navigateTo(`/creators?q=${encodeURIComponent(q)}`);
        } catch {
            setError('Search failed. Please check the input and try again.');
        } finally {
            setSearching(false);
        }
    };

    return (
        <Paper elevation={6} sx={{ marginBottom: '10px', padding: { xs: '8px', md: '12px' } }}>
            <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                        label='Search Creator Name, Pool Contract, Pool ID, or Token'
                        size='small'
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        sx={{ width: { xs: '100%', sm: '50%' } }}
                    />
                    <Button variant='contained' onClick={handleSearch} disabled={searching}>
                        {searching ? 'Searching…' : 'Search'}
                    </Button>
                </Stack>
                {error && <Typography variant="body2" color="error">{error}</Typography>}
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 4 }} flexWrap="wrap">
                    <Typography variant="body2">{NATIVE_SYMBOL} Price (TWAP): {price || '—'}</Typography>
                    <Typography variant="body2">Commit Threshold: {threshold || '—'}</Typography>
                    <Typography variant="body2">Creator Pools: {poolCount || '—'}</Typography>
                </Stack>
            </Stack>
        </Paper>
    );
};

export default GeneralStats;
