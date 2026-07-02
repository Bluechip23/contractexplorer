import React from 'react';
import {
    Divider,
    ListItemIcon,
    ListItemText,
    List,
    ListItem,
    Tooltip,
    ListSubheader,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import GavelIcon from '@mui/icons-material/Gavel';
import HotTubIcon from '@mui/icons-material/HotTub';
import TokenIcon from '@mui/icons-material/Token';
import ReceiptIcon from '@mui/icons-material/Receipt';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CodeIcon from '@mui/icons-material/Code';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import LinkIcon from '@mui/icons-material/Link';
import BrushIcon from '@mui/icons-material/Brush';
import { Link, useLocation } from 'react-router-dom';

type Item = {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    link: string;
};

const explorerItems: Item[] = [
    { title: 'Home', icon: <HomeIcon />, link: '/frontpage' },
    { title: 'Transactions', icon: <ReceiptIcon />, link: '/recenttransactions' },
    { title: 'Blocks', icon: <TokenIcon />, link: '/recentblocks' },
    { title: 'Creator Pools', icon: <HotTubIcon />, link: '/topcreatorpools' },
    { title: 'Validators', icon: <GavelIcon />, link: '/topvalidators' },
    { title: 'Creator Tokens', icon: <MonetizationOnIcon />, link: '/toptokens' },
];

// "My Portfolio" views are always visible so holdings / subscriptions /
// performance are one click away; the pages themselves show a connect
// prompt when no wallet is linked yet.
const portfolioItems: Item[] = [
    {
        title: 'My Holdings',
        subtitle: 'Tokens, commits & positions',
        icon: <LinkIcon />,
        link: '/portfolio/chain',
    },
    {
        title: 'Creator Portfolio',
        subtitle: 'Your pools, tokens & revenue',
        icon: <BrushIcon />,
        link: '/portfolio/creator',
    },
];

const chainItems: Item[] = [
    { title: 'Creator Economy', icon: <RocketLaunchIcon />, link: '/defi' },
    { title: 'Governance', icon: <HowToVoteIcon />, link: '/governance' },
    { title: 'Staking', icon: <AccountBalanceIcon />, link: '/staking' },
    { title: 'IBC Transfers', icon: <SwapHorizIcon />, link: '/ibc' },
    { title: 'Contract Explorer', icon: <CodeIcon />, link: '/contract-explorer' },
    { title: 'Integration Guide', icon: <TipsAndUpdatesIcon />, link: '/integration-guide' },
];

const SidebarLink: React.FC<{ item: Item; selected?: boolean }> = ({ item, selected = false }) => (
    <Link to={item.link} style={{ color: 'inherit', textDecoration: 'none' }}>
        <ListItem
            sx={{
                bgcolor: selected ? 'action.selected' : 'transparent',
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
            }}
        >
            <Tooltip title={item.title}>
                <ListItemIcon>{item.icon}</ListItemIcon>
            </Tooltip>
            <ListItemText primary={item.title} secondary={item.subtitle} />
        </ListItem>
    </Link>
);

const BlockExpSideBar: React.FC = () => {
    const location = useLocation();

    return (
        <List component="nav">
            {explorerItems.map((item) => (
                <SidebarLink key={item.link} item={item} selected={location.pathname === item.link} />
            ))}

            <Divider sx={{ my: 1 }} />
            <ListSubheader component="div" disableSticky sx={{ lineHeight: '32px' }}>
                My Portfolio
            </ListSubheader>
            {portfolioItems.map((item) => (
                <SidebarLink key={item.link} item={item} selected={location.pathname === item.link} />
            ))}

            <Divider sx={{ my: 1 }} />
            {chainItems.map((item) => (
                <SidebarLink key={item.link} item={item} selected={location.pathname === item.link} />
            ))}
        </List>
    );
};

export default BlockExpSideBar;
