import React from 'react';
import { Button, Card, CardContent, Typography } from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

interface NoPoolsViewProps {
    onCreatePool: () => void;
}

const NoPoolsView: React.FC<NoPoolsViewProps> = ({ onCreatePool }) => (
    <Card>
        <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <RocketLaunchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
                You have not created a pool yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
                Launch your own creator token and liquidity pool. Subscribers will commit OSMO
                to fund your pool, and you'll earn fees on every transaction.
            </Typography>
            <Button variant="contained" size="large" onClick={onCreatePool} startIcon={<RocketLaunchIcon />}>
                Create Pool
            </Button>
        </CardContent>
    </Card>
);

export default NoPoolsView;
