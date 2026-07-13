import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Grid, Stack, Typography, Tabs, Tab, Box, Card, CardContent, TextField, Button, Alert, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import PageShell from '../components/universal/PageShell';
import PoolPickerField from '../components/universal/PoolPickerField';
import CommitTracker from './CommitTracker';
import OracleStatusBanner from '../components/universal/OracleStatusBanner';
import CrossTokenSwapTab from './CrossTokenSwapTab';
import { NATIVE_DENOM, NATIVE_SYMBOL, COIN_DECIMALS } from './types';
import { factoryAddress } from '../components/universal/IndividualPage.const';
import { useWallet } from '../context/WalletContext';
import {
    validateTokenAmount,
    validateBech32Address,
    validateSlippage,
    assertWalletOnExpectedChain,
    humanizeContractError,
} from '../utils/security';
import { formatMicroAmount } from '../utils/bigintMath';
import { isFullyCommitted, queryFactoryConfig } from '../utils/contractQueries';
import { deadlineNs, timeAgo } from '../utils/datetime';
import { ensureCw20Allowance, minAmountAfterSlippage, resolvePoolAssets } from '../utils/poolActions';

// Sentinel the factory's commit-pool create handler requires in the
// CreatorToken slot of pool_token_info. The factory mints the real CW20
// during creation and rewrites this slot to the freshly minted address.
const CREATOR_TOKEN_SENTINEL = 'WILL_BE_CREATED_BY_FACTORY';

