import { lazy, Suspense } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import { ThemeContextProvider } from './context/ThemeContext';
import { WalletContextProvider } from './context/WalletContext';
import { CircularProgress, Box } from '@mui/material';

const TopCreatorTokensPage = lazy(() => import('./pages/table-pages/TopCreatorTokenPage'));
const CreatorTokenPage = lazy(() => import('./pages/individual-pages/CreatorTokenPage'));
const FrontPage = lazy(() => import('./pages/FrontPage'));
const TopCreatorPoolPage = lazy(() => import('./pages/table-pages/TopCreatorPoolPage'));
const CreatorPoolPage = lazy(() => import('./pages/individual-pages/CreatorPoolPage'));
const ComingSoonPage = lazy(() => import('./components/universal/ComingSoonPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const IntegrationGuidePage = lazy(() => import('./pages/IntegrationGuidePage'));
const DefiPage = lazy(() => import('./defi/DefiPage'));
const HoldingsPortfolioPage = lazy(() => import('./pages/ChainPortfolioPage'));
const CreatorPortfolioPage = lazy(() => import('./pages/CreatorPortfolioPage'));
const CreatorLinksPage = lazy(() => import('./pages/CreatorLinksPage'));
const ManageLinksPage = lazy(() => import('./pages/ManageLinksPage'));
const FindCreatorsPage = lazy(() => import('./pages/FindCreatorsPage'));

const PageLoader = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
    </Box>
);

function App() {
    return (
        <ThemeContextProvider>
            <WalletContextProvider>
            <Router>
                <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route
                        path="/"
                        element={<Navigate replace to="/frontpage" />}
                    />
                    <Route path="/frontpage" element={<FrontPage />} />
                    <Route path="/toptokens" element={<TopCreatorTokensPage />} />
                    <Route path="/topcreatorpools" element={<TopCreatorPoolPage />} />
                    <Route path="/creatorpool/:id" element={<CreatorPoolPage />} />
                    <Route path="/creatortoken/:id" element={<CreatorTokenPage />} />
                    <Route path="/comingsoonpage" element={<ComingSoonPage />} />
                    <Route path="/integration-guide" element={<IntegrationGuidePage />} />
                    <Route path="/defi" element={<DefiPage />} />
                    <Route path="/portfolio/holdings" element={<HoldingsPortfolioPage />} />
                    {/* Legacy route kept so old bookmarks keep working. */}
                    <Route path="/portfolio/chain" element={<Navigate replace to="/portfolio/holdings" />} />
                    <Route path="/portfolio/creator" element={<CreatorPortfolioPage />} />
                    {/* Creator link-in-bio pages: public page + wallet-gated manager. */}
                    <Route path="/creator/:idOrName" element={<CreatorLinksPage />} />
                    <Route path="/creators" element={<FindCreatorsPage />} />
                    <Route path="/mylinks" element={<ManageLinksPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
                </Suspense>
            </Router>
            </WalletContextProvider>
        </ThemeContextProvider>
    );
}

export default App;
