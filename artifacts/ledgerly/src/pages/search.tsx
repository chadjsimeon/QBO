import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SearchResults {
  customers: Array<{ id: string; name: string; email: string | null }>;
  vendors: Array<{ id: string; name: string; email: string | null }>;
  invoices: Array<{
    id: string;
    number: string;
    customerName: string | null;
    totalCents: number;
    status: string;
  }>;
  bills: Array<{
    id: string;
    number: string;
    vendorName: string | null;
    totalCents: number;
    status: string;
  }>;
}

export default function SearchPage() {
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => apiFetch<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });

  const hasResults =
    data &&
    data.customers.length + data.vendors.length + data.invoices.length + data.bills.length > 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Search</h1>
      </div>
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-10"
          placeholder="Search customers, vendors, invoices, bills…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {q.length >= 2 && !hasResults && (
        <p className="text-sm text-muted-foreground text-center py-8">No results found for "{q}"</p>
      )}

      {hasResults && (
        <div className="space-y-4">
          {data!.customers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Customers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {data!.customers.map((c) => (
                  <Link key={c.id} href="/customers">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="font-medium text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data!.vendors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Vendors</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {data!.vendors.map((v) => (
                  <Link key={v.id} href="/vendors">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="font-medium text-sm">{v.name}</span>
                      <span className="text-xs text-muted-foreground">{v.email}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data!.invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Invoices</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {data!.invoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="font-medium text-sm">
                        {inv.number} · {inv.customerName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {inv.status}
                        </Badge>
                        <span className="text-sm tabular-nums">{formatCents(inv.totalCents)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data!.bills.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bills</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {data!.bills.map((bill) => (
                  <Link key={bill.id} href="/bills">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="font-medium text-sm">
                        {bill.number} · {bill.vendorName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {bill.status}
                        </Badge>
                        <span className="text-sm tabular-nums">{formatCents(bill.totalCents)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