const TabPanel: React.FC<{ children?: React.ReactNode; value: number; index: number }> = ({ children, value, index }) => (
    <div role="tabpanel" hidden={value !== index}>
        {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
);

const TxHashDisplay: React.FC<{ txHash: string }> = ({ txHash }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(txHash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    if (!txHash) return null;
    return (
        <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1, border: '1px solid', borderColor: 'success.main', mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>Transaction Hash:</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, fontSize: '0.85rem' }}>
                    {txHash}
                </Typography>
                <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                    <IconButton size="small" onClick={handleCopy} color={copied ? 'success' : 'primary'}>
                        <ContentCopyIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

// =========================================================================
// CREATE POOL TAB
// =========================================================================
const CreatePoolTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [tokenName, setTokenName] = useState('');
    const [tokenSymbol, setTokenSymbol] = useState('');

    // Flat pool-creation fee read from the factory config
    // (`pool_creation_fee`, base units of uosmo; testnet 1000000 = 1 OSMO).
    // Enforced on-chain via must_pay when > 0: the exact amount must ride
    // in `funds`. Zero fee = attach nothing (the factory rejects surplus
    // funds when the fee is disabled). null = not loaded / query failed.
    const [creationFeeMicro, setCreationFeeMicro] = useState<string | null>(null);

    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    const FACTORY = factoryAddress || process.env.REACT_APP_FACTORY_ADDRESS || '';

    useEffect(() => {
        let cancelled = false;
        queryFactoryConfig().then((cfg) => {
            if (!cancelled && cfg) setCreationFeeMicro(BigInt(cfg.pool_creation_fee ?? '0').toString());
        }).catch(() => { /* fee stays null; re-read at submit time */ });
        return () => { cancelled = true; };
    }, []);

    const feeDisplay = creationFeeMicro === null
        ? 'unavailable'
        : creationFeeMicro === '0'
            ? 'none (disabled by factory config)'
            : `${(Number(creationFeeMicro) / 1_000_000).toLocaleString()} ${NATIVE_SYMBOL}`;

    const handleCreate = async () => {
        if (!client || !address) { setStatus('Please connect your wallet'); return; }
        if (!FACTORY) { setStatus('Error: Factory address not configured'); return; }

        // SECURITY: Validate factory address is well-formed bech32.
        const factoryCheck = validateBech32Address(FACTORY);
        if (!factoryCheck.ok) {
            setStatus(`Error: Factory address invalid — ${factoryCheck.error}`);
            return;
        }

        // SECURITY: Assert chain ID matches the expected Osmosis chain before signing.
        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) {
            setStatus(`Error: ${chainCheck.error}`);
            return;
        }

        try {
            setTxHash('');

            if (!tokenName || !tokenSymbol) { setStatus('Error: Enter token name and symbol'); return; }

            // Mirror the contract's validate_creator_token_info bounds.
            if (tokenName.length < 3 || tokenName.length > 50 || !/^[\x20-\x7E]+$/.test(tokenName)) {
                setStatus('Error: Token name must be 3-50 printable ASCII characters');
                return;
            }
            if (!/^[A-Z0-9]{3,12}$/.test(tokenSymbol) || !/[A-Z]/.test(tokenSymbol)) {
                setStatus('Error: Token symbol must be 3-12 chars (A-Z, 0-9) with at least one letter');
                return;
            }

            // Re-read the fee at submit time in case the config changed (or
            // the mount-time read failed).
            let feeMicro = creationFeeMicro;
            if (feeMicro === null) {
                const cfg = await queryFactoryConfig();
                if (!cfg) { setStatus('Error: Could not read the pool creation fee from the factory'); return; }
                feeMicro = BigInt(cfg.pool_creation_fee ?? '0').toString();
                setCreationFeeMicro(feeMicro);
            }
            const funds = feeMicro !== '0'
                ? [{ denom: NATIVE_DENOM, amount: feeMicro }]
                : [];

            setStatus('Creating creator pool...');

            // The factory's CreatePool carries only pool_token_info; every
            // other economic knob (commit threshold, fee splits, threshold
            // payout amounts, lock caps, TWAP pricing config) is sourced
            // from the factory's stored config.
            const createMsg = {
                create: {
                    pool_msg: {
                        pool_token_info: [
                            { bluechip: { denom: NATIVE_DENOM } },
                            { creator_token: { contract_addr: CREATOR_TOKEN_SENTINEL } },
                        ],
                    },
                    token_info: {
                        name: tokenName,
                        symbol: tokenSymbol,
                        decimal: 6,
                    },
                },
            };

            const result = await client.execute(address, FACTORY, createMsg, { amount: [], gas: '2000000' }, 'Create Creator Pool', funds);
            setTxHash(result.transactionHash);
            setStatus('Success! Creator pool creation submitted.');
            setTokenName('');
            setTokenSymbol('');
        } catch (err) {
            setStatus('Error: ' + (err as Error).message);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Token Name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="My Creator Token" required helperText="3-50 printable ASCII characters" />
            <TextField label="Token Symbol" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())} placeholder="MCT" required inputProps={{ maxLength: 12 }} helperText="3-12 chars, A-Z + 0-9, at least one letter" />
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>Pool Configuration</Typography>
                <Typography variant="body2">All commit-phase economics (threshold, fees, lock caps, TWAP pricing) are read from the factory's stored config. The CreatePool payload only carries the token pair; any caller-supplied overrides are ignored.</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                    Creation fee: <strong>{feeDisplay}</strong>
                    {creationFeeMicro !== null && creationFeeMicro !== '0' && ' — attached to the transaction automatically.'}
                </Typography>
            </Box>

            <Button variant="contained" onClick={handleCreate} disabled={!client || !address}>
                Create Creator Pool
            </Button>
            {status && <Alert severity={status.includes('Success') ? 'success' : status.includes('Error') ? 'error' : 'info'}>{status}</Alert>}
            <TxHashDisplay txHash={txHash} />
        </Box>
    );
};

