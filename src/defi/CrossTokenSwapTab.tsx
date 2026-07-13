import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    MenuItem,
    TextField,
    Typography,
} from '@mui/material';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { NATIVE_DENOM, NATIVE_SYMBOL, COIN_DECIMALS } from './types';
import { factoryAddress, routerAddress } from '../components/universal/IndividualPage.const';
import {
    fetchAllPoolSummaries,
    formatMicroAmount,
    PoolSummary,
    simulateMultiHop,
    SimulateMultiHopResponse,
    SwapOperationWire,
} from '../utils/contractQueries';
import {
    assertWalletOnExpectedChain,
    humanizeContractError,
    validateSlippage,
    validateTokenAmount,
} from '../utils/security';
import { deadlineNs } from '../utils/datetime';
import { minAmountAfterSlippage } from '../utils/poolActions';

// Cross-token swaps through the router contract. Creator tokens never
// share a pool with each other — every pair routes through OSMO —
// so TOKEN_A -> TOKEN_B is a two-hop route (A-pool then B-pool) the
// router executes atomically. End-to-end slippage is enforced by
// `minimum_receive` on the FINAL ask token (the router takes no per-hop
// spread parameters), sized here from the simulation result.

interface TokenOption {
    key: string;               // 'native' or the cw20 address
    label: string;
    tokenAddress: string | null;   // null = native OSMO
    poolAddress: string | null;    // pool that pairs this token with OSMO
}

function buildRoute(from: TokenOption, to: TokenOption): SwapOperationWire[] {
    const native = { bluechip: { denom: NATIVE_DENOM } };
    const ops: SwapOperationWire[] = [];
    if (from.tokenAddress && from.poolAddress) {
        ops.push({
            pool_addr: from.poolAddress,
            offer_asset_info: { creator_token: { contract_addr: from.tokenAddress } },
            ask_asset_info: native,
        });
    }
    if (to.tokenAddress && to.poolAddress) {
        ops.push({
            pool_addr: to.poolAddress,
            offer_asset_info: native,
            ask_asset_info: { creator_token: { contract_addr: to.tokenAddress } },
        });
    }
    return ops;
}

const CrossTokenSwapTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [pools, setPools] = useState<PoolSummary[]>([]);
    const [loadingPools, setLoadingPools] = useState(true);
    const [fromKey, setFromKey] = useState('native');
    const [toKey, setToKey] = useState('');
    const [amount, setAmount] = useState('');
    const [slippage, setSlippage] = useState('1');
    const [quote, setQuote] = useState<SimulateMultiHopResponse | null>(null);
    const [quoting, setQuoting] = useState(false);
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchAllPoolSummaries(factoryAddress).then((rows) => {
            if (cancelled) return;
            // Only active pools can route — pre-threshold pools have no AMM.
            setPools(rows.filter((p) => p.thresholdReached && p.creatorTokenAddress));
            setLoadingPools(false);
        });
        return () => { cancelled = true; };
    }, []);

    const options: TokenOption[] = useMemo(() => [
        { key: 'native', label: NATIVE_SYMBOL, tokenAddress: null, poolAddress: null },
        ...pools.map((p) => ({
            key: p.creatorTokenAddress as string,
            label: `${p.tokenSymbol} — ${p.tokenName}`,
            tokenAddress: p.creatorTokenAddress,
            poolAddress: p.poolAddress,
        })),
    ], [pools]);

    const from = options.find((o) => o.key === fromKey) ?? options[0];
    const to = options.find((o) => o.key === toKey) ?? null;
    const route = to && from.key !== to.key ? buildRoute(from, to) : [];

    const getQuote = async () => {
        setStatus('');
        setTxHash('');
        setQuote(null);
        if (!to || route.length === 0) { setStatus('Error: Pick two different tokens'); return; }
        const amtCheck = validateTokenAmount(amount, COIN_DECIMALS);
        if (!amtCheck.ok || !amtCheck.micro) { setStatus(`Error: ${amtCheck.error}`); return; }

        setQuoting(true);
        try {
            const sim = await simulateMultiHop(routerAddress, route, amtCheck.micro);
            if (!sim) {
                setStatus('Error: Simulation failed — check that the router address is configured and the route pools have liquidity.');
                return;
            }
            setQuote(sim);
        } finally {
            setQuoting(false);
        }
    };

    const executeSwap = async () => {
        if (!client || !address) { setStatus('Error: Connect your wallet first'); return; }
        if (!to || route.length === 0 || !quote) { setStatus('Error: Get a quote first'); return; }

        const amtCheck = validateTokenAmount(amount, COIN_DECIMALS);
        if (!amtCheck.ok || !amtCheck.micro) { setStatus(`Error: ${amtCheck.error}`); return; }
        const slipCheck = validateSlippage(slippage);
        if (!slipCheck.ok) { setStatus(`Error: ${slipCheck.error}`); return; }

        // SECURITY: chain-ID assertion before signing.
        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        setStatus('Swapping...');
        setTxHash('');
        try {
            const micro = amtCheck.micro;
            // minimum_receive from the quote: final_amount minus tolerance,
            // BigInt math on micro-units.
            const hopArgs = {
                operations: route,
                minimum_receive: minAmountAfterSlippage(quote.final_amount, slipCheck.pct ?? 1),
                deadline: deadlineNs(20),
                recipient: null as string | null,
            };

            let result;
            if (!from.tokenAddress) {
                // Native-offered route: attach the OSMO funds.
                result = await client.execute(
                    address,
                    routerAddress,
                    { execute_multi_hop: hopArgs },
                    { amount: [], gas: '900000' },
                    'Cross-Token Swap',
                    [{ denom: NATIVE_DENOM, amount: micro }],
                );
            } else {
                // CW20-offered route: cw20 send to the router with the hook.
                result = await client.execute(
                    address,
                    from.tokenAddress,
                    {
                        send: {
                            contract: routerAddress,
                            amount: micro,
                            msg: btoa(JSON.stringify({ execute_multi_hop: hopArgs })),
                        },
                    },
                    { amount: [], gas: '900000' },
                    'Cross-Token Swap',
                    [],
                );
            }
            setTxHash(result.transactionHash);
            setStatus('Success!');
            setQuote(null);
        } catch (err) {
            setStatus('Error: ' + humanizeContractError(err));
        }
    };

    if (loadingPools) {
        return <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={22} /></Box>;
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
                Swap any two listed tokens in one transaction. Creator-token pairs route through
                {' '}{NATIVE_SYMBOL} (max 3 hops); slippage protection applies to the final amount received.
            </Alert>

            <TextField select label="From" value={fromKey} onChange={(e) => { setFromKey(e.target.value); setQuote(null); }}>
                {options.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
            </TextField>
            <Box sx={{ textAlign: 'center', my: -1 }}>
                <Button
                    size="small"
                    startIcon={<SwapVertIcon />}
                    onClick={() => { if (to) { setFromKey(to.key); setToKey(from.key); setQuote(null); } }}
                >
                    Flip
                </Button>
            </Box>
            <TextField select label="To" value={toKey} onChange={(e) => { setToKey(e.target.value); setQuote(null); }}>
                {options.filter((o) => o.key !== fromKey).map((o) => (
                    <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>
                ))}
            </TextField>
            <TextField
                label={`Amount (${from.label.split(' — ')[0]})`}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                type="number"
            />
            <TextField
                label="Max Slippage (%)"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                type="number"
                helperText="Applied to the final received amount via the router's minimum_receive"
            />

            {route.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">Route:</Typography>
                    <Chip size="small" variant="outlined" label={from.label.split(' — ')[0]} />
                    {route.map((_, i) => (
                        <React.Fragment key={i}>
                            <Typography variant="caption">→</Typography>
                            {i < route.length - 1 && <Chip size="small" variant="outlined" label={NATIVE_SYMBOL} />}
                        </React.Fragment>
                    ))}
                    <Chip size="small" variant="outlined" label={to?.label.split(' — ')[0] ?? ''} />
                    <Chip size="small" label={`${route.length} hop${route.length > 1 ? 's' : ''}`} />
                </Box>
            )}

            <Button variant="outlined" onClick={getQuote} disabled={quoting || !to || !amount}>
                {quoting ? 'Simulating...' : 'Get Quote'}
            </Button>

            {quote && (
                <Alert severity="success" icon={false}>
                    <Typography variant="body2">
                        Expected output: <strong>{formatMicroAmount(quote.final_amount)} {to?.label.split(' — ')[0]}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Price impact ~{(parseFloat(quote.price_impact) * 100).toFixed(2)}% ·
                        guaranteed minimum after {slippage}% slippage:{' '}
                        {formatMicroAmount(minAmountAfterSlippage(quote.final_amount, parseFloat(slippage) || 1))}
                    </Typography>
                </Alert>
            )}

            <Button variant="contained" color="secondary" onClick={executeSwap} disabled={!client || !quote}>
                Swap
            </Button>

            {status && (
                <Alert severity={status.startsWith('Success') ? 'success' : status.startsWith('Error') ? 'error' : 'info'}>
                    {status}
                </Alert>
            )}
            {txHash && (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Tx: {txHash}
                </Typography>
            )}
        </Box>
    );
};

export default CrossTokenSwapTab;
