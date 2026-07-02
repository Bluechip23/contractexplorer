import React, { useEffect, useState } from 'react'
import { Card, CardContent, Divider, Grid, Typography } from '@mui/material';
import BlockTransactionsTable from '../../components/individual-pages/BlockTransactionsTable';
import { Link, useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import { rpcEndpoint } from '../../components/universal/IndividualPage.const';
import axios from 'axios';
import { CardSkeleton, TableSkeleton } from '../../components/universal/LoadingSkeleton';
import CopyableId from '../../components/universal/CopyableId';
import { decodeTxRaw } from '@cosmjs/proto-signing';
import { decodeMessageType } from '../../utils/txDecoder';

// Tendermint `/block` returns each tx as a base64-encoded protobuf TxRaw —
// NOT JSON. The tx hash is sha256(raw_bytes) hex-uppercase.
function base64ToBytes(b64: string): Uint8Array {
    const binary = window.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

interface DecodedRow {
    hash: string;
    method: string;
    sender: string;
    recipient: string;
    value: number;
    fee: number;
}

async function decodeTxToRow(txB64: string): Promise<DecodedRow> {
    const bytes = base64ToBytes(txB64);
    const hash = await sha256Hex(bytes);
    try {
        const decoded = decodeTxRaw(bytes);
        const firstMsg = decoded.body.messages[0];
        const feeCoin = decoded.authInfo.fee?.amount?.[0];
        const feeAmount = feeCoin?.amount ? Number(feeCoin.amount) : 0;
        return {
            hash,
            method: decodeMessageType(firstMsg?.typeUrl ?? ''),
            sender: '',
            recipient: '',
            value: 0,
            fee: Number.isFinite(feeAmount) ? feeAmount : 0,
        };
    } catch (err) {
        console.error('Failed to decode tx', hash, err);
        return { hash, method: 'Unknown', sender: '', recipient: '', value: 0, fee: 0 };
    }
}

const BlockPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [rows, setRows] = useState<DecodedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [blockInfo, setBlockInfo] = useState({
        height: '',
        timestamp: '',
        hash: '',
        reward: '',
        proposer: '',
        fee: '',
        transactionCount: 0
    });
    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        let cancelled = false;
        async function loadBlocks() {
            setLoading(true);
            try {
                const response = await axios.get(`${rpcEndpoint}/block?height=${id}`, {
                    signal: controller.signal,
                });
                if (cancelled) return;
                const block = response.data?.result?.block;
                if (!block) {
                    console.error('No block found.');
                    return;
                }
                const transactions: string[] = block?.data?.txs ?? [];
                setBlockInfo({
                    height: block.header?.height ?? '',
                    timestamp: block.header?.time ?? '',
                    hash: response.data?.result?.block_id?.hash ?? '',
                    reward: 'N/A',
                    proposer: block.header?.proposer_address ?? '',
                    fee: 'N/A',
                    transactionCount: transactions.length,
                });
                if (transactions.length > 0) {
                    const decodedRows = await Promise.all(transactions.map(decodeTxToRow));
                    if (!cancelled) setRows(decodedRows);
                } else if (!cancelled) {
                    setRows([]);
                }
            } catch (error) {
                if ((error as { name?: string })?.name === 'CanceledError') return;
                console.error('Error loading transactions:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadBlocks();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [id]);

    if (!id) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Block Not Found</Typography></Grid></PageShell>;
    }
    return (
        <PageShell width={8}>
                <Grid item xs={12} md={8}>
                    {loading ? (
                        <CardSkeleton />
                    ) : (
                        <Card>
                            <CardContent>
                                <Typography variant='h5'>Block Height: {blockInfo.height}</Typography>
                                <Divider />
                                <Typography>Timestamp: {blockInfo.timestamp}</Typography>
                                <Typography sx={{ wordBreak: 'break-all' }}>Block Hash: <CopyableId value={blockInfo.hash}><a href={`/blockpage/${blockInfo.height}`} style={{ color: '#1976d2' }}>{blockInfo.hash}</a></CopyableId></Typography>
                                <Typography>Block Reward: {blockInfo.reward}</Typography>
                                <Typography sx={{ wordBreak: 'break-all' }}>Block Proposer: <CopyableId value={blockInfo.proposer}><Link to={`/validator/${blockInfo.proposer}`} style={{ color: '#1976d2' }}>{blockInfo.proposer}</Link></CopyableId></Typography>
                                <Typography>Transaction Fee: {blockInfo.fee}</Typography>
                                <Typography># of Transactions: {blockInfo.transactionCount}</Typography>
                            </CardContent>
                        </Card>
                    )}
                </Grid>
                <Grid item xs={12} md={8}>
                    {loading ? <TableSkeleton /> : <BlockTransactionsTable rows={rows} />}
                </Grid>
        </PageShell>
    )
}
export default BlockPage;