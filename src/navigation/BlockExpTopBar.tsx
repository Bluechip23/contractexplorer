import React from 'react';
import { Button, CircularProgress, IconButton, Stack, Typography, Link as MuiLink, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ForumIcon from '@mui/icons-material/Forum';
import GitHubIcon from '@mui/icons-material/GitHub';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import { useThemeMode } from '../context/ThemeContext';
import { useWallet } from '../context/WalletContext';
import { formatMicroAmount } from '../utils/bigintMath';

// Community destinations surfaced in the top bar. Overridable at build
// time so the canonical invite/repo can roll without redeploying code.
const DISCORD_URL =
    process.env.REACT_APP_DISCORD_URL || 'https://discord.gg/bluechip';
const GITHUB_URL =
    process.env.REACT_APP_GITHUB_URL || 'https://github.com/bluechip23';

// Shared style so Commit / Discord / GitHub all read as the same kind of
// subtle in-bar link rather than a filled CTA button. Inherits color
// from the AppBar so the contrast comes from the bar's own palette.
const topBarLinkSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    color: 'inherit',
    textDecoration: 'none',
    fontSize: '0.9rem',
    opacity: 0.85,
    cursor: 'pointer',
    '&:hover': { opacity: 1, textDecoration: 'underline' },
};

const BlockExpTopBar: React.FC = () => {
    const { mode, toggleTheme } = useThemeMode();
    const { address, balance, connecting, connect, disconnect } = useWallet();

    return (
        <Stack direction="row" justifyContent="space-evenly" width={'100%'}>
            <Stack
                justifyContent="flex-start"
                width="100%"
                alignItems="center"
                direction='row'
                spacing={4}
            >
                <RouterLink
                    to="/frontpage"
                    style={{
                        color: 'inherit',
                        textDecoration: 'none',
                        fontSize: 'x-large',
                    }}
                >
                    Bluechip Explorer
                </RouterLink>
                {address ? (
                    <MuiLink component={RouterLink} to="/defi?tab=commit" sx={topBarLinkSx}>
                        <VolunteerActivismIcon fontSize="small" />
                        Commit
                    </MuiLink>
                ) : (
                    <Box
                        sx={{
                            ...topBarLinkSx,
                            opacity: 0.4,
                            cursor: 'default',
                            '&:hover': { opacity: 0.4, textDecoration: 'none' },
                        }}
                        title="Connect a wallet to commit"
                    >
                        <VolunteerActivismIcon fontSize="small" />
                        Commit
                    </Box>
                )}
                <MuiLink
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={topBarLinkSx}
                >
                    <ForumIcon fontSize="small" />
                    Discord
                </MuiLink>
                <MuiLink
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={topBarLinkSx}
                >
                    <GitHubIcon fontSize="small" />
                    GitHub
                </MuiLink>
            </Stack>
            <Stack
                width="100%"
                justifyContent="flex-end"
                direction="row"
                alignItems="center"
                spacing={1}
            >
                {address ? (
                    <>
                        {balance && (
                            <Typography variant="body2" sx={{ mr: 1 }}>
                                {formatMicroAmount(balance.amount)} bluechip
                            </Typography>
                        )}
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {address.slice(0, 12)}...{address.slice(-6)}
                        </Typography>
                        <Button size="small" variant="outlined" onClick={disconnect} sx={{ ml: 1, textTransform: 'none' }}>
                            Disconnect
                        </Button>
                    </>
                ) : (
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={connecting ? <CircularProgress size={16} color="inherit" /> : <AccountBalanceWalletIcon />}
                        onClick={connect}
                        disabled={connecting}
                        sx={{ textTransform: 'none' }}
                    >
                        {connecting ? 'Connecting...' : 'Connect Wallet'}
                    </Button>
                )}
                <IconButton color="inherit" onClick={toggleTheme} title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
                    {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
                </IconButton>
            </Stack>
        </Stack>
    );
};

export default BlockExpTopBar;
