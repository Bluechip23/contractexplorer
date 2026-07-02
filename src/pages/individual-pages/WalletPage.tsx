import React, { useEffect, useState } from 'react'
import { Card, CardContent, Divider, Grid, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import WalletsHoldingsTable from '../../components/individual-pages/WalletHoldingsTable';
import WalletTransactionsTable from '../../components/individual-pages/WalletTransactionsTable';
import { apiEndpoint, rpcEndpoint } from '../../components/universal/IndividualPage.const';
import axios from 'axios';
import { CardSkeleton, TableSkeleton } from '../../components/universal/LoadingSkeleton';
import { formatAmount } from '../../utils/txDecoder';
import CopyableId from '../../components/universal/CopyableId';
import WalletCommitHistory from '../../components/individual-pages/WalletCommitHistory';


const Wallet: React.FC = () => {

    const {id} = useParams<{ id: string }>();
    const [wallet, setWallet] = useState({
        address: '',
        balance: '',
    });
    const [balances, setBalances] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();

        const fetchSpecificWallet = async () => {
            setLoading(true);
            try {
                const [accountResponse, balanceResponse, transactionsResponse] = await Promise.all([
                    axios.get(`${apiEndpoint}/bluechip/auth/v1beta1/accounts/${id}`, { signal: controller.signal }),
                    axios.get(`${apiEndpoint}/bluechip/bank/v1beta1/balances/${id}`, { signal: controller.signal }),
                    axios.get(`${apiEndpoint}/bluechip/transactions/${id}`, { signal: controller.signal }),
                ]);

                if (controller.signal.aborted) return;

                const balancesData = balanceResponse.data.balances;
                const primaryBalance = balancesData[0]?.amount || '0';
                setWallet({ address: id, balance: primaryBalance });
                setBalances(balancesData || []);
                setTransactions(transactionsResponse.data.transactions || []);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Error fetching wallet data:', error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchSpecificWallet();
        return () => controller.abort();
    }, [id]);

    if (!id) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Wallet Not Found</Typography></Grid></PageShell>;
    }
    return (
        <PageShell width={8}>
                <Grid item xs={12} md={4}>
                    {loading ? (
                        <CardSkeleton />
                    ) : (
                        <Card>
                            <CardContent>
                                <Typography variant='h5' sx={{ wordBreak: 'break-all' }}>Wallet: <CopyableId value={wallet.address}>{wallet.address.toString()}</CopyableId></Typography>
                                <Divider />
                                <Typography>Balance: {formatAmount(wallet.balance, 'ubluechip')} bluechip</Typography>
                            </CardContent>
                        </Card>
                    )}
                </Grid>
                <Grid item xs={12} md={8}>
                    {loading ? <TableSkeleton /> : <WalletsHoldingsTable walletHoldings={balances} />}
                </Grid>
                <Grid item xs={12} md={8}>
                    {loading ? <TableSkeleton /> : <WalletTransactionsTable walletTx={transactions} />}
                </Grid>
                <Grid item xs={12} md={8}>
                    <WalletCommitHistory wallet={id} />
                </Grid>
        </PageShell>
    )
}
export default Wallet;