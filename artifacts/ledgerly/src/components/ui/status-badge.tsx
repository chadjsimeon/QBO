import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  className?: string;
};

function getStatusVariant(
  status: string,
): "success" | "warning" | "destructive" | "secondary" | "muted" {
  const s = status.toUpperCase();
  if (s === "PAID" || s === "POSTED" || s === "RECEIVED") return "success";
  if (s === "PARTIAL" || s === "PENDING") return "warning";
  if (s === "OVERDUE") return "destructive";
  if (s === "SENT" || s === "OPEN") return "secondary";
  return "muted";
}

function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = getStatusVariant(status);
  return (
    <Badge variant={variant} className={cn("text-xs capitalize", className)}>
      {getStatusLabel(status)}
    </Badge>
  );
}
