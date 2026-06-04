import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/app-layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CustomersPage from "@/pages/customers";
import VendorsPage from "@/pages/vendors";
import AccountsPage from "@/pages/accounts";
import InvoicesPage from "@/pages/invoices";
import InvoiceDetailPage from "@/pages/invoice-detail";
import InvoiceFormPage from "@/pages/invoice-form";
import BillsPage from "@/pages/bills";
import BillDetailPage from "@/pages/bill-detail";
import BillFormPage from "@/pages/bill-form";
import PaymentsPage from "@/pages/payments";
import PaymentFormPage from "@/pages/payment-form";
import BankingPage from "@/pages/banking";
import ReportsPage from "@/pages/reports";
import ManagementReportsPage from "@/pages/management-reports";
import SearchPage from "@/pages/search";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
      <Route path="/dashboard">
        <AuthGuard><DashboardPage /></AuthGuard>
      </Route>
      <Route path="/customers">
        <AuthGuard><CustomersPage /></AuthGuard>
      </Route>
      <Route path="/vendors">
        <AuthGuard><VendorsPage /></AuthGuard>
      </Route>
      <Route path="/accounts">
        <AuthGuard><AccountsPage /></AuthGuard>
      </Route>
      <Route path="/invoices/new">
        <AuthGuard><InvoiceFormPage /></AuthGuard>
      </Route>
      <Route path="/invoices/:id/edit">
        <AuthGuard><InvoiceFormPage /></AuthGuard>
      </Route>
      <Route path="/invoices/:id">
        <AuthGuard><InvoiceDetailPage /></AuthGuard>
      </Route>
      <Route path="/invoices">
        <AuthGuard><InvoicesPage /></AuthGuard>
      </Route>
      <Route path="/bills/new">
        <AuthGuard><BillFormPage /></AuthGuard>
      </Route>
      <Route path="/bills/:id/edit">
        <AuthGuard><BillFormPage /></AuthGuard>
      </Route>
      <Route path="/bills/:id">
        <AuthGuard><BillDetailPage /></AuthGuard>
      </Route>
      <Route path="/bills">
        <AuthGuard><BillsPage /></AuthGuard>
      </Route>
      <Route path="/payments/new">
        <AuthGuard><PaymentFormPage /></AuthGuard>
      </Route>
      <Route path="/payments">
        <AuthGuard><PaymentsPage /></AuthGuard>
      </Route>
      <Route path="/banking">
        <AuthGuard><BankingPage /></AuthGuard>
      </Route>
      <Route path="/reports">
        <AuthGuard><ReportsPage /></AuthGuard>
      </Route>
      <Route path="/management-reports">
        <AuthGuard><ManagementReportsPage /></AuthGuard>
      </Route>
      <Route path="/search">
        <AuthGuard><SearchPage /></AuthGuard>
      </Route>
      <Route>
        <AuthGuard><DashboardPage /></AuthGuard>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
