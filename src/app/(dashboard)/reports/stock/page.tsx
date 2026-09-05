import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { Amount } from "@/components/ui/amount";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams } from "@/lib/list-params";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getStockReport, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Stock Report" };

export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const rows = await getStockReport(period);

  const totalClosing = rows.reduce((total, row) => total + Number(row.closing), 0);
  const outOfStock = rows.filter((row) => Number(row.closing) <= 0).length;

  return (
    <ReportShell
      title="Stock Report"
      description="Opening, movement and closing quantity per tracked product."
      period={period}
      actions={
        <Link href="/inventory" className="text-muted-foreground text-sm hover:underline">
          Current stock
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tracked products" value={String(rows.length)} />
        <StatCard label="Closing units" value={totalClosing.toFixed(2)} tone="primary" />
        <StatCard label="Out of stock" value={String(outOfStock)} hint="Closing at or below zero" />
      </div>

      <div className="card-float rounded-xl border">
        {rows.length === 0 ? (
          <EmptyState
            title="No tracked products"
            description="Enable stock tracking on a goods product to include it in this report."
            action={{ label: "Go to products", href: "/products" }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Adjustments</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell>
                    <Link
                      href={`/inventory/${row.productId}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.sku ? (
                      <div className="text-muted-foreground text-xs">{row.sku}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.opening} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.purchases} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.sales} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.adjustments} size="sm" signed />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.closing} size="sm" signed />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Closing = Opening + Purchases − Sales + Adjustments. Purchases move stock in when a
        vendor bill is posted; sales move it out when a customer invoice is posted.
      </p>
    </ReportShell>
  );
}
