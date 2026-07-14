import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, IconButton, Box, Chip, Stack, Typography, ButtonBase,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { CommitPanel } from '../actions/PoolActionModals';
import { sanitizeOnChainString } from '../../utils/security';
import { formatMicroAmount, queryNativeUsdRate, safeBigInt } from '../../utils/contractQueries';
import { Tier } from '../../utils/profilesApi';

// micro-USD string -> plain decimal string (no thousands separators) suitable
// for the commit panel's numeric USD input.
function microUsdToInput(micro: string): string {
    const m = safeBigInt(micro);
    const s = m.toString().padStart(7, '0');
    const int = s.slice(0, s.length - 6);
    const frac = s.slice(s.length - 6).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
}

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
    // A tier the follower clicked; seeds the commit panel's USD field.
    const [pickedUsd, setPickedUsd] = useState<string | undefined>(undefined);

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
                                const selected = pickedUsd === microUsdToInput(t.price_usd);
                                return (
                                    <ButtonBase
                                        key={t.id}
                                        onClick={() => setPickedUsd(microUsdToInput(t.price_usd))}
                                        sx={{
                                            justifyContent: 'flex-start',
                                            borderRadius: 1,
                                            px: 1,
                                            py: 0.5,
                                            border: 1,
                                            borderColor: selected ? 'primary.main' : 'divider',
                                            bgcolor: selected ? 'action.selected' : 'transparent',
                                        }}
                                    >
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Chip size="small" label={sanitizeOnChainString(t.name, 40)} />
                                            <Typography variant="body2" color="text.secondary">
                                                ${formatMicroAmount(t.price_usd, 6, 2)}
                                                {nativeMicro && ` ≈ ${formatMicroAmount(nativeMicro, 6, 2)} OSMO`}
                                            </Typography>
                                        </Stack>
                                    </ButtonBase>
                                );
                            })}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Tap a tier to fill in that amount, then adjust below if you like. Commit at least a
                            tier's price to unlock the links it gates.
                        </Typography>
                    </Box>
                )}
                <CommitPanel
                    poolAddress={poolAddress}
                    tokenSymbol={tokenSymbol}
                    thresholdReached={thresholdReached}
                    initialUsd={pickedUsd}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
};

export default CommitDialog;
