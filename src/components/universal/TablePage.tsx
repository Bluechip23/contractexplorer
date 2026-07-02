import React from 'react';
import { Grid } from '@mui/material';
import PageShell from './PageShell';

/** Standard layout for the "top/recent X" listing pages: shell + one table. */
const TablePage: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <PageShell title={title}>
        <Grid item xs={12} md={10}>
            {children}
        </Grid>
    </PageShell>
);

export default TablePage;
