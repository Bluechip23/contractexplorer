import React from 'react';
import TablePage from '../../components/universal/TablePage';
import RecentTransactionsTable from '../../components/table-pages/RecentTransactionsTable';

const RecentTransactionsPage: React.FC = () => (
    <TablePage title="BlueChip Recent Transactions">
        <RecentTransactionsTable />
    </TablePage>
);

export default RecentTransactionsPage;
