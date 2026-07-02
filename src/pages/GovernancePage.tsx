import React, { useEffect, useState } from 'react';
import PageShell from '../components/universal/PageShell';
import {
    Card,
    CardContent,
    Chip,
    Grid,
    Stack,
    Typography,
    LinearProgress,
    Box,
} from '@mui/material';
import { apiEndpoint } from '../components/universal/IndividualPage.const';
import axios from 'axios';
import { CardSkeleton } from '../components/universal/LoadingSkeleton';
import { safeBigInt } from '../utils/bigintMath';

interface Proposal {
    proposal_id: string;
    content: {
        '@type': string;
        title: string;
        description: string;
    };
    status: string;
    final_tally_result: {
        yes: string;
        abstain: string;
        no: string;
        no_with_veto: string;
    };
    submit_time: string;
    voting_end_time: string;
}

const statusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
        case 'PROPOSAL_STATUS_PASSED':
            return 'success';
        case 'PROPOSAL_STATUS_REJECTED':
            return 'error';
        case 'PROPOSAL_STATUS_VOTING_PERIOD':
            return 'warning';
        case 'PROPOSAL_STATUS_DEPOSIT_PERIOD':
            return 'info';
        default:
            return 'default';
    }
};

const statusLabel = (status: string): string => {
    return status
        .replace('PROPOSAL_STATUS_', '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

const GovernancePage: React.FC = () => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProposals = async () => {
            try {
                const response = await axios.get(
                    `${apiEndpoint}/cosmos/gov/v1beta1/proposals`
                );
                setProposals(response.data.proposals || []);
            } catch (error) {
                console.error('Error fetching proposals:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchProposals();
    }, []);

    const getTallyTotal = (tally: Proposal['final_tally_result']): bigint => {
        return (
            safeBigInt(tally.yes) +
            safeBigInt(tally.no) +
            safeBigInt(tally.abstain) +
            safeBigInt(tally.no_with_veto)
        );
    };

    const tallyPct = (numerator: string, total: bigint): number => {
        if (total === 0n) return 0;
        // Scale by 10000 to preserve 2 decimals of percentage precision
        // before converting to Number (avoids bigint → Number truncation).
        return Number((safeBigInt(numerator) * 10000n) / total) / 100;
    };

    return (
        <PageShell>
                <Grid item xs={10}>
                    <Typography variant="h4" sx={{ mb: 2 }}>
                        Governance Proposals
                    </Typography>
                    {loading ? (
                        <Stack spacing={2}>
                            <CardSkeleton />
                            <CardSkeleton />
                            <CardSkeleton />
                        </Stack>
                    ) : proposals.length === 0 ? (
                        <Card>
                            <CardContent>
                                <Typography color="text.secondary">
                                    No governance proposals found.
                                </Typography>
                            </CardContent>
                        </Card>
                    ) : (
                        <Stack spacing={2}>
                            {proposals.map((proposal) => {
                                const total = getTallyTotal(proposal.final_tally_result);
                                const yesPercent = tallyPct(proposal.final_tally_result.yes, total);
                                const noPercent = tallyPct(proposal.final_tally_result.no, total);

                                return (
                                    <Card key={proposal.proposal_id}>
                                        <CardContent>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="h6">
                                                    #{proposal.proposal_id} - {proposal.content?.title || 'Untitled'}
                                                </Typography>
                                                <Chip
                                                    label={statusLabel(proposal.status)}
                                                    color={statusColor(proposal.status)}
                                                    size="small"
                                                />
                                            </Stack>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{ mt: 1, mb: 2, maxHeight: 60, overflow: 'hidden' }}
                                            >
                                                {proposal.content?.description || 'No description'}
                                            </Typography>
                                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                                                Voting: Yes {yesPercent.toFixed(1)}% / No {noPercent.toFixed(1)}%
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 0.5, height: 8, borderRadius: 1, overflow: 'hidden' }}>
                                                <Box sx={{ width: `${yesPercent}%`, bgcolor: '#4caf50', minWidth: yesPercent > 0 ? 2 : 0 }} />
                                                <Box sx={{ width: `${noPercent}%`, bgcolor: '#f44336', minWidth: noPercent > 0 ? 2 : 0 }} />
                                                <Box sx={{ flexGrow: 1, bgcolor: '#e0e0e0' }} />
                                            </Box>
                                            <Stack direction="row" spacing={4} sx={{ mt: 1 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Submitted: {new Date(proposal.submit_time).toLocaleDateString()}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Voting Ends: {new Date(proposal.voting_end_time).toLocaleDateString()}
                                                </Typography>
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Stack>
                    )}
                </Grid>
        </PageShell>
    );
};

export default GovernancePage;
