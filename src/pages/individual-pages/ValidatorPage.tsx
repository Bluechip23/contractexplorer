import React, { useEffect, useState } from 'react'
import { Avatar, Card, CardContent, CardHeader, Grid, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import PageShell from '../../components/universal/PageShell';
import ValidatorTable from '../../components/table-pages/ValidatorTable';
import { apiEndpoint } from '../../components/universal/IndividualPage.const';
import CopyableId from '../../components/universal/CopyableId';

interface ValidatorData {
    id: string;
    address: string;
    rank: number;
    commission: number;
    maxCommission: number;
}

const Validator: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [validator, setValidator] = useState<ValidatorData | null>(null);

    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        const fetchValidator = async () => {
            try {
                const response = await fetch(
                    `${apiEndpoint}/cosmos/staking/v1beta1/validators/${encodeURIComponent(id)}`,
                    { signal: controller.signal },
                );
                const data = await response.json();
                const queriedValidator = data?.validator ?? null;
                setValidator(queriedValidator);
            } catch (error) {
                if ((error as { name?: string })?.name === 'AbortError') return;
                console.error("Failed to fetch validator:", error);
            }
        };
        fetchValidator();
        return () => controller.abort();
    }, [id]);

    if (!id) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Validator Not Found</Typography></Grid></PageShell>;
    }
    if (!validator) {
        return <PageShell width={8} showStats={false}><Grid item xs={12} md={8}><Typography>Validator Not Found</Typography></Grid></PageShell>;
    }
    return (
        <PageShell width={8}>
                <Grid item xs={12} md={8}>
                    <Card>
                        <CardHeader
                            avatar={
                                <Avatar aria-label="recipe" sx={{ height: '75px', width: '75px' }}>
                                    {validator.id.charAt(0).toUpperCase()}
                                </Avatar>
                            }
                            title={`Validator ${validator.id}`}

                        />
                        <Stack direction='row' spacing={8}>
                            <Typography variant='h5'>Validator Address: <CopyableId value={validator.id}>{validator.id}</CopyableId></Typography>
                            <Typography>Wallet Address: <CopyableId value={validator.address}>{validator.address}</CopyableId></Typography>
                        </Stack>
                        <CardContent>
                            <Typography>Rank: {validator.rank}</Typography>
                            <Typography>Commission: {validator.commission} </Typography>
                            <Typography>Max Commission: {validator.maxCommission}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={8}>
                    <ValidatorTable />
                </Grid>
        </PageShell>
    )
}
export default Validator;