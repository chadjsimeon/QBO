import type { InvoiceStatus, BillStatus } from "@prisma/client";

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "muted";

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, Variant> = {
  DRAFT: "muted",
  SENT: "secondary",
  PARTIAL: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  VOID: "muted",
};

export const BILL_STATUS_VARIANT: Record<BillStatus, Variant> = {
  DRAFT: "muted",
  OPEN: "secondary",
  PARTIAL: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  VOID: "muted",
};

/** A document is "open" (still owes money) for these statuses. */
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIAL", "OVERDUE"];
export const OPEN_BILL_STATUSES: BillStatus[] = ["OPEN", "PARTIAL", "OVERDUE"];