// =========================================================================
// SUBSCRIBE / COMMIT TAB (creator-pool only)
// =========================================================================
const CommitTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [subTab, setSubTab] = useState(0);
    const [poolAddress, setPoolAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [maxSpread, setMaxSpread] = useState('0.005');
    const [deadline, setDeadline] = useState('20');
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    const handleSubscribe = async () => {
        if (!client || !address || !poolAddress) { setStatus('Connect wallet and enter pool address'); return; }

        // SECURITY: Validate pool address is a well-formed Osmosis bech32 address.
        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        // SECURITY: Validate amount using string-math to avoid floating-point drift.
        const amtCheck = validateTokenAmount(amount, COIN_DECIMALS);
        if (!amtCheck.ok) { setStatus(`Error: ${amtCheck.error}`); return; }

        // SECURITY: Assert chain ID matches the expected Osmosis chain before signing.
        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Subscribing...');
            setTxHash('');
            const micro = amtCheck.micro!;

            const thresholdStatus = await client.queryContractSmart(poolAddress, { is_fully_commited: {} });
            const isThresholdCrossed = isFullyCommitted(thresholdStatus);
            const txDeadline = deadlineNs(deadline);
            const { bluechipDenom } = await resolvePoolAssets(client, poolAddress);

            const msg = {
                commit: {
                    asset: { info: { bluechip: { denom: bluechipDenom } }, amount: micro },
                    transaction_deadline: txDeadline,
                    belief_price: null,
                    max_spread: (isThresholdCrossed && maxSpread) ? maxSpread : null,
                },
            };

            const result = await client.execute(address, poolAddress, msg, { amount: [], gas: '600000' }, 'Commit', [{ denom: bluechipDenom, amount: micro }]);
            setTxHash(result.transactionHash);
            setStatus('Success! Transaction confirmed.');
        } catch (err) {
            setStatus('Error: ' + humanizeContractError(err));
        }
    };

    return (
        <Box>
            <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }}>
                <Tab label="Commit" />
                <Tab label="Progress Tracker" />
            </Tabs>
            {subTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <OracleStatusBanner />
                    <PoolPickerField value={poolAddress} onChange={setPoolAddress} label="Pool" />
                    <TextField label={`Amount (${NATIVE_SYMBOL})`} value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
                    <TextField label="Max Spread" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} helperText="e.g. 0.005 for 0.5%" />
                    <TextField label="Deadline (minutes)" value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
                    <Button variant="contained" onClick={handleSubscribe} disabled={!client}>Commit</Button>
                    {status && <Alert severity={status.includes('Success') ? 'success' : 'info'}>{status}</Alert>}
                    <TxHashDisplay txHash={txHash} />
                </Box>
            )}
            {subTab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <PoolPickerField value={poolAddress} onChange={setPoolAddress} label="Pool" />
                    {poolAddress && <CommitTracker client={client} contractAddress={poolAddress} />}
                </Box>
            )}
        </Box>
    );
};

