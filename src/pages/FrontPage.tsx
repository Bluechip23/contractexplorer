import { Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PageShell from '../components/universal/PageShell';
import OpsStatusStrip from '../components/universal/OpsStatusStrip';
import RecentBlocksTable from '../components/table-pages/RecentBlocksTable';
import RecentTransactionsTable from '../components/table-pages/RecentTransactionsTable';
import { rpcEndpoint } from '../components/universal/IndividualPage.const';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import HotTubIcon from '@mui/icons-material/HotTub';

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

const FrontPage: React.FC = () => {
    const [wsConnected, setWsConnected] = useState(false);
    const [latestBlockWs, setLatestBlockWs] = useState<string | null>(null);

    useEffect(() => {
        const wsUrl = rpcEndpoint.replace('https://', 'wss://').replace('http://', 'ws://') + '/websocket';
        let ws: WebSocket | null = null;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                setWsConnected(true);
                ws?.send(JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'subscribe',
                    id: '1',
                    params: { query: "tm.event='NewBlock'" }
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const height = data?.result?.data?.value?.block?.header?.height;
                    if (height) {
                        setLatestBlockWs(height);
                    }
                } catch {
                    // ignore parse errors
                }
            };

            ws.onclose = () => setWsConnected(false);
            ws.onerror = () => setWsConnected(false);
        } catch {}

        return () => {
            ws?.close();
        };
    }, []);

    return (
        <PageShell
            headerExtra={
                <Chip
                    icon={<FiberManualRecordIcon sx={{ fontSize: 12 }} />}
                    label={wsConnected ? `Live${latestBlockWs ? ` #${latestBlockWs}` : ''}` : 'Connecting...'}
                    color={wsConnected ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                />
            }
        >
                <Grid item xs={12} md={10}>
                    <QuickActionsCard />
                </Grid>
                <Grid item xs={12} md={10}>
                    <OpsStatusStrip />
                </Grid>
                <Grid item xs={12} md={6}>
                    <RecentBlocksTable />
                </Grid>
                <Grid item xs={12} md={6}>
                    <RecentTransactionsTable />
                </Grid>
        </PageShell>
    )
}
export default FrontPage;