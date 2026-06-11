import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Info, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Account {
  id: string; code: string; name: string; type: string; subtype: string;
  isActive: boolean; parentId: string | null; systemRole: string | null;
  cashFlowCategory: string; sortOrder: number; description: string | null;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity",
  INCOME: "Income", EXPENSE: "Expense",
};

const DETAIL_TYPES: Record<string, Array<{ value: string; label: string }>> = {
  ASSET: [
    { value: "bank",                     label: "Bank" },
    { value: "savings",                  label: "Savings" },
    { value: "cash_on_hand",             label: "Cash on hand" },
    { value: "receivable",               label: "Accounts receivable (A/R)" },
    { value: "inventory",                label: "Inventory" },
    { value: "prepaid",                  label: "Prepaid expenses" },
    { value: "fixed",                    label: "Fixed assets" },
    { value: "accumulated_depreciation", label: "Accumulated depreciation" },
    { value: "general",                  label: "Other asset" },
  ],
  LIABILITY: [
    { value: "payable",          label: "Accounts payable (A/P)" },
    { value: "credit_card",      label: "Credit card" },
    { value: "tax",              label: "Sales tax payable" },
    { value: "other_current",    label: "Other current liabilities" },
    { value: "deferred_revenue", label: "Deferred revenue" },
    { value: "long_term",        label: "Long-term liabilities" },
    { value: "general",          label: "Other liability" },
  ],
  EQUITY: [
    { value: "equity",   label: "Owner's equity" },
    { value: "retained", label: "Retained earnings" },
    { value: "general",  label: "Opening balance equity" },
  ],
  INCOME: [
    { value: "revenue",       label: "Service/fee income" },
    { value: "product_sales", label: "Sales of product income" },
    { value: "other_income",  label: "Other primary income" },
    { value: "general",       label: "Other income" },
  ],
  EXPENSE: [
    { value: "cogs",         label: "Cost of goods sold" },
    { value: "payroll",      label: "Payroll expenses" },
    { value: "facilities",   label: "Rent or lease" },
    { value: "utilities",    label: "Utilities" },
    { value: "software",     label: "Office/General administrative" },
    { value: "travel",       label: "Travel expenses" },
    { value: "marketing",    label: "Advertising/Promotional" },
    { value: "professional", label: "Legal & professional fees" },
    { value: "bank_fees",    label: "Bank charges" },
    { value: "general",      label: "Other business expenses" },
  ],
};

const FINANCIAL_STATEMENT: Record<string, string> = {
  ASSET: "Balance Sheet", LIABILITY: "Balance Sheet", EQUITY: "Balance Sheet",
  INCOME: "Profit & Loss", EXPENSE: "Profit & Loss",
};

function detailLabel(type: string, subtype: string) {
  return DETAIL_TYPES[type]?.find(d => d.value === subtype)?.label ?? subtype;
}

