import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  useListVendors,
  useCreateVendor,
  getUpdateVendorMutationOptions,
  getDeleteVendorMutationOptions,
  getListVendorsQueryKey,
  type Vendor,
  type VendorInput,
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

function VendorForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Vendor>;
  onSave: (data: VendorInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [addr, setAddr] = useState(initial?.address ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, email, phone, address: addr });
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
        <Label>Address</Label>
        <Input value={addr} onChange={(e) => setAddr(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{initial?.id ? "Save changes" : "Create vendor"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function VendorsPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Vendor }>({ open: false });

  const { data: vendors = [] } = useListVendors();

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: getListVendorsQueryKey() });
    setDialog({ open: false });
  };

  const create = useCreateVendor({ mutation: { onSuccess: onSaved } });
  const update = useMutation(getUpdateVendorMutationOptions({ mutation: { onSuccess: onSaved } }));
  const remove = useMutation(
    getDeleteVendorMutationOptions({
      mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListVendorsQueryKey() }) },
    }),
  );

  function onSave(data: VendorInput) {
    if (dialog.editing) update.mutate({ id: dialog.editing.id, data });
    else create.mutate({ data });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Companies and individuals you pay bills to.
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="h-4 w-4 mr-1" /> New vendor
        </Button>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          description="Add a vendor to start tracking bills."
          action={
            <Button onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" />
              New vendor
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
              {vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-muted-foreground">{v.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, editing: v })}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm("Delete vendor?") && remove.mutate({ id: v.id })}
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
            <DialogTitle>{dialog.editing ? "Edit vendor" : "New vendor"}</DialogTitle>
          </DialogHeader>
          <VendorForm
            initial={dialog.editing}
            onSave={onSave}
            onClose={() => setDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
