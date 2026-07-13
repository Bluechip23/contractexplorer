import React, { useEffect, useState } from 'react';
import { Alert } from '@mui/material';
import { formatMicroAmount, queryNativeUsdRate } from '../../utils/contractQueries';
import { NATIVE_SYMBOL } from '../../defi/types';

// Live OSMO/USD price banner for commit surfaces. The factory values
// every commit through Osmosis's x/twap module over its configured
// native/USD-stable pricing pool — the TWAP is computed on-chain at
// query time, so there is no keeper, cache, or staleness window. The
// only failure mode is the query itself failing, in which case commits
// fail closed on-chain too; that is the one state that warrants a
// warning here.
const OracleStatusBanner: React.FC = () => {
    // undefined = still loading, null = query failed, string = micro-USD
    // per native token (1_000_000 = $1.00/OSMO).
    const [rate, setRate] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        async function probe() {
            const info = await queryNativeUsdRate();
            if (cancelled) return;
            setRate(info ? info.rate_used : null);
        }
        probe();
        const interval = setInterval(probe, 30_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    if (rate === undefined) return null;

    if (rate === null) {
        return (
            <Alert severity="error" sx={{ mb: 1 }}>
                The {NATIVE_SYMBOL}/USD price lookup is failing — the factory could not compute
                its on-chain TWAP. Commits are valued through this price and will be rejected
                until it recovers.
            </Alert>
        );
    }
    return (
        <Alert severity="info" sx={{ mb: 1 }}>
            Live price: 1 {NATIVE_SYMBOL} ≈ ${formatMicroAmount(rate, 6, 4)} (on-chain TWAP —
            commits are valued in USD at this rate).
        </Alert>
    );
};

export default OracleStatusBanner;
