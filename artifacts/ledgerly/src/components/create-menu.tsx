import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Plus, FileText, DollarSign, FileSpreadsheet, ClipboardList, FileMinus,
  Receipt, RotateCcw, UserPlus, ShoppingCart, BookCheck, Package, FilePlus,
  CreditCard, Building2, Landmark, ArrowLeftRight,
  BookOpen, Banknote, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface MenuItem {
  label: string;
  icon: React.ElementType;
  href?: string;
  soon?: boolean;
}

interface Category {
  title: string;
  items: MenuItem[];
}

const CATEGORIES: Category[] = [
  {
    title: "Customers",
    items: [
      { label: "Invoice",         icon: FileText,        href: "/invoices/new" },
      { label: "Receive payment", icon: DollarSign,      href: "/payments/new" },
      { label: "Statement",       icon: FileSpreadsheet, href: "/statements" },
      { label: "Estimate",        icon: ClipboardList,   href: "/estimates/new" },
      { label: "Credit note",     icon: FileMinus,       href: "/credit-notes/new" },
      { label: "Sales receipt",   icon: Receipt,         href: "/sales-receipts/new" },
      { label: "Refund receipt",  icon: RotateCcw,       href: "/sales-receipts/new?mode=refund" },
      { label: "Add customer",    icon: UserPlus,        href: "/customers" },
    ],
  },
  {
    title: "Suppliers",
    items: [
      { label: "Expense",          icon: ShoppingCart, href: "/expenses/new" },
      { label: "Cheque",           icon: BookCheck,    href: "/expenses/new?mode=cheque" },
      { label: "Bill",             icon: Receipt,      href: "/bills/new" },
      { label: "Pay bills",        icon: Banknote,     href: "/payments/new" },
      { label: "Purchase order",   icon: Package,      href: "/purchase-orders/new" },
      { label: "Supplier credit",  icon: FilePlus,     href: "/vendor-credits/new" },
      { label: "Credit card credit", icon: CreditCard, href: "/expenses/new?mode=cc-credit" },
      { label: "Add supplier",     icon: Building2,    href: "/vendors" },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Bank deposit",          icon: Landmark,      href: "/banking" },
      { label: "Transfer",              icon: ArrowLeftRight, href: "/transfers/new" },
      { label: "Journal entry",         icon: BookOpen,      href: "/journal-entries/new" },
      { label: "Pay down credit card",  icon: CreditCard,    href: "/transfers/new?mode=cc" },
      { label: "Add product/service",   icon: Package,       soon: true },
    ],
  },
];

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  function handleItem(item: MenuItem) {
    setOpen(false);
    if (item.soon) {
      toast({ title: `${item.label} — coming soon`, description: "This feature is on the roadmap." });
      return;
    }
    if (item.href) navigate(item.href);
  }

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        onClick={() => setOpen(v => !v)}
        className="gap-1.5 font-semibold shadow-sm"
        data-create-menu
      >
        <Plus className="h-4 w-4" />
        New
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Panel */}
          <div className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden w-[680px] max-w-[calc(100vw-2rem)]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <span className="text-sm font-semibold text-foreground">Create new</span>
              <button
                onClick={() => setOpen(false)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Category columns */}
            <div className="grid grid-cols-3 divide-x divide-border">
              {CATEGORIES.map(cat => (
                <div key={cat.title} className="flex flex-col">
                  {/* Category heading */}
                  <div className="px-4 pt-4 pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                      {cat.title}
                    </span>
                  </div>

                  {/* Items */}
                  <ul className="flex flex-col pb-4 flex-1">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <li key={item.label}>
                          <button
                            onClick={() => handleItem(item)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                              item.soon
                                ? "text-muted-foreground/60 cursor-default hover:bg-muted/40"
                                : "text-foreground hover:bg-primary/8 hover:text-primary"
                            }`}
                          >
                            <Icon
                              className={`h-3.5 w-3.5 shrink-0 ${
                                item.soon ? "text-muted-foreground/40" : "text-primary/70"
                              }`}
                            />
                            <span className="leading-snug">{item.label}</span>
                            {item.soon && (
                              <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-muted-foreground/50 border border-border rounded px-1">
                                soon
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
