import React, { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { factoryAddress } from './IndividualPage.const';
import { fetchAllPoolSummaries, PoolSummary } from '../../utils/contractQueries';
import { PoolStatusChip } from './tablePrimitives';

interface PoolPickerFieldProps {
    /** The pool contract address (also accepts a hand-pasted address). */
    value: string;
    onChange: (address: string) => void;
    label?: string;
    helperText?: string;
    /** Optionally narrow the suggestion list (e.g. only active pools). */
    filterPools?: (pool: PoolSummary) => boolean;
}

// Module-level cache: every picker on the page shares one pool fetch.
let poolListPromise: Promise<PoolSummary[]> | null = null;
function loadPools(): Promise<PoolSummary[]> {
    if (!poolListPromise) {
        poolListPromise = factoryAddress
            ? fetchAllPoolSummaries(factoryAddress).catch(() => [])
            : Promise.resolve([]);
    }
    return poolListPromise;
}

/**
 * Pool selector for the action forms: search pools by token symbol/name
 * and fill in the contract address, or paste a raw address directly
 * (free-solo input keeps the old manual entry working).
 */
const PoolPickerField: React.FC<PoolPickerFieldProps> = ({
    value,
    onChange,
    label = 'Pool',
    helperText = 'Search by token name/symbol, or paste a pool address',
    filterPools,
}) => {
    const [pools, setPools] = useState<PoolSummary[]>([]);

    useEffect(() => {
        let cancelled = false;
        loadPools().then((rows) => {
            if (!cancelled) setPools(filterPools ? rows.filter(filterPools) : rows);
        });
        return () => { cancelled = true; };
        // Load once; `filterPools` callers pass stable filters.
    }, []); // eslint-disable-line

    return (
        <Autocomplete
            freeSolo
            options={pools}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.poolAddress)}
            filterOptions={(options, state) => {
                const q = state.inputValue.trim().toLowerCase();
                if (!q) return options;
                return options.filter((p) =>
                    `${p.tokenSymbol} ${p.tokenName} ${p.poolAddress}`.toLowerCase().includes(q),
                );
            }}
            inputValue={value}
            onInputChange={(_, newValue) => onChange(newValue)}
            renderOption={(props, pool) => (
                <Box component="li" {...props} key={pool.poolAddress} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="body2" fontWeight="bold">{pool.tokenSymbol}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }} noWrap>
                        {pool.tokenName}
                    </Typography>
                    <PoolStatusChip thresholdReached={pool.thresholdReached} />
                </Box>
            )}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    placeholder="osmo1..."
                    helperText={helperText}
                />
            )}
        />
    );
};

export default PoolPickerField;
