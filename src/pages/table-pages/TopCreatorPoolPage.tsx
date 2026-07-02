import React from 'react';
import TablePage from '../../components/universal/TablePage';
import CreatorPoolTable from '../../components/table-pages/CreatorPoolTable';

const TopCreatorPoolPage: React.FC = () => (
    <TablePage title="BlueChip Creator Pools">
        <CreatorPoolTable />
    </TablePage>
);

export default TopCreatorPoolPage;
