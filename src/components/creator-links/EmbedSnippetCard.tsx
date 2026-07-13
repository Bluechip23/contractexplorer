import React, { useState } from 'react';
import { Box, Card, CardContent, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

// Published widget bundle (see widget/README.md). Creators paste this one
// line into any site to get a subscribe button for their pool.
const WIDGET_SRC = 'https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js';

export interface EmbedSnippetCardProps {
    poolAddress: string;
}

/**
 * Copyable one-liner that embeds the BlueChip subscribe widget for the
 * creator's pool on any external website.
 */
const EmbedSnippetCard: React.FC<EmbedSnippetCardProps> = ({ poolAddress }) => {
    const [copied, setCopied] = useState(false);
    const snippet = `<script src="${WIDGET_SRC}" data-bluechip-subscribe data-pool="${poolAddress}" data-amount="5"></script>`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard can be unavailable (permissions / insecure context).
        }
    };

    return (
        <Card>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        Embed a subscribe button on your site
                    </Typography>
                    <Tooltip title={copied ? 'Copied!' : 'Copy snippet'}>
                        <IconButton onClick={copy} size="small">
                            {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Paste this anywhere in your page's HTML — it renders a subscribe
                    button wired to your pool.
                </Typography>
                <Box
                    component="pre"
                    sx={{
                        m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover',
                        fontFamily: 'monospace', fontSize: '0.75rem',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}
                >
                    {snippet}
                </Box>
            </CardContent>
        </Card>
    );
};

export default EmbedSnippetCard;