// =========================================================================
// SWAP TAB
// =========================================================================
const SwapTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [poolAddress, setPoolAddress] = useState('');
    const [offerAsset, setOfferAsset] = useState('');
    const [amount, setAmount] = useState('');
    const [maxSpread, setMaxSpread] = useState('0.005');
    const [deadline, setDeadline] = useState('20');
    const [allowHighSpread, setAllowHighSpread] = useState(false);
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    const handleSwap = async () => {
        if (!client || !address || !poolAddress) { setStatus('Connect wallet and enter pool address'); return; }

        // SECURITY: Validate pool address is a well-formed Osmosis bech32 address.
        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        // SECURITY: Validate amount using string-math to avoid floating-point drift.
        const amtCheck = validateTokenAmount(amount, COIN_DECIMALS);
        if (!amtCheck.ok) { setStatus(`Error: ${amtCheck.error}`); return; }

        // SECURITY: Validate slippage bounds (maxSpread is a decimal string).
        const spreadPct = parseFloat(maxSpread) * 100;
        if (Number.isFinite(spreadPct)) {
            const slipCheck = validateSlippage(spreadPct);
            if (!slipCheck.ok) { setStatus(`Error: ${slipCheck.error}`); return; }
        }

        // SECURITY: Assert chain ID matches the expected Osmosis chain before signing.
        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Swapping...');
            setTxHash('');
            const micro = amtCheck.micro!;
            const txDeadline = deadlineNs(deadline);

            const isContract = offerAsset.length > 20 && (offerAsset.startsWith('osmo') || offerAsset.startsWith('cosmos'));

            if (!isContract) {
                // Native OSMO swap.
                const msg = {
                    simple_swap: {
                        offer_asset: { info: { bluechip: { denom: offerAsset || NATIVE_DENOM } }, amount: micro },
                        belief_price: null,
                        max_spread: maxSpread || null,
                        allow_high_max_spread: allowHighSpread ? true : null,
                        to: null,
                        transaction_deadline: txDeadline,
                    },
                };
                const result = await client.execute(
                    address,
                    poolAddress,
                    msg,
                    { amount: [], gas: '500000' },
                    'Swap',
                    [{ denom: offerAsset || NATIVE_DENOM, amount: micro }],
                );
                setTxHash(result.transactionHash);
                setStatus('Success!');
            } else {
                // CW20 swap via send hook. The hook payload is the
                // pool's Cw20HookMsg::Swap variant.
                const hookMsg = {
                    swap: {
                        belief_price: null,
                        max_spread: maxSpread || null,
                        allow_high_max_spread: allowHighSpread ? true : null,
                        to: null,
                        transaction_deadline: txDeadline,
                    },
                };
                const msg = { send: { contract: poolAddress, amount: micro, msg: btoa(JSON.stringify(hookMsg)) } };
                const result = await client.execute(address, offerAsset, msg, { amount: [], gas: '500000' }, 'Swap CW20', []);
                setTxHash(result.transactionHash);
                setStatus('Success!');
            }
        } catch (err) {
            setStatus('Error: ' + humanizeContractError(err));
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PoolPickerField value={poolAddress} onChange={setPoolAddress} label="Pool" />
            <TextField label="Offer Asset (denom or CW20 address)" value={offerAsset} onChange={(e) => setOfferAsset(e.target.value)} helperText={`e.g. ${NATIVE_DENOM} or a CW20 contract address`} />
            <TextField label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
            <TextField label="Max Spread" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} helperText="e.g. 0.005 for 0.5%" />
            <TextField label="Deadline (minutes)" value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer' }}
                onClick={() => setAllowHighSpread(!allowHighSpread)}>
                <Box sx={{ width: 18, height: 18, borderRadius: '4px', border: `2px solid ${allowHighSpread ? '#1976d2' : '#757575'}`, backgroundColor: allowHighSpread ? '#1976d2' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {allowHighSpread && <span style={{ color: 'white', fontSize: 12 }}>✓</span>}
                </Box>
                <Typography variant="body2">Allow max_spread above the safety cap</Typography>
            </Box>
            <Button variant="contained" color="secondary" onClick={handleSwap} disabled={!client}>Swap</Button>
            {status && <Alert severity={status.includes('Success') ? 'success' : 'info'}>{status}</Alert>}
            <TxHashDisplay txHash={txHash} />
        </Box>
    );
};

