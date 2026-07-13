import React from 'react';
import { Card, CardActionArea, Box, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { sanitizeOnChainString } from '../../utils/security';
import { CreatorLink } from '../../utils/profilesApi';

// SECURITY: only ever render http(s) URLs as anchors — a stored javascript:
// or data: URL must never become a clickable link.
export function isSafeHttpUrl(url: string | undefined): url is string {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export interface LinkCardProps {
    link: CreatorLink;
    /** URL revealed by a successful unlock (gated links only). */
    unlockedUrl?: string;
    /** Invoked when a still-locked gated link is clicked. */
    onLockedClick?: () => void;
}

/**
 * One row of the linktree-style list: a full-width card opening the link in
 * a new tab. Gated links render in a locked style until the viewer's
 * subscription check has revealed the real URL.
 */
const LinkCard: React.FC<LinkCardProps> = ({ link, unlockedUrl, onLockedClick }) => {
    const title = sanitizeOnChainString(link.title, 80);
    const url = link.gated ? unlockedUrl : link.url;
    const locked = link.gated && !isSafeHttpUrl(url);

    if (locked || !isSafeHttpUrl(url)) {
        return (
            <Card variant="outlined" sx={{ opacity: 0.75, borderStyle: 'dashed' }}>
                <CardActionArea onClick={onLockedClick} disabled={!onLockedClick} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <LockIcon fontSize="small" color="disabled" />
                        <Typography variant="subtitle1" fontWeight="bold" color="text.secondary">
                            {title}
                        </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                        Subscribers only
                    </Typography>
                </CardActionArea>
            </Card>
        );
    }

    return (
        <Card variant="outlined">
            <CardActionArea
                component="a"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ p: 2 }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    {link.gated && <LockIcon fontSize="small" color="success" />}
                    <Typography variant="subtitle1" fontWeight="bold">
                        {title}
                    </Typography>
                    <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Box>
            </CardActionArea>
        </Card>
    );
};

export default LinkCard;