function AccountForm({ initial, allAccounts, onSave, onClose, saving }: {
  initial?: Partial<Account>;
  allAccounts: Account[];
  onSave: (data: Partial<Account> & { openingBalanceCents?: number; openingBalanceDate?: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "EXPENSE");
  const [subtype, setSubtype] = useState(() => {
    if (initial?.subtype) return initial.subtype;
    return DETAIL_TYPES["EXPENSE"][0].value;
  });
  const [isSubaccount, setIsSubaccount] = useState(!!initial?.parentId);
  const [parentId, setParentId] = useState(initial?.parentId ?? "");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const isSystem = !!initial?.systemRole;
  const isNew = !initial?.id;

  function handleTypeChange(newType: string) {
    setType(newType);
    setSubtype(DETAIL_TYPES[newType]?.[0]?.value ?? "general");
  }

  const detailOptions = DETAIL_TYPES[type] ?? [];
  const parentOptions = allAccounts.filter(a => a.id !== initial?.id);
  const statement = FINANCIAL_STATEMENT[type] ?? "Balance Sheet";

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const obCents = openingBalance ? Math.round(parseFloat(openingBalance) * 100) : undefined;
        onSave({
          code, name, type, subtype,
          parentId: isSubaccount ? parentId || null : null,
          description: description || null,
          isActive,
          openingBalanceCents: obCents && !isNaN(obCents) && obCents !== 0 ? obCents : undefined,
          openingBalanceDate: obCents ? openingBalanceDate : undefined,
        });
      }}
    >
      {/* Row 1: Account name + Account number */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <div className="col-span-3 space-y-1">
          <Label className="text-sm font-medium">Account name <span className="text-destructive">*</span></Label>
          <Input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder=""
            className="h-9"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-sm font-medium">Account number</Label>
          <Input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder=""
            className="h-9"
          />
        </div>
      </div>

      {/* Row 2: Account type + Detail type */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Label className="text-sm font-medium">Account type <span className="text-destructive">*</span></Label>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Select
            value={type}
            onChange={e => handleTypeChange(e.target.value)}
            disabled={isSystem}
            className="h-9"
          >
            {ACCOUNT_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
          {isSystem && (
            <p className="text-xs text-muted-foreground">Locked — system account.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium">Detail type <span className="text-destructive">*</span></Label>
          <Select
            value={subtype}
            onChange={e => setSubtype(e.target.value)}
            className="h-9"
          >
            {detailOptions.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Subaccount checkbox */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          id="subaccount"
          checked={isSubaccount}
          onChange={e => { setIsSubaccount(e.target.checked); if (!e.target.checked) setParentId(""); }}
          className="h-4 w-4 rounded border-gray-300 text-primary"
        />
        <label htmlFor="subaccount" className="text-sm cursor-pointer select-none">
          Make this a subaccount
        </label>
      </div>

      {isSubaccount && (
        <div className="mb-4 pl-6 space-y-1">
          <Label className="text-sm font-medium">Parent account</Label>
          <Select value={parentId} onChange={e => setParentId(e.target.value)} className="h-9">
            <option value="">— select parent —</option>
            {parentOptions.map(a => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </Select>
        </div>
      )}

      {/* Opening balance (only for new accounts) */}
      {isNew && (
        <div className="mb-1">
          <div className="grid grid-cols-2 gap-4 mb-1">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-sm font-medium">Opening balance</Label>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingBalance}
                onChange={e => setOpeningBalance(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">As of</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={openingBalanceDate}
                  onChange={e => setOpeningBalanceDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-primary hover:underline cursor-pointer mb-3">
            More info on opening balances
          </p>
        </div>
      )}

      {/* Description */}
      <div className="mb-4 space-y-1">
        <Label className="text-sm font-medium">Description</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      <hr className="my-4 border-border" />

      {/* Active toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Active</span>
          <p className="text-xs text-muted-foreground">— hidden from pickers when inactive</p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {isSystem && (
        <p className="text-xs text-muted-foreground mb-4">
          System account ({initial?.systemRole}) — can be renamed but not deleted or retyped.
        </p>
      )}

      {/* Footer: statement preview + buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-sm font-semibold text-foreground">{statement}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving} className="min-w-16">
            {saving ? "Saving…" : "Save"}
            <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
          </Button>
        </div>
      </div>
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
    mutationFn: (data: Partial<Account> & { openingBalanceCents?: number; openingBalanceDate?: string }) =>
      apiFetch("/accounts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setDialog({ open: false }); },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Account>) =>
      apiFetch(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setDialog({ open: false }); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e: Error) => setError(e.message),
  });

  function onSave(data: Partial<Account> & { openingBalanceCents?: number; openingBalanceDate?: string }) {
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
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {TYPE_LABELS[type]}
              </h2>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Detail type</TableHead>
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
                        <TableCell className="text-muted-foreground text-sm">
                          {detailLabel(a.type, a.subtype)}
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
                              onClick={() => {
                                setError(null);
                                if (confirm(`Delete account "${a.name}"?`)) remove.mutate(a.id);
                              }}
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Edit account" : "New account"}</DialogTitle>
            <DialogDescription className="sr-only">
              {dialog.editing ? "Edit the details of this account." : "Fill in the details to create a new account."}
            </DialogDescription>
          </DialogHeader>
          {error && dialog.open && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-2">
              {error}
            </div>
          )}
          <AccountForm
            initial={dialog.editing}
            allAccounts={accounts}
            onSave={onSave}
            onClose={() => { setError(null); setDialog({ open: false }); }}
            saving={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