// =========================================================================
// LIQUIDITY TAB
// =========================================================================
const LiquidityTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [subTab, setSubTab] = useState(0);
    const [poolAddress, setPoolAddress] = useState('');
    const [amount0, setAmount0] = useState('');
    const [amount1, setAmount1] = useState('');
    const [positionId, setPositionId] = useState('');
    const [removeAmount, setRemoveAmount] = useState('');
    const [removeMode, setRemoveMode] = useState('amount');
    const [removePercent, setRemovePercent] = useState('');
    const [slippage, setSlippage] = useState('1');
    const [deadline, setDeadline] = useState('20');
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    const handleDeposit = async () => {
        if (!client || !address || !poolAddress) { setStatus('Connect wallet and set pool address'); return; }

        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        const amt0Check = validateTokenAmount(amount0, COIN_DECIMALS);
        if (!amt0Check.ok) { setStatus(`Error: ${NATIVE_SYMBOL} amount — ${amt0Check.error}`); return; }
        const amt1Check = validateTokenAmount(amount1, COIN_DECIMALS);
        if (!amt1Check.ok) { setStatus(`Error: Creator token amount — ${amt1Check.error}`); return; }

        const slipCheck = validateSlippage(slippage);
        if (!slipCheck.ok) { setStatus(`Error: ${slipCheck.error}`); return; }

        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Depositing...');
            setTxHash('');
            const a0 = amt0Check.micro!;
            const a1 = amt1Check.micro!;

            const { tokenAddress, bluechipDenom } = await resolvePoolAssets(client, poolAddress);
            if (!tokenAddress) { setStatus('Error: No creator token found in pool'); return; }

            setStatus('Approving tokens...');
            await ensureCw20Allowance(client, address, tokenAddress, poolAddress, a1);

            // DepositLiquidity (matches both creator-pool and standard-pool):
            // amount0/amount1 + optional min_amount0/min_amount1 + optional
            // transaction_deadline. No max_ratio_deviation_bps here — that
            // field only exists on the remove handlers.
            const msg = {
                deposit_liquidity: {
                    amount0: a0,
                    amount1: a1,
                    min_amount0: minAmountAfterSlippage(a0, slippage),
                    min_amount1: minAmountAfterSlippage(a1, slippage),
                    transaction_deadline: deadlineNs(deadline),
                },
            };

            setStatus('Depositing...');
            const result = await client.execute(address, poolAddress, msg, { amount: [], gas: '500000' }, 'Deposit Liquidity', [{ denom: bluechipDenom, amount: a0 }]);
            setTxHash(result.transactionHash);
            setStatus('Success!');
        } catch (err) { setStatus('Error: ' + (err as Error).message); }
    };

    const handleAddToPosition = async () => {
        if (!client || !address || !poolAddress || !positionId) { setStatus('Fill in pool address and position ID'); return; }

        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        const amt0Check = validateTokenAmount(amount0, COIN_DECIMALS);
        if (!amt0Check.ok) { setStatus(`Error: ${NATIVE_SYMBOL} amount — ${amt0Check.error}`); return; }
        const amt1Check = validateTokenAmount(amount1, COIN_DECIMALS);
        if (!amt1Check.ok) { setStatus(`Error: Creator token amount — ${amt1Check.error}`); return; }

        const slipCheck = validateSlippage(slippage);
        if (!slipCheck.ok) { setStatus(`Error: ${slipCheck.error}`); return; }

        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Adding to position...');
            setTxHash('');
            const a0 = amt0Check.micro!;
            const a1 = amt1Check.micro!;

            const { tokenAddress, bluechipDenom } = await resolvePoolAssets(client, poolAddress);
            if (!tokenAddress) { setStatus('Error: No creator token found in pool'); return; }

            setStatus('Approving tokens...');
            await ensureCw20Allowance(client, address, tokenAddress, poolAddress, a1);

            const msg = {
                add_to_position: {
                    position_id: positionId,
                    amount0: a0,
                    amount1: a1,
                    min_amount0: minAmountAfterSlippage(a0, slippage),
                    min_amount1: minAmountAfterSlippage(a1, slippage),
                    transaction_deadline: deadlineNs(deadline),
                },
            };

            setStatus('Adding to position...');
            const result = await client.execute(address, poolAddress, msg, { amount: [], gas: '500000' }, 'Add To Position', [{ denom: bluechipDenom, amount: a0 }]);
            setTxHash(result.transactionHash);
            setStatus('Success!');
        } catch (err) { setStatus('Error: ' + (err as Error).message); }
    };

    const handleRemove = async () => {
        if (!client || !address || !poolAddress || !positionId) { setStatus('Fill in all fields'); return; }

        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        const slipCheck = validateSlippage(slippage);
        if (!slipCheck.ok) { setStatus(`Error: ${slipCheck.error}`); return; }

        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Removing...');
            setTxHash('');
            const deviationBps = slippage ? Math.floor(parseFloat(slippage) * 100) : null;
            const txDeadline = deadlineNs(deadline);

            let msg: any;
            if (removeMode === 'all') {
                msg = { remove_all_liquidity: { position_id: positionId, min_amount0: null, min_amount1: null, max_ratio_deviation_bps: deviationBps, transaction_deadline: txDeadline } };
            } else if (removeMode === 'percent') {
                msg = { remove_partial_liquidity_by_percent: { position_id: positionId, percentage: parseInt(removePercent, 10) || 0, min_amount0: null, min_amount1: null, max_ratio_deviation_bps: deviationBps, transaction_deadline: txDeadline } };
            } else {
                msg = { remove_partial_liquidity: { position_id: positionId, liquidity_to_remove: Math.floor(parseFloat(removeAmount)).toString(), min_amount0: null, min_amount1: null, max_ratio_deviation_bps: deviationBps, transaction_deadline: txDeadline } };
            }

            const result = await client.execute(address, poolAddress, msg, { amount: [], gas: '500000' }, 'Remove Liquidity');
            setTxHash(result.transactionHash);
            setStatus('Success!');
        } catch (err) { setStatus('Error: ' + (err as Error).message); }
    };

    return (
        <Box>
            <Box sx={{ mb: 2 }}><PoolPickerField value={poolAddress} onChange={setPoolAddress} label="Pool" /></Box>
            <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }}>
                <Tab label="Provide Liquidity" />
                <Tab label="Add to Position" />
                <Tab label="Remove Liquidity" />
            </Tabs>
            {subTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Amount 0 (OSMO)" value={amount0} onChange={(e) => setAmount0(e.target.value)} type="number" />
                    <TextField label="Amount 1 (Creator Token)" value={amount1} onChange={(e) => setAmount1(e.target.value)} type="number" />
                    <TextField label="Slippage (%)" value={slippage} onChange={(e) => setSlippage(e.target.value)} type="number" />
                    <TextField label="Deadline (minutes)" value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
                    <Button variant="contained" onClick={handleDeposit} disabled={!client}>Provide Liquidity</Button>
                </Box>
            )}
            {subTab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Position ID" value={positionId} onChange={(e) => setPositionId(e.target.value)} />
                    <TextField label="Amount 0 (OSMO)" value={amount0} onChange={(e) => setAmount0(e.target.value)} type="number" />
                    <TextField label="Amount 1 (Creator Token)" value={amount1} onChange={(e) => setAmount1(e.target.value)} type="number" />
                    <TextField label="Slippage (%)" value={slippage} onChange={(e) => setSlippage(e.target.value)} type="number" />
                    <TextField label="Deadline (minutes)" value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
                    <Button variant="contained" onClick={handleAddToPosition} disabled={!client}>Add to Position</Button>
                </Box>
            )}
            {subTab === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Position ID" value={positionId} onChange={(e) => setPositionId(e.target.value)} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant={removeMode === 'amount' ? 'contained' : 'outlined'} size="small" onClick={() => setRemoveMode('amount')}>Amount</Button>
                        <Button variant={removeMode === 'percent' ? 'contained' : 'outlined'} size="small" onClick={() => setRemoveMode('percent')}>Percentage</Button>
                        <Button variant={removeMode === 'all' ? 'contained' : 'outlined'} size="small" onClick={() => setRemoveMode('all')}>Remove All</Button>
                    </Box>
                    {removeMode === 'amount' && <TextField label="Liquidity to Remove" value={removeAmount} onChange={(e) => setRemoveAmount(e.target.value)} type="number" />}
                    {removeMode === 'percent' && <TextField label="Percentage (0-100)" value={removePercent} onChange={(e) => setRemovePercent(e.target.value)} type="number" />}
                    <TextField label="Max Deviation (%)" value={slippage} onChange={(e) => setSlippage(e.target.value)} type="number" />
                    <TextField label="Deadline (minutes)" value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
                    <Button variant="contained" color="error" onClick={handleRemove} disabled={!client}>Remove Liquidity</Button>
                </Box>
            )}
            {status && <Alert severity={status.includes('Success') ? 'success' : 'info'} sx={{ mt: 2 }}>{status}</Alert>}
            <TxHashDisplay txHash={txHash} />
        </Box>
    );
};

