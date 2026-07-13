import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    Button,
    TextField,
    Typography,
    Box,
    Stepper,
    Step,
    StepLabel,
    Alert,
    CircularProgress,
    IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useWallet } from '../../context/WalletContext';
import { NATIVE_DENOM, NATIVE_SYMBOL } from '../../defi/types';
import { factoryAddress } from '../universal/IndividualPage.const';
import {
    validateBech32Address,
    assertWalletOnExpectedChain,
    sanitizeOnChainString,
} from '../../utils/security';

interface CreatePoolModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

type TxStage = 'input' | 'confirm' | 'executing' | 'success' | 'error';

// SECURITY: Token name/symbol allowlists. Match the on-chain validator in
// `factory/src/execute/pool_lifecycle/create.rs::validate_creator_token_info`:
//   - name: 3..=50 printable ASCII chars
//   - symbol: 3..=12 uppercase ASCII letters + digits, must contain ≥1 letter
// Sanitizing here keeps malformed strings from ever reaching the chain.
const TOKEN_NAME_RE = /^[\x20-\x7E]+$/;
const TOKEN_SYMBOL_RE = /^[A-Z0-9]+$/;
const TOKEN_NAME_MIN = 3;
const TOKEN_NAME_MAX = 50;
const TOKEN_SYMBOL_MIN = 3;
const TOKEN_SYMBOL_MAX = 12;

// The factory rewrites this sentinel with the freshly-minted CW20
// contract address. Must match `CREATOR_TOKEN_SENTINEL` in
// `factory/src/execute/pool_lifecycle/create.rs`.
const CREATOR_TOKEN_SENTINEL = 'WILL_BE_CREATED_BY_FACTORY';

