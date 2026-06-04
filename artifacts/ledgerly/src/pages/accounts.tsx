import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Account {
  id: string; code: string; name: string; type: string; subtype: string;
  isActive: boolean; parentId: string | null; systemRole: string | null; sortOrder: number;
}

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ASSET: "default", LIABILITY: "secondary", EQUITY: "outline", INCOME: "default", EXPENSE: "secondary",
};

export default function AccountsPage() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });

  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chart of Accounts</h1>
        <p className="text-sm text-muted-foreground">Your full double-entry account structure.</p>
      </div>

      <div className="space-y-6">
        {["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].map(type => {
          const accts = grouped[type] ?? [];
          if (!accts.length) return null;
          return (
            <div key={type}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{type}</h2>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Subtype</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accts.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">{a.code}</TableCell>
                        <TableCell className="font-medium" style={{ paddingLeft: a.parentId ? "2rem" : undefined }}>
                          {a.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground capitalize text-sm">
                          {a.subtype.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          {a.systemRole && (
                            <Badge variant="outline" className="text-xs">{a.systemRole}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          );
        })}
      </div>
    </>
  );
}