// =========================================================================
// FEES TAB
// =========================================================================
const FeesTab: React.FC<{ client: SigningCosmWasmClient | null; address: string }> = ({ client, address }) => {
    const [poolAddress, setPoolAddress] = useState('');
    const [positionId, setPositionId] = useState('');
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState('');

    const handleCollect = async () => {
        if (!client || !address || !poolAddress) { setStatus('Connect wallet and enter pool address'); return; }

        const addrCheck = validateBech32Address(poolAddress);
        if (!addrCheck.ok) { setStatus(`Error: Pool address invalid — ${addrCheck.error}`); return; }

        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) { setStatus(`Error: ${chainCheck.error}`); return; }

        try {
            setStatus('Verifying ownership...');
            setTxHash('');
            const pos = await client.queryContractSmart(poolAddress, { position: { position_id: positionId } });
            if (pos.owner !== address) { setStatus('Error: You do not own this position'); return; }

            setStatus('Collecting fees...');
            const result = await client.execute(address, poolAddress, { collect_fees: { position_id: positionId } }, { amount: [], gas: '400000' }, 'Collect Fees');
            setTxHash(result.transactionHash);
            setStatus('Success!');
        } catch (err) { setStatus('Error: ' + (err as Error).message); }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PoolPickerField value={poolAddress} onChange={setPoolAddress} label="Pool" />
            <TextField label="Position ID" value={positionId} onChange={(e) => setPositionId(e.target.value)} />
            <Button variant="contained" color="success" onClick={handleCollect} disabled={!client}>Collect Fees</Button>
            {status && <Alert severity={status.includes('Success') ? 'success' : 'info'}>{status}</Alert>}
            <TxHashDisplay txHash={txHash} />
        </Box>
    );
};

