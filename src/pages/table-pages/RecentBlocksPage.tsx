import React from 'react';
import TablePage from '../../components/universal/TablePage';
import RecentBlocksTable from '../../components/table-pages/RecentBlocksTable';

const RecentBlocksPage: React.FC = () => (
    <TablePage title="BlueChip Recent Blocks">
        <RecentBlocksTable />
    </TablePage>
);

export default RecentBlocksPage;
