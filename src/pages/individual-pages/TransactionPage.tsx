import React, { useEffect, useState } from 'react'
import { Card, CardContent, Chip, Divider, Grid, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import RecentTransactionsTable from '../../components/table-pages/RecentTransactionsTable';
import { apiEndpoint } from '../../components/universal/IndividualPage.const';
import { decodeMessageType, describeWasmExecute, formatAmount, formatDenom, WasmActionInfo } from '../../utils/txDecoder';
import { CardSkeleton } from '../../components/universal/LoadingSkeleton';
import CopyableId from '../../components/universal/CopyableId';

interface TxView {
    hash: string;
    timestamp: string;
    status: string;
    block: string;
    sender: string;
    recipient: string;
    gasPrice: string | number;
    value: string | number;
    messageType: string;
    denom: string;
    memo: string;
    msgCount: number;
    wasm: WasmActionInfo | null;
}

const EMPTY_TX: TxView = {
    hash: '', timestamp: '', status: '', block: '', sender: '', recipient: '',
    gasPrice: 0, value: 0, messageType: '', denom: '', memo: '', msgCount: 0, wasm: null,
};

// Parses one decoded LCD message into the page's flat view. For wasm
// executes the recipient is the contract and the funds array carries
// the attached coins.
function viewFromMessage(msg: any): Partial<TxView> {
    const isWasm = typeof msg['@type'] === 'string' && msg['@type'].includes('MsgExecuteContract');
    const funds0 = Array.isArray(msg.funds) ? msg.funds[0] : undefined;
    return {
        sender: msg.from_address || msg.sender || msg.delegator_address || '',
        recipient: msg.to_address || msg.contract || msg.receiver || msg.validator_address || '',
        value: msg.amount?.[0]?.amount || msg.amount?.amount || funds0?.amount || 0,
        denom: msg.amount?.[0]?.denom || msg.amount?.denom || msg.token?.denom || funds0?.denom || '',
        messageType: msg['@type'] || msg.type || '',
        wasm: isWasm ? describeWasmExecute(msg.msg) : null,
    };
}

const TransactionPage: React.FC = () => {

    const { id } = useParams<{ id: string }>();
    const [txInfo, setTxInfo] = useState<TxView>(EMPTY_TX);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchTransaction = async () => {
            setLoading(true);
            try {
                // Standard Cosmos LCD tx-by-hash endpoint (decoded JSON
                // messages, `msg` payloads base64-encoded).
                const response = await fetch(`${apiEndpoint}/cosmos/tx/v1beta1/txs/${id}`);
                const data = await response.json();

                if (data.tx && data.tx_response) {
                    const tx = data.tx;
                    const resp = data.tx_response;
                    const messages: any[] = tx.body?.messages ?? [];
                    const msg = messages[0] ?? {};
                    setTxInfo({
                        ...EMPTY_TX,
                        ...viewFromMessage(msg),
                        hash: resp.txhash,
                        timestamp: resp.timestamp ? new Date(resp.timestamp).toLocaleString() : '',
                        status: resp.code === 0 ? 'Success' : 'Failed',
                        block: String(resp.height ?? ''),
                        gasPrice: tx.auth_info?.fee?.amount?.[0]?.amount || 0,
                        memo: tx.body?.memo || '',
                        msgCount: messages.length,
                    });
                } else if (data.result?.tx) {
                    // Legacy fallback for nodes proxying the Tendermint RPC shape.
                    const tx = data.result.tx;
                    const txResult = data.result.tx_result;
                    const messages: any[] = tx.body?.messages ?? [];
                    const msg = messages[0] ?? {};
                    setTxInfo({
                        ...EMPTY_TX,
                        ...viewFromMessage(msg),
                        hash: data.result.hash,
                        timestamp: data.result.time ? new Date(data.result.time).toLocaleString() : '',
                        status: txResult?.code === 0 ? 'Success' : 'Failed',
                        block: String(data.result.height ?? ''),
                        gasPrice: tx.auth_info?.fee?.amount?.[0]?.amount || 0,
                        memo: tx.body?.memo || '',
                        msgCount: messages.length,
                    });
                } else {
                    throw new Error('Unrecognized tx response shape');
                }
            } catch (error) {
                console.error("Failed to fetch transaction:", error);
                setError("Failed to load transaction data");
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchTransaction();
        }
    }, [id]);

    if (!id) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Transaction ID Not Provided</Typography></Grid></PageShell>;
    }
    return (
        <PageShell width={8}>
                <Grid item xs={12} md={8}>
                    {loading ? (
                        <CardSkeleton />
                    ) : error ? (
                        <Card>
                            <CardContent>
                                <Typography color="error">{error}</Typography>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                    <Typography variant='h5' sx={{ wordBreak: 'break-all' }}>Transaction Hash: <CopyableId value={txInfo.hash}>{txInfo.hash}</CopyableId></Typography>
                                    <Chip
                                        label={txInfo.status}
                                        color={txInfo.status === 'Success' ? 'success' : 'error'}
                                        size="small"
                                    />
                                </Stack>
                                <Divider />
                                <Typography sx={{ mt: 1 }} component="div">
                                    Type:{' '}
                                    <Chip
                                        label={txInfo.wasm?.label ?? decodeMessageType(txInfo.messageType)}
                                        size="small"
                                        color={txInfo.wasm ? 'primary' : 'default'}
                                        variant="outlined"
                                    />
                                    {txInfo.msgCount > 1 && (
                                        <Chip label={`+${txInfo.msgCount - 1} more msg${txInfo.msgCount > 2 ? 's' : ''}`} size="small" sx={{ ml: 1 }} variant="outlined" />
                                    )}
                                </Typography>
                                {txInfo.wasm?.detail && (
                                    <Typography color="text.secondary">{txInfo.wasm.detail}</Typography>
                                )}
                                <Typography>Block: <Link to={`/blockpage/${txInfo.block}`}>{txInfo.block}</Link></Typography>
                                <Typography>Timestamp: {txInfo.timestamp}</Typography>
                                <Typography>From: <CopyableId value={txInfo.sender}><Link to={`/wallet/${txInfo.sender}`}>{txInfo.sender}</Link></CopyableId></Typography>
                                <Typography>To: <CopyableId value={txInfo.recipient}><Link to={`/wallet/${txInfo.recipient}`}>{txInfo.recipient}</Link></CopyableId></Typography>
                                <Typography>Value: {formatAmount(txInfo.value, txInfo.denom)} {formatDenom(txInfo.denom)}</Typography>
                                <Typography>Gas Price: {txInfo.gasPrice}</Typography>
                                {txInfo.memo && <Typography>Memo: {txInfo.memo}</Typography>}
                            </CardContent>
                        </Card>
                    )}
                </Grid>
                <Grid item xs={12} md={8}>
                    <RecentTransactionsTable />
                </Grid>
        </PageShell>
    )
}
export default TransactionPage;
