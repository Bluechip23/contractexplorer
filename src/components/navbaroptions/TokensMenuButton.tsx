import React from 'react';
import NavMenuButton from './NavMenuButton';

const items = [
    { name: 'Top Tokens', link: '/toptokens' },
];

const TokensMenuButton: React.FC = () => (
    <NavMenuButton label="Tokens" items={items} />
);

export default TokensMenuButton;
