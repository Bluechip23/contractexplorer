import React from 'react';
import { Stack, } from '@mui/material';
import TokensMenuButton from '../components/navbaroptions/TokensMenuButton';
import PoolsMenuButton from '../components/navbaroptions/PoolsMenuButton';
import DeveloperResourcesMenuButton from '../components/navbaroptions/DeveloperResourcesMenuButton';

const BlockExplorerNavBar: React.FC = () => {
    return (
            <Stack direction="row" spacing={1}>
                <PoolsMenuButton/>
                <TokensMenuButton/>
                <DeveloperResourcesMenuButton/>
            </Stack>
    );
};

export default BlockExplorerNavBar;
