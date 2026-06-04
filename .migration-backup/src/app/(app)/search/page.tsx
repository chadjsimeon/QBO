import Link from "next/link";
import { Users, Building2, FileText, Receipt } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const ctx = await requireOrg();
  const orgId = ctx.organizationId;

  if (!query) {
    return (
      <>
        <PageHeader title="Search" />
        <EmptyState title="Type a search term" description="Find customers, vendors, invoices, and bills." />
      </>
    );
  }

  const contains = { contains: query, mode: "insensitive" as const };
  const [customers, vendors, invoices, bills] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: orgId, OR: [{ name: contains }, { email: contains }] },
      take: 8,
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({
      where: { organizationId: orgId, OR: [{ name: contains }, { email: contains }] },
      take: 8,
      orderBy: { name: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        OR: [{ number: contains }, { customer: { name: contains } }],
      },
      include: { customer: true },
      take: 8,
      orderBy: { issueDate: "desc" },
    }),
    prisma.bill.findMany({
      where: {
        organizationId: orgId,
        OR: [{ number: contains }, { vendor: { name: contains } }],
      },
      include: { vendor: true },
      take: 8,
      orderBy: { issueDate: "desc" },
    }),
  ]);

  const total = customers.length + vendors.length + invoices.length + bills.length;

  return (
    <>
      <PageHeader title={`Search`} description={`${total} result${total === 1 ? "" : "s"} for “${query}”`} />

      {total === 0 ? (
        <EmptyState title="No matches" description={`Nothing found for “${query}”.`} />
      ) : (
        <div className="space-y-6">
          <Group title="Customers" icon={Users} show={customers.length > 0}>
            {customers.map((c) => (
              <Row key={c.id} href={`/customers/${c.id}/edit`} title={c.name} subtitle={c.email ?? ""} />
            ))}
          </Group>
          <Group title="Vendors" icon={Building2} show={vendors.length > 0}>
            {vendors.map((v) => (
              <Row key={v.id} href={`/vendors/${v.id}/edit`} title={v.name} subtitle={v.email ?? ""} />
            ))}
          </Group>
          <Group title="Invoices" icon={FileText} show={invoices.length > 0}>
            {invoices.map((i) => (
              <Row
                key={i.id}
                href={`/invoices/${i.id}`}
                title={`${i.number} · ${i.customer.name}`}
                subtitle={i.status}
                amount={formatCents(i.totalCents)}
              />
            ))}
          </Group>
          <Group title="Bills" icon={Receipt} show={bills.length > 0}>
            {bills.map((b) => (
              <Row
                key={b.id}
                href={`/bills/${b.id}`}
                title={`${b.number} · ${b.vendor.name}`}
                subtitle={b.status}
                amount={formatCents(b.totalCents)}
              />
            ))}
          </Group>
        </div>
      )}
    </>
  );
}

function Group({
  title,
  icon: Icon,
  show,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <Card>
        <CardContent className="divide-y p-0">{children}</CardContent>
      </Card>
    </div>
  );
}

function Row({
  href,
  title,
  subtitle,
  amount,
}: {
  href: string;
  title: string;
  subtitle?: string;
  amount?: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3 hover:bg-accent/40">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {amount && <div className="text-sm tabular-nums text-muted-foreground">{amount}</div>}
    </Link>
  );
}
