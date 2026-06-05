import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Account {
  id: string; code: string; name: string; type: string; subtype: string;
  isActive: boolean; parentId: string | null; systemRole: string | null;
  cashFlowCategory: string; sortOrder: number;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const CASH_FLOW_CATEGORIES = ["NONE", "OPERATING", "INVESTING", "FINANCING"];

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ASSET: "default", LIABILITY: "secondary", EQUITY: "outline", INCOME: "default", EXPENSE: "secondary",
};

function AccountForm({ initial, onSave, onClose, saving }: {
  initial?: Partial<Account>;
  onSave: (data: Partial<Account>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "EXPENSE");
  const [subtype, setSubtype] = useState(initial?.subtype ?? "general");
  const [cashFlowCategory, setCashFlowCategory] = useState(initial?.cashFlowCategory ?? "NONE");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const isSystem = !!initial?.systemRole;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSave({ code, name, type, subtype, cashFlowCategory, sortOrder: Number(sortOrder) || 0, isActive });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Code *</Label>
          <Input required value={code} onChange={e => setCode(e.target.value)} placeholder="1010" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Name *</Label>
          <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Checking Account" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Type *</Label>
          <Select value={type} onChange={e => setType(e.target.value)} disabled={isSystem}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          {isSystem && <p className="text-xs text-muted-foreground">Locked for system accounts.</p>}
        </div>
        <div className="space-y-1">
          <Label>Subtype</Label>
          <Input value={subtype} onChange={e => setSubtype(e.target.value)} placeholder="bank" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Cash flow category</Label>
          <Select value={cashFlowCategory} onChange={e => setCashFlowCategory(e.target.value)}>
            {CASH_FLOW_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sort order</Label>
          <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
          <Label>Active</Label>
          <p className="text-xs text-muted-foreground">Inactive accounts are hidden from transaction pickers.</p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {isSystem && (
        <p className="text-xs text-muted-foreground">
          This is a system account wired into automatic posting (role: {initial?.systemRole}). It can be renamed but not deleted.
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : initial?.id ? "Save changes" : "Create account"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function AccountsPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Account }>({ open: false });
  const [error, setError] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });

  const create = useMutation({
    mutationFn: (data: Partial<Account>) => apiFetch("/accounts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setDialog({ open: false }); },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Account>) => apiFetch(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setDialog({ open: false }); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e: Error) => setError(e.message),
  });

  function onSave(data: Partial<Account>) {
    setError(null);
    if (dialog.editing) update.mutate({ ...data, id: dialog.editing.id });
    else create.mutate(data);
  }

  function openNew() { setError(null); setDialog({ open: true }); }
  function openEdit(a: Account) { setError(null); setDialog({ open: true, editing: a }); }

  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Your full double-entry account structure.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New account
        </Button>
      </div>

      {error && !dialog.open && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {ACCOUNT_TYPES.map(type => {
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
                      <TableHead className="text-right w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accts.map(a => (
                      <TableRow key={a.id} className={a.isActive ? undefined : "opacity-50"}>
                        <TableCell className="font-mono text-sm text-muted-foreground">{a.code}</TableCell>
                        <TableCell className="font-medium" style={{ paddingLeft: a.parentId ? "2rem" : undefined }}>
                          {a.name}
                          {!a.isActive && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground capitalize text-sm">
                          {a.subtype.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          {a.systemRole && (
                            <Badge variant="outline" className="text-xs">{a.systemRole}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!!a.systemRole}
                              title={a.systemRole ? "System accounts can't be deleted" : "Delete account"}
                              onClick={() => { setError(null); if (confirm(`Delete account "${a.name}"?`)) remove.mutate(a.id); }}
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
            </div>
          );
        })}
      </div>

      <Dialog open={dialog.open} onOpenChange={o => { if (!o) setError(null); setDialog({ open: o }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Edit account" : "New account"}</DialogTitle>
          </DialogHeader>
          {error && dialog.open && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <AccountForm
            initial={dialog.editing}
            onSave={onSave}
            onClose={() => { setError(null); setDialog({ open: false }); }}
            saving={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
