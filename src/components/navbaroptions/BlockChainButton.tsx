import React from 'react';
import NavMenuButton from './NavMenuButton';

const items = [
    { name: 'Transactions', link: '/recenttransactions' },
    { name: 'Blocks', link: '/recentblocks' },
    { name: 'Top Accounts', link: '/topwallets' },
    { name: 'IBC Transfers', link: '/ibc' },
];

const BlockChainMenuButton: React.FC = () => (
    <NavMenuButton label="Blockchain" items={items} />
);

export default BlockChainMenuButton;
