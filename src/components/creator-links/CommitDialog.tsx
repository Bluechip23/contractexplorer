import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, IconButton, Box, Chip, Stack, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { CommitPanel } from '../actions/PoolActionModals';
import { sanitizeOnChainString } from '../../utils/security';
import { formatMicroAmount, queryNativeUsdRate, safeBigInt } from '../../utils/contractQueries';
import { Tier } from '../../utils/profilesApi';

export interface CommitDialogProps {
    open: boolean;
    onClose: () => void;
    poolAddress: string;
    tokenSymbol?: string;
    /** Post-threshold commits swap through the AMM (slippage applies). */
    thresholdReached?: boolean;
    /** Optional: the creator's tiers on THIS pool, shown as price references. */
    tiers?: Tier[];
}

// Suggested native (OSMO) amount for a micro-USD tier price, using the
// factory's live TWAP: native = price_usd * 1e6 / rate_used. String/BigInt
// math only — never floats for money. Returns null when the rate is unusable.
function suggestNativeMicro(priceUsdMicro: string, rateUsed: string): string | null {
    const rate = safeBigInt(rateUsed);
    if (rate <= 0n) return null;
    const price = safeBigInt(priceUsdMicro);
    return ((price * 1_000_000n) / rate).toString();
}

/**
 * Commit / Subscribe dialog for the creator links page. Reuses the audited
 * CommitPanel state machine (input → confirm → executing → result) so the
 * links page gets the exact same validation + simulation gates as the pool
 * pages. Committing creates the on-chain subscription record that unlocks
 * a creator's gated links.
 *
 * When `tiers` are supplied, the dialog lists each tier's USD price with a
 * suggested OSMO amount for reference — followers still type the amount they
 * want into the panel below.
 */
const CommitDialog: React.FC<CommitDialogProps> = ({
    open, onClose, poolAddress, tokenSymbol, thresholdReached = false, tiers,
}) => {
    const [rateUsed, setRateUsed] = useState<string | null>(null);

    const hasTiers = !!tiers && tiers.length > 0;

    useEffect(() => {
        if (!open || !hasTiers) return;
        let cancelled = false;
        queryNativeUsdRate()
            .then((r) => { if (!cancelled) setRateUsed(r?.rate_used ?? null); })
            .catch(() => { if (!cancelled) setRateUsed(null); });
        return () => { cancelled = true; };
    }, [open, hasTiers]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* SECURITY: Sanitize on-chain token symbol before rendering */}
                Subscribe to {sanitizeOnChainString(tokenSymbol, 16) || 'Creator'}
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
                {hasTiers && (
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                            Subscription tiers
                        </Typography>
                        <Stack spacing={0.5}>
                            {tiers!.map((t) => {
                                const nativeMicro = rateUsed ? suggestNativeMicro(t.price_usd, rateUsed) : null;
                                return (
                                    <Stack key={t.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Chip size="small" label={sanitizeOnChainString(t.name, 40)} />
                                        <Typography variant="body2" color="text.secondary">
                                            ${formatMicroAmount(t.price_usd, 6, 2)}
                                            {nativeMicro && ` ≈ ${formatMicroAmount(nativeMicro, 6, 2)} OSMO`}
                                        </Typography>
                                    </Stack>
                                );
                            })}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Commit at least a tier's price to unlock the links it gates. Amounts are suggestions —
                            enter what you like below.
                        </Typography>
                    </Box>
                )}
                <CommitPanel
                    poolAddress={poolAddress}
                    tokenSymbol={tokenSymbol}
                    thresholdReached={thresholdReached}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
};

export default CommitDialog;
