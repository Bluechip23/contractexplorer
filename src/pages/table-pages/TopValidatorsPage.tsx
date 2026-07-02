import React from 'react';
import TablePage from '../../components/universal/TablePage';
import ValidatorTable from '../../components/table-pages/ValidatorTable';

const TopValidatorsPage: React.FC = () => (
    <TablePage title="BlueChip Top Validators">
        <ValidatorTable />
    </TablePage>
);

export default TopValidatorsPage;
