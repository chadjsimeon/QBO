import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { deleteCustomer } from "./actions";

export default async function CustomersPage() {
  const ctx = await requireOrg();
  const customers = await prisma.customer.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description="People and companies you invoice."
        action={
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="h-4 w-4" /> New customer
            </Link>
          </Button>
        }
      />

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add your first customer to start invoicing."
          action={
            <Button asChild>
              <Link href="/customers/new">
                <Plus className="h-4 w-4" /> New customer
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const del = deleteCustomer.bind(null, c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link href={`/customers/${c.id}/edit`}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </Button>
                        <DeleteButton action={del} label="Delete customer" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
