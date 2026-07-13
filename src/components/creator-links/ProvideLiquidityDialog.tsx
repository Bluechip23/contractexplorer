import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DepositLiquidityPanel } from '../actions/PoolActionModals';
import { sanitizeOnChainString } from '../../utils/security';

export interface ProvideLiquidityDialogProps {
    open: boolean;
    onClose: () => void;
    poolAddress: string;
    tokenSymbol?: string;
    /** CW20 creator-token contract; the panel handles the allowance step. */
    creatorTokenAddress?: string;
}

/**
 * Provide-liquidity dialog for the creator links page. Reuses the audited
 * DepositLiquidityPanel, which handles the CW20 increase_allowance step,
 * BigInt slippage math, and pre-signing simulation.
 */
const ProvideLiquidityDialog: React.FC<ProvideLiquidityDialogProps> = ({
    open, onClose, poolAddress, tokenSymbol, creatorTokenAddress,
}) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* SECURITY: Sanitize on-chain token symbol before rendering */}
            Provide Liquidity{tokenSymbol ? ` — ${sanitizeOnChainString(tokenSymbol, 16)}` : ''}
            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
            <DepositLiquidityPanel
                poolAddress={poolAddress}
                tokenSymbol={tokenSymbol}
                creatorTokenAddress={creatorTokenAddress}
                onClose={onClose}
            />
        </DialogContent>
    </Dialog>
);

export default ProvideLiquidityDialog;
