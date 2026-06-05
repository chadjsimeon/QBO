import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/app-layout";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
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
import BankImportPage from "@/pages/bank-import";
import JournalEntriesPage from "@/pages/journal-entries";
import JournalEntryFormPage from "@/pages/journal-entry-form";
import JournalEntryDetailPage from "@/pages/journal-entry-detail";
import TransferFormPage from "@/pages/transfer-form";
import ExpensesPage from "@/pages/expenses";
import ExpenseFormPage from "@/pages/expense-form";
import ExpenseDetailPage from "@/pages/expense-detail";
import SalesReceiptsPage from "@/pages/sales-receipts";
import SalesReceiptFormPage from "@/pages/sales-receipt-form";
import SalesReceiptDetailPage from "@/pages/sales-receipt-detail";
import CreditNotesPage from "@/pages/credit-notes";
import CreditNoteFormPage from "@/pages/credit-note-form";
import CreditNoteDetailPage from "@/pages/credit-note-detail";
import VendorCreditsPage from "@/pages/vendor-credits";
import VendorCreditFormPage from "@/pages/vendor-credit-form";
import VendorCreditDetailPage from "@/pages/vendor-credit-detail";
import EstimatesPage from "@/pages/estimates";
import EstimateFormPage from "@/pages/estimate-form";
import EstimateDetailPage from "@/pages/estimate-detail";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import PoFormPage from "@/pages/po-form";
import PoDetailPage from "@/pages/po-detail";
import StatementPage from "@/pages/statement";
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
      <Route path="/signup" component={SignupPage} />
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
      <Route path="/banking/import">
        <AuthGuard><BankImportPage /></AuthGuard>
      </Route>
      <Route path="/banking">
        <AuthGuard><BankingPage /></AuthGuard>
      </Route>
      <Route path="/journal-entries/new">
        <AuthGuard><JournalEntryFormPage /></AuthGuard>
      </Route>
      <Route path="/journal-entries/:id">
        <AuthGuard><JournalEntryDetailPage /></AuthGuard>
      </Route>
      <Route path="/journal-entries">
        <AuthGuard><JournalEntriesPage /></AuthGuard>
      </Route>
      <Route path="/transfers/new">
        <AuthGuard><TransferFormPage /></AuthGuard>
      </Route>
      <Route path="/expenses/new">
        <AuthGuard><ExpenseFormPage /></AuthGuard>
      </Route>
      <Route path="/expenses/:id">
        <AuthGuard><ExpenseDetailPage /></AuthGuard>
      </Route>
      <Route path="/expenses">
        <AuthGuard><ExpensesPage /></AuthGuard>
      </Route>
      <Route path="/sales-receipts/new">
        <AuthGuard><SalesReceiptFormPage /></AuthGuard>
      </Route>
      <Route path="/sales-receipts/:id">
        <AuthGuard><SalesReceiptDetailPage /></AuthGuard>
      </Route>
      <Route path="/sales-receipts">
        <AuthGuard><SalesReceiptsPage /></AuthGuard>
      </Route>
      <Route path="/credit-notes/new">
        <AuthGuard><CreditNoteFormPage /></AuthGuard>
      </Route>
      <Route path="/credit-notes/:id">
        <AuthGuard><CreditNoteDetailPage /></AuthGuard>
      </Route>
      <Route path="/credit-notes">
        <AuthGuard><CreditNotesPage /></AuthGuard>
      </Route>
      <Route path="/vendor-credits/new">
        <AuthGuard><VendorCreditFormPage /></AuthGuard>
      </Route>
      <Route path="/vendor-credits/:id">
        <AuthGuard><VendorCreditDetailPage /></AuthGuard>
      </Route>
      <Route path="/vendor-credits">
        <AuthGuard><VendorCreditsPage /></AuthGuard>
      </Route>
      <Route path="/estimates/new">
        <AuthGuard><EstimateFormPage /></AuthGuard>
      </Route>
      <Route path="/estimates/:id">
        <AuthGuard><EstimateDetailPage /></AuthGuard>
      </Route>
      <Route path="/estimates">
        <AuthGuard><EstimatesPage /></AuthGuard>
      </Route>
      <Route path="/purchase-orders/new">
        <AuthGuard><PoFormPage /></AuthGuard>
      </Route>
      <Route path="/purchase-orders/:id">
        <AuthGuard><PoDetailPage /></AuthGuard>
      </Route>
      <Route path="/purchase-orders">
        <AuthGuard><PurchaseOrdersPage /></AuthGuard>
      </Route>
      <Route path="/statements">
        <AuthGuard><StatementPage /></AuthGuard>
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
