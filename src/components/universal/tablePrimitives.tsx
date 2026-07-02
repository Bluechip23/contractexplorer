import React, { useState } from 'react';
import { Chip, ChipProps, CircularProgress, Paper, Typography } from '@mui/material';

// Shared building blocks for the explorer's data tables. Every table used
// to hand-roll the same pagination state, loading/error/empty paper, and
// pool status chip; these primitives keep the behavior identical in one
// place (rows-per-page options, slice math, sticky-header shells).

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 100];

/**
 * Client-side pagination state for a MUI TablePagination-driven table.
 * `paginate` slices the current page out of the full row list, and
 * `paginationProps(count)` spreads straight onto `<TablePagination>`.
 */
export function usePagination(initialRowsPerPage = 10) {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

    function paginate<T>(rows: readonly T[]): T[] {
        return rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    }

    const paginationProps = (count: number) => ({
        rowsPerPageOptions: ROWS_PER_PAGE_OPTIONS,
        component: 'div' as const,
        count,
        rowsPerPage,
        page,
        onPageChange: (_: unknown, newPage: number) => setPage(newPage),
        onRowsPerPageChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setRowsPerPage(+e.target.value);
            setPage(0);
        },
    });

    return { page, rowsPerPage, setPage, setRowsPerPage, paginate, paginationProps };
}

/** Consistent full-width paper for a table's loading / error / empty states. */
export const TableStatePaper: React.FC<{
    kind: 'loading' | 'error' | 'empty';
    message: string;
}> = ({ kind, message }) => (
    <Paper sx={{ width: '100%', p: kind === 'loading' ? 4 : 3, textAlign: kind === 'loading' ? 'center' : 'left' }}>
        {kind === 'loading' && <CircularProgress size={28} />}
        <Typography
            variant="body2"
            color={kind === 'error' ? 'error' : 'text.secondary'}
            sx={kind === 'loading' ? { mt: 1 } : undefined}
        >
            {message}
        </Typography>
    </Paper>
);

/** The Active / Pre-threshold state chip shown wherever a pool appears. */
export const PoolStatusChip: React.FC<{
    thresholdReached: boolean;
    variant?: ChipProps['variant'];
    sx?: ChipProps['sx'];
}> = ({ thresholdReached, variant = 'outlined', sx }) => (
    <Chip
        label={thresholdReached ? 'Active' : 'Pre-threshold'}
        color={thresholdReached ? 'success' : 'warning'}
        size="small"
        variant={variant}
        sx={sx}
    />
);
