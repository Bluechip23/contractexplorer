import React from 'react';
import { Grid, Stack, Typography } from '@mui/material';
import { Layout } from '../../ui';
import BlockExpTopBar from '../../navigation/BlockExpTopBar';
import BlockExpSideBar from '../../navigation/BlockExpSideBar';
import BlockExplorerNavBar from '../../navigation/BlockExplorerNavBar';
import GeneralStats from '../../navigation/GeneralStats';

export interface PageShellProps {
    /** Optional page heading shown left of the explorer nav menus. */
    title?: string;
    /** Extra content rendered on the right side of the header row. */
    headerExtra?: React.ReactNode;
    /** md-breakpoint grid width of the header section (matches page content). */
    width?: number;
    /** Render the search + chain stats panel under the header (default on). */
    showStats?: boolean;
    /** Page content, provided as `<Grid item>` children of the shell's container. */
    children?: React.ReactNode;
}

/**
 * Common chrome shared by every explorer page: the app Layout (top bar +
 * sidebar), the explorer dropdown nav, and the search/stats panel. Children
 * are Grid items placed in the same centered container so pages keep full
 * control of their own column layout.
 */
const PageShell: React.FC<PageShellProps> = ({
    title,
    headerExtra,
    width = 10,
    showStats = true,
    children,
}) => (
    <Layout NavBar={<BlockExpTopBar />} SideBar={<BlockExpSideBar />}>
        <Grid container justifyContent="center" spacing={2}>
            <Grid item xs={12} md={width} sx={{ mt: '10px' }}>
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ gap: 1, mb: 1 }}
                >
                    <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 2 }}>
                        {title ? (
                            <Typography variant="h4" fontWeight="bold">{title}</Typography>
                        ) : null}
                        <BlockExplorerNavBar />
                    </Stack>
                    {headerExtra}
                </Stack>
                {showStats && <GeneralStats />}
            </Grid>
            {children}
        </Grid>
    </Layout>
);

export default PageShell;
