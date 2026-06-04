import { prisma, requireOrg } from "@/lib/tenant";
import {
  buildAccountTree,
  flattenTree,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/accounts";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountType } from "@prisma/client";

export default async function AccountsPage() {
  const ctx = await requireOrg();
  const accounts = await prisma.account.findMany({
    where: { organizationId: ctx.organizationId },
  });

  const tree = buildAccountTree(accounts);
  const byType = (type: AccountType) =>
    flattenTree(tree.filter((n) => n.type === type));

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description="Your ledger's accounts, nested with subtotals. Key accounts are tagged by role."
      />

      <div className="space-y-6">
        {TYPE_ORDER.map((type) => {
          const rows = byType(type);
          if (rows.length === 0) return null;
          return (
            <Card key={type}>
              <div className="border-b px-4 py-3 text-sm font-semibold">
                {TYPE_LABELS[type]}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Subtype</TableHead>
                    <TableHead className="text-right">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.code}
                      </TableCell>
                      <TableCell>
                        <span style={{ paddingLeft: a.depth * 20 }}>
                          {a.children.length > 0 ? (
                            <span className="font-semibold">{a.name}</span>
                          ) : (
                            a.name
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.subtype}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.systemRole ? (
                          <Badge variant="secondary">{a.systemRole}</Badge>
                        ) : (
                          ""
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
