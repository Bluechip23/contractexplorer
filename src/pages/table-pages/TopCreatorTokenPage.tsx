import React from 'react';
import TablePage from '../../components/universal/TablePage';
import CreatorTokenTable from '../../components/table-pages/CreatorTokenTable';

const TopCreatorTokenPage: React.FC = () => (
    <TablePage title="BlueChip Creator Tokens">
        <CreatorTokenTable />
    </TablePage>
);

export default TopCreatorTokenPage;
