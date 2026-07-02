import React from 'react'
import { Grid, Typography } from '@mui/material';
import PageShell from './PageShell';

const ComingSoonPage: React.FC = () => (
    <PageShell showStats={false}>
        <Grid item xs={12} md={10} sx={{ mt: '20px', textAlign: 'center' }}>
            <Typography variant='h4'>
                This data is not available yet. It will be coming soon!
            </Typography>
        </Grid>
    </PageShell>
);

export default ComingSoonPage;
