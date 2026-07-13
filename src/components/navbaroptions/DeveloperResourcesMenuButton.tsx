import React from 'react';
import NavMenuButton from './NavMenuButton';

const items = [
    { name: 'Integration Guide', link: '/integration-guide' },
    { name: 'APIs', link: '/comingsoonpage' },
];

const DeveloperResourcesMenuButton: React.FC = () => (
    <NavMenuButton label="Developer Tools" items={items} />
);

export default DeveloperResourcesMenuButton;
