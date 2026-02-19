import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Forecast = lazy(() => import("@/pages/Forecast"));
const Simulate = lazy(() => import("@/pages/Simulate"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Actions = lazy(() => import("@/pages/Actions"));
const Settings = lazy(() => import("@/pages/Settings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <Suspense fallback={<PageLoader />}>
                  <Dashboard />
                </Suspense>
              }
            />
            <Route
              path="forecast"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Forecast />
                </Suspense>
              }
            />
            <Route
              path="simulate"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Simulate />
                </Suspense>
              }
            />
            <Route
              path="analytics"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Analytics />
                </Suspense>
              }
            />
            <Route
              path="actions"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Actions />
                </Suspense>
              }
            />
            <Route
              path="settings"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Settings />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