// =========================================================================
// MAIN DEFI PAGE
// =========================================================================
const DefiPage: React.FC = () => {
    const { client, address, balance } = useWallet();
    const location = useLocation();
    const [mainTab, setMainTab] = useState(0);

    // Allow deep-linking to a specific tab via ?tab=<name>. The "Commit"
    // shortcut in the top bar relies on this to drop the user straight on
    // the commit form when they land on /defi.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        const map: Record<string, number> = { create: 0, commit: 1, swap: 2, crosstoken: 3, liquidity: 4, fees: 5 };
        if (tab && tab in map) setMainTab(map[tab]);
    }, [location.search]);

    return (
        <PageShell>
                <Grid item xs={12} md={10}>
                    <Card>
                        <CardContent>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                                <Typography variant="h5" fontWeight="bold">Creator Economy</Typography>
                                {balance && (
                                    <Typography variant="body2">
                                        {formatMicroAmount(balance.amount)} OSMO
                                    </Typography>
                                )}
                            </Stack>

                            <Tabs
                                value={mainTab}
                                onChange={(_, v) => setMainTab(v)}
                                variant="scrollable"
                                scrollButtons="auto"
                                sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}
                            >
                                <Tab label="Create Pool" />
                                <Tab label="Commit" />
                                <Tab label="Swap" />
                                <Tab label="Cross-Token" />
                                <Tab label="Liquidity" />
                                <Tab label="Collect Fees" />
                            </Tabs>

                            <TabPanel value={mainTab} index={0}>
                                <CreatePoolTab client={client} address={address} />
                            </TabPanel>
                            <TabPanel value={mainTab} index={1}>
                                <CommitTab client={client} address={address} />
                            </TabPanel>
                            <TabPanel value={mainTab} index={2}>
                                <SwapTab client={client} address={address} />
                            </TabPanel>
                            <TabPanel value={mainTab} index={3}>
                                <CrossTokenSwapTab client={client} address={address} />
                            </TabPanel>
                            <TabPanel value={mainTab} index={4}>
                                <LiquidityTab client={client} address={address} />
                            </TabPanel>
                            <TabPanel value={mainTab} index={5}>
                                <FeesTab client={client} address={address} />
                            </TabPanel>
                        </CardContent>
                    </Card>
                </Grid>
        </PageShell>
    );
};

export default DefiPage;
