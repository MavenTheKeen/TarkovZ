import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

// Data changes with game patches, not minute to minute: fetch on launch,
// keep it for an hour, and don't refetch just because the window regained focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
