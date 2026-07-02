import React from 'react';
import TablePage from '../../components/universal/TablePage';
import TopWalletsTable from '../../components/table-pages/TopWalletsTable';

const TopWalletsPage: React.FC = () => (
    <TablePage title="Top blue chip Holders">
        <TopWalletsTable />
    </TablePage>
);

export default TopWalletsPage;
