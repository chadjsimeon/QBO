import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  useListCustomers,
  useCreateCustomer,
  getUpdateCustomerMutationOptions,
  getDeleteCustomerMutationOptions,
  getListCustomersQueryKey,
  type Customer,
  type CustomerInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";

function CustomerForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Customer>;
  onSave: (data: CustomerInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [addr, setAddr] = useState(initial?.billingAddress ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, email, phone, billingAddress: addr });
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        <Label>Name *</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Billing address</Label>
        <Input value={addr} onChange={(e) => setAddr(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{initial?.id ? "Save changes" : "Create customer"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Customer }>({ open: false });

  const { data: customers = [] } = useListCustomers();

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    setDialog({ open: false });
  };

  const create = useCreateCustomer({ mutation: { onSuccess: onSaved } });
  const update = useMutation(
    getUpdateCustomerMutationOptions({ mutation: { onSuccess: onSaved } }),
  );
  const remove = useMutation(
    getDeleteCustomerMutationOptions({
      mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListCustomersQueryKey() }) },
    }),
  );

  function onSave(data: CustomerInput) {
    if (dialog.editing) update.mutate({ id: dialog.editing.id, data });
    else create.mutate({ data });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">People and companies you invoice.</p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="h-4 w-4 mr-1" /> New customer
        </Button>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add your first customer to start invoicing."
          action={
            <Button onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" />
              New customer
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
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, editing: c })}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm("Delete customer?") && remove.mutate({ id: c.id })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Edit customer" : "New customer"}</DialogTitle>
          </DialogHeader>
          <CustomerForm
            initial={dialog.editing}
            onSave={onSave}
            onClose={() => setDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
