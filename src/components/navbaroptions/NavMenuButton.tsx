import React from 'react';
import { Button, MenuItem, Menu } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Link as RouterLink } from 'react-router-dom';

interface DropdownItem {
    name: string;
    link: string;
}

interface NavMenuButtonProps {
    label: string;
    items: DropdownItem[];
}

const NavMenuButton: React.FC<NavMenuButtonProps> = ({ label, items }) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <>
            <Button onClick={handleClick} endIcon={<KeyboardArrowDownIcon />}>
                {label}
            </Button>
            <Menu open={open} onClose={handleClose} anchorEl={anchorEl}>
                {items.map((item) => (
                    <MenuItem
                        key={item.link}
                        component={RouterLink}
                        to={item.link}
                        onClick={handleClose}
                        disableRipple
                    >
                        {item.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default NavMenuButton;
