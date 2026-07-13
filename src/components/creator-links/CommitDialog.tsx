import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { CommitPanel } from '../actions/PoolActionModals';
import { sanitizeOnChainString } from '../../utils/security';

export interface CommitDialogProps {
    open: boolean;
    onClose: () => void;
    poolAddress: string;
    tokenSymbol?: string;
    /** Post-threshold commits swap through the AMM (slippage applies). */
    thresholdReached?: boolean;
}

/**
 * Commit / Subscribe dialog for the creator links page. Reuses the audited
 * CommitPanel state machine (input → confirm → executing → result) so the
 * links page gets the exact same validation + simulation gates as the pool
 * pages. Committing creates the on-chain subscription record that unlocks
 * a creator's gated links.
 */
const CommitDialog: React.FC<CommitDialogProps> = ({
    open, onClose, poolAddress, tokenSymbol, thresholdReached = false,
}) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* SECURITY: Sanitize on-chain token symbol before rendering */}
            Subscribe to {sanitizeOnChainString(tokenSymbol, 16) || 'Creator'}
            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
            <CommitPanel
                poolAddress={poolAddress}
                tokenSymbol={tokenSymbol}
                thresholdReached={thresholdReached}
                onClose={onClose}
            />
        </DialogContent>
    </Dialog>
);

export default CommitDialog;
