import React from 'react';
import { Button, Grid, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PageShell from '../components/universal/PageShell';

const NotFoundPage: React.FC = () => (
    <PageShell showStats={false}>
        <Grid item xs={12} sx={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stack spacing={2} alignItems="center">
                <ErrorOutlineIcon sx={{ fontSize: 80, color: 'grey.500', mt: 4 }} />
                <Typography variant="h3" color="text.secondary">
                    404
                </Typography>
                <Typography variant="h5" color="text.secondary">
                    Page Not Found
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, textAlign: 'center' }}>
                    The page you are looking for does not exist. It may have been moved, or the URL may be incorrect.
                </Typography>
                <Button
                    component={Link}
                    to="/frontpage"
                    variant="contained"
                    sx={{ mt: 2 }}
                >
                    Back to Home
                </Button>
            </Stack>
        </Grid>
    </PageShell>
);

export default NotFoundPage;