const CreatePoolModal: React.FC<CreatePoolModalProps> = ({ open, onClose, onSuccess }) => {
    const { client, address } = useWallet();
    const [stage, setStage] = useState<TxStage>('input');
    const [tokenName, setTokenName] = useState('');
    const [tokenSymbol, setTokenSymbol] = useState('');
    const [txHash, setTxHash] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [inputError, setInputError] = useState('');
    // uosmo attached as the flat creation fee: '0' = fee disabled (attach
    // nothing), null = quote not loaded / failed.
    const [creationFeeMicro, setCreationFeeMicro] = useState<string | null>(null);

    const steps = ['Pool Details', 'Confirm', 'Result'];
    const activeStep = stage === 'input' ? 0 : stage === 'confirm' || stage === 'executing' ? 1 : 2;

    const FACTORY = factoryAddress || process.env.REACT_APP_FACTORY_ADDRESS || '';

    const feeDisplay = creationFeeMicro === null
        ? 'unavailable'
        : creationFeeMicro === '0'
            ? 'disabled'
            : `${(Number(creationFeeMicro) / 1_000_000).toLocaleString()} ${NATIVE_SYMBOL}`;

    const resetAndClose = () => {
        setStage('input');
        setTokenName('');
        setTokenSymbol('');
        setTxHash('');
        setErrorMsg('');
        setInputError('');
        setCreationFeeMicro(null);
        onClose();
    };

    // The factory charges a flat `pool_creation_fee` on every `create`
    // call, denominated in base units of its bluechip_denom (uosmo;
    // testnet value 1000000 = 1 OSMO) and validated with must_pay when
    // non-zero — the exact amount MUST be attached to the execute. When
    // the fee is zero the factory rejects any attached funds, so send
    // nothing.
    const quoteCreationFee = async (): Promise<string> => {
        if (!client) throw new Error('Wallet not connected');
        const { factory } = await client.queryContractSmart(FACTORY, { factory: {} });
        return BigInt(factory?.pool_creation_fee ?? '0').toString();
    };

    const handleReview = async () => {
        setInputError('');

        if (FACTORY) {
            const factoryCheck = validateBech32Address(FACTORY);
            if (!factoryCheck.ok) {
                setInputError(`Factory address invalid: ${factoryCheck.error}`);
                return;
            }
        }

        // The factory mints a new CW20 from name/symbol.
        // Mirrors on-chain `validate_creator_token_info`.
        if (!tokenName.trim()) {
            setInputError('Token name is required.');
            return;
        }
        if (tokenName.length < TOKEN_NAME_MIN || tokenName.length > TOKEN_NAME_MAX) {
            setInputError(`Token name must be ${TOKEN_NAME_MIN}-${TOKEN_NAME_MAX} characters.`);
            return;
        }
        if (!TOKEN_NAME_RE.test(tokenName)) {
            setInputError('Token name must contain only printable ASCII characters.');
            return;
        }

        if (!tokenSymbol.trim()) {
            setInputError('Token symbol is required.');
            return;
        }
        if (tokenSymbol.length < TOKEN_SYMBOL_MIN || tokenSymbol.length > TOKEN_SYMBOL_MAX) {
            setInputError(`Token symbol must be ${TOKEN_SYMBOL_MIN}-${TOKEN_SYMBOL_MAX} characters.`);
            return;
        }
        if (!TOKEN_SYMBOL_RE.test(tokenSymbol)) {
            setInputError('Token symbol must be uppercase letters and digits only.');
            return;
        }
        if (!/[A-Z]/.test(tokenSymbol)) {
            setInputError('Token symbol must contain at least one letter.');
            return;
        }

        // Read the flat creation fee before showing the confirm step so
        // the user sees exactly what will be attached. A failed read is
        // surfaced as an input error rather than a doomed transaction.
        if (client && FACTORY) {
            try {
                setCreationFeeMicro(await quoteCreationFee());
            } catch (err) {
                setCreationFeeMicro(null);
                setInputError(`Could not read the pool creation fee: ${(err as Error).message}`);
                return;
            }
        }

        setStage('confirm');
    };

    const buildCreatorPoolMsg = () => ({
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
    });

    const handleConfirm = async () => {
        if (!client || !address) return;
        if (!FACTORY) {
            setErrorMsg('Factory address not configured');
            setStage('error');
            return;
        }

        const chainCheck = await assertWalletOnExpectedChain(client);
        if (!chainCheck.ok) {
            setErrorMsg(chainCheck.error!);
            setStage('error');
            return;
        }

        if (creationFeeMicro === null) {
            setErrorMsg('Pool creation fee missing — go back and review again.');
            setStage('error');
            return;
        }

        setStage('executing');
        try {
            const createMsg = buildCreatorPoolMsg();
            const funds = creationFeeMicro !== '0'
                ? [{ denom: NATIVE_DENOM, amount: creationFeeMicro }]
                : [];

            try {
                await client.simulate(address, [{
                    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
                    value: {
                        sender: address,
                        contract: FACTORY,
                        msg: new TextEncoder().encode(JSON.stringify(createMsg)),
                        funds,
                    },
                }], 'Create Pool');
            } catch (simErr) {
                setErrorMsg(`Simulation failed — transaction would be rejected: ${(simErr as Error).message}`);
                setStage('error');
                return;
            }

            const result = await client.execute(
                address,
                FACTORY,
                createMsg,
                { amount: [], gas: '2000000' },
                'Create Creator Pool',
                funds
            );
            setTxHash(result.transactionHash);
            setStage('success');
            onSuccess?.();
        } catch (err) {
            setErrorMsg((err as Error).message);
            setStage('error');
        }
    };

    return (
        <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Create a Creator Pool
                <IconButton onClick={resetAndClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
                <Stepper activeStep={activeStep} sx={{ mb: 3, mt: 1 }} alternativeLabel>
                    {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                {stage === 'input' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Create your own creator token and liquidity pool. Subscribers commit {NATIVE_SYMBOL}
                            {' '}to fund the pool. Once the threshold is reached, trading goes live.
                        </Typography>
                        <TextField
                            label="Token Name"
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)}
                            placeholder="My Creator Token"
                            fullWidth
                            required
                            inputProps={{ maxLength: TOKEN_NAME_MAX }}
                            helperText={`${TOKEN_NAME_MIN}-${TOKEN_NAME_MAX} printable ASCII characters.`}
                        />
                        <TextField
                            label="Token Symbol"
                            value={tokenSymbol}
                            onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                            placeholder="MCT"
                            fullWidth
                            required
                            inputProps={{ maxLength: TOKEN_SYMBOL_MAX }}
                            helperText={`${TOKEN_SYMBOL_MIN}-${TOKEN_SYMBOL_MAX} uppercase letters/digits, must contain a letter.`}
                        />
                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                                Pool Configuration (factory-managed)
                            </Typography>
                            <Typography variant="body2">Decimals: 6 (required by contract)</Typography>
                            <Typography variant="body2">
                                Threshold, fee splits, lock caps and pricing config are read from the
                                factory's stored configuration. The factory charges a flat creation
                                fee in {NATIVE_SYMBOL}, shown on the confirmation step.
                            </Typography>
                        </Box>

                        {inputError && <Alert severity="error">{inputError}</Alert>}
                        <Button
                            variant="contained"
                            onClick={handleReview}
                            disabled={!tokenName || !tokenSymbol}
                            fullWidth
                        >
                            Review Pool
                        </Button>
                    </Box>
                )}

                {(stage === 'confirm' || stage === 'executing') && (
                    <Box>
                        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                            Confirm Pool Creation
                        </Typography>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {`Creating a creator pool with token "${sanitizeOnChainString(tokenSymbol, TOKEN_SYMBOL_MAX)}" (${sanitizeOnChainString(tokenName, TOKEN_NAME_MAX)}). Subscribers commit ${NATIVE_SYMBOL} toward the funding threshold before trading goes live.`}
                        </Alert>
                        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 2, mb: 2 }}>
                            {[
                                { label: 'Token Name', value: sanitizeOnChainString(tokenName, TOKEN_NAME_MAX) },
                                { label: 'Token Symbol', value: sanitizeOnChainString(tokenSymbol, TOKEN_SYMBOL_MAX) },
                                { label: 'Decimals', value: '6' },
                                { label: 'Creator Wallet', value: `${address.slice(0, 12)}...${address.slice(-6)}` },
                                { label: 'Creation Fee (flat)', value: feeDisplay },
                            ].map((d, i) => (
                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                    <Typography variant="body2" color="text.secondary">{d.label}</Typography>
                                    <Typography variant="body2" fontWeight="bold">{d.value}</Typography>
                                </Box>
                            ))}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant="outlined" onClick={() => setStage('input')} disabled={stage === 'executing'} fullWidth>
                                Back
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleConfirm}
                                disabled={stage === 'executing'}
                                fullWidth
                                startIcon={stage === 'executing' ? <CircularProgress size={16} color="inherit" /> : null}
                            >
                                {stage === 'executing' ? 'Creating Pool...' : 'Create Pool'}
                            </Button>
                        </Box>
                    </Box>
                )}

                {stage === 'success' && (
                    <Box>
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Pool created successfully!
                            {tokenSymbol && (
                                <> Your token &quot;{sanitizeOnChainString(tokenSymbol, TOKEN_SYMBOL_MAX)}&quot; is now live.</>
                            )}
                        </Alert>
                        {txHash && (
                            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 2, mb: 2 }}>
                                <Typography variant="caption" color="text.secondary">Transaction Hash</Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.8rem' }}>
                                    {txHash}
                                </Typography>
                            </Box>
                        )}
                        <Button variant="contained" onClick={resetAndClose} fullWidth>Close</Button>
                    </Box>
                )}

                {stage === 'error' && (
                    <Box>
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {errorMsg || 'Pool creation failed'}
                        </Alert>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant="outlined" onClick={() => setStage('input')} fullWidth>Try Again</Button>
                            <Button variant="contained" onClick={resetAndClose} fullWidth>Close</Button>
                        </Box>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreatePoolModal;
