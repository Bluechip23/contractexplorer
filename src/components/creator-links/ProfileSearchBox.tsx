import React, { useState } from 'react';
import {
    Box, Card, CardContent, CircularProgress, List, ListItemButton,
    ListItemText, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { sanitizeOnChainString } from '../../utils/security';
import { abbreviateAddress } from '../../utils/contractQueries';
import { ProfileSearchResult, searchProfiles } from '../../utils/profilesApi';

/**
 * Creator search used on the links page's not-found state. Matches display
 * name substrings or exact wallet/pool addresses and navigates to the
 * selected creator's public page.
 */
const ProfileSearchBox: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProfileSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);

    const runSearch = async () => {
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        try {
            setResults(await searchProfiles(q));
            setSearched(true);
        } finally {
            setSearching(false);
        }
    };

    return (
        <Card>
            <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                    Find a creator
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Creator name, wallet, or pool address"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    />
                    <Box
                        component="button"
                        onClick={runSearch}
                        disabled={searching || !query.trim()}
                        sx={{
                            px: 2, border: 'none', borderRadius: 1, cursor: 'pointer',
                            bgcolor: 'primary.main', color: 'primary.contrastText',
                            display: 'flex', alignItems: 'center',
                            '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
                        }}
                    >
                        {searching ? <CircularProgress size={18} color="inherit" /> : <SearchIcon fontSize="small" />}
                    </Box>
                </Box>
                {searched && results.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                        No creators matched that search.
                    </Typography>
                )}
                {results.length > 0 && (
                    <List dense sx={{ mt: 1 }}>
                        {results.map((r) => (
                            <ListItemButton
                                key={r.wallet_address}
                                onClick={() => navigate(`/creator/${encodeURIComponent(r.name)}`)}
                            >
                                <ListItemText
                                    primary={sanitizeOnChainString(r.name, 32)}
                                    secondary={abbreviateAddress(r.wallet_address)}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </CardContent>
        </Card>
    );
};

export default ProfileSearchBox;
