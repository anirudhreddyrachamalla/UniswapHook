import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import TradePage from './pages/TradePage';
import PoolPage from './pages/PoolPage';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './components/utils/wagmiClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <Layout>
            <Routes>
              <Route path="/" element={<TradePage />} />
              <Route path="/trade" element={<TradePage />} />
              <Route path="/pool" element={<PoolPage />} />
            </Routes>
          </Layout>
        </WagmiProvider>
      </QueryClientProvider>
    </Router>
  );
}

export default App;

