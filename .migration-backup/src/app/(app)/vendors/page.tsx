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
import { deleteVendor } from "./actions";

export default async function VendorsPage() {
  const ctx = await requireOrg();
  const vendors = await prisma.vendor.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Suppliers and companies you pay."
        action={
          <Button asChild>
            <Link href="/vendors/new">
              <Plus className="h-4 w-4" /> New vendor
            </Link>
          </Button>
        }
      />

      {vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          description="Add your first vendor to start entering bills."
          action={
            <Button asChild>
              <Link href="/vendors/new">
                <Plus className="h-4 w-4" /> New vendor
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
              {vendors.map((v) => {
                const del = deleteVendor.bind(null, v.id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-muted-foreground">{v.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.phone ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link href={`/vendors/${v.id}/edit`}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </Button>
                        <DeleteButton action={del} label="Delete vendor" />
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
