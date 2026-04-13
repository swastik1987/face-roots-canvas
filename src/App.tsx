import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, AuthRequiredRoute } from "@/components/ProtectedRoute";
import { SentryErrorBoundary, isSentryEnabled } from "@/lib/sentry";
import AppShell from "@/components/layout/AppShell";
import Splash from "@/pages/Splash";
import Auth from "@/pages/Auth";
import Consent from "@/pages/Consent";
import Home from "@/pages/Home";
import Capture from "@/pages/Capture";
import FamilyAdd from "@/pages/FamilyAdd";
import AnalysisProgress from "@/pages/AnalysisProgress";
import Results from "@/pages/Results";
import SharePage from "@/pages/Share";
import Settings from "@/pages/Settings";
import SettingsPrivacy from "@/pages/SettingsPrivacy";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

const errorFallback = (
  <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
    <p className="text-lg font-semibold">Something went wrong</p>
    <p className="text-sm text-muted-foreground">
      Please refresh the page. If the problem persists, contact support.
    </p>
    <button
      className="btn-gradient px-6 py-2.5 text-sm"
      onClick={() => window.location.reload()}
    >
      Refresh
    </button>
  </div>
);

const AppRoutes = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              {/* Public routes */}
              <Route path="/" element={<Splash />} />
              <Route path="/auth" element={<Auth />} />

              {/* Auth required, consent not yet required */}
              <Route element={<AuthRequiredRoute />}>
                <Route path="/consent" element={<Consent />} />
              </Route>

              {/* Fully protected routes: requires auth + consent */}
              <Route element={<ProtectedRoute />}>
                <Route path="/home" element={<Home />} />
                <Route path="/capture" element={<Capture />} />
                <Route path="/family/add" element={<FamilyAdd />} />
                <Route path="/analysis/:id" element={<AnalysisProgress />} />
                <Route path="/results/:id" element={<Results />} />
                <Route path="/results/:id/share" element={<SharePage />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/privacy" element={<SettingsPrivacy />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

const App = () =>
  isSentryEnabled ? (
    <SentryErrorBoundary fallback={errorFallback}>
      <AppRoutes />
    </SentryErrorBoundary>
  ) : (
    <AppRoutes />
  );

export default App;
