import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { KeyGate } from '@/components/KeyGate';
import { Layout } from '@/components/Layout';
import { Journal } from '@/routes/Journal';
import { Library } from '@/routes/Library';
import { NewTechnique } from '@/routes/NewTechnique';
import { Record } from '@/routes/Record';
import { Sequences } from '@/routes/Sequences';
import { SessionDetail } from '@/routes/SessionDetail';
import { Settings } from '@/routes/Settings';
import { TechniqueDetail } from '@/routes/TechniqueDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Come back to the tab and see fresh data — the app is edited from both
      // a phone and a desktop, so a stale cache is easy to hit.
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <KeyGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Record />} />
              <Route path="journal" element={<Journal />} />
              <Route path="journal/:id" element={<SessionDetail />} />
              <Route path="library" element={<Library />} />
              {/* Static segment before the dynamic one so /library/new can
                  never be read as a technique id. */}
              <Route path="library/new" element={<NewTechnique />} />
              <Route path="library/:id" element={<TechniqueDetail />} />
              <Route path="sequences" element={<Sequences />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </KeyGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
