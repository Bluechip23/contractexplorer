import React from 'react';
import TablePage from '../../components/universal/TablePage';
import BlueChipTokenTransactionsTable from '../../components/table-pages/BluechipTokenTransactionsTable';

const RecentBlueChipTransactionsPage: React.FC = () => (
    <TablePage title="Recent blue chip Transactions">
        <BlueChipTokenTransactionsTable />
    </TablePage>
);

export default RecentBlueChipTransactionsPage;
