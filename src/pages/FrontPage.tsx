import { Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PageShell from '../components/universal/PageShell';
import OpsStatusStrip from '../components/universal/OpsStatusStrip';
import CreatorPoolTable from '../components/table-pages/CreatorPoolTable';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import HotTubIcon from '@mui/icons-material/HotTub';
import PaletteIcon from '@mui/icons-material/Palette';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';

// One-click entry points to the actions users come here for most:
// committing to creators, trading their tokens, and providing liquidity.
const QuickActionsCard: React.FC = () => (
    <Card>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                flexWrap="wrap"
                useFlexGap
            >
                <Typography variant="subtitle1" fontWeight="bold">
                    Creator Economy
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                        component={RouterLink}
                        to="/defi?tab=commit"
                        variant="contained"
                        color="warning"
                        size="small"
                        startIcon={<VolunteerActivismIcon />}
                    >
                        Commit to a Creator
                    </Button>
                    <Button
                        component={RouterLink}
                        to="/defi?tab=swap"
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<ShoppingCartIcon />}
                    >
                        Trade Tokens
                    </Button>
                    <Button
                        component={RouterLink}
                        to="/defi?tab=liquidity"
                        variant="contained"
                        size="small"
                        startIcon={<WaterDropIcon />}
                    >
                        Provide Liquidity
                    </Button>
                    <Button
                        component={RouterLink}
                        to="/topcreatorpools"
                        variant="outlined"
                        size="small"
                        startIcon={<HotTubIcon />}
                    >
                        Browse Pools
                    </Button>
                </Stack>
            </Stack>
        </CardContent>
    </Card>
);

// Entry points to the creator link-in-bio pages: find a creator's page,
// or set up (and share) your own.
const CreatorLinksCard: React.FC = () => (
    <Card>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                flexWrap="wrap"
                useFlexGap
            >
                <Stack spacing={0.25}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        Creator Links
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Every creator gets a link-in-bio page — some links unlock by subscribing.
                    </Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                        component={RouterLink}
                        to="/creators"
                        variant="contained"
                        size="small"
                        startIcon={<PersonSearchIcon />}
                    >
                        Find Creators
                    </Button>
                    <Button
                        component={RouterLink}
                        to="/mylinks"
                        variant="outlined"
                        size="small"
                        startIcon={<PaletteIcon />}
                    >
                        Set Up My Links Page
                    </Button>
                </Stack>
            </Stack>
        </CardContent>
    </Card>
);

const FrontPage: React.FC = () => (
    <PageShell>
        <Grid item xs={12} md={10}>
            <QuickActionsCard />
        </Grid>
        <Grid item xs={12} md={10}>
            <CreatorLinksCard />
        </Grid>
        <Grid item xs={12} md={10}>
            <OpsStatusStrip />
        </Grid>
        <Grid item xs={12} md={10}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                Top Creator Pools
            </Typography>
            <CreatorPoolTable />
        </Grid>
    </PageShell>
);

export default FrontPage;
