import { Download, Sheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Download links for a report.
 *
 * Plain links, not buttons with handlers: the file is produced by a server
 * route from the same service the page used, so the browser only has to follow
 * a URL. The current period travels with it, which is what makes a download
 * match what is on screen.
 */
export function ReportExportLinks({
  period,
  csvReport,
  pdfHref,
}: {
  period: { from: Date; to: Date };
  /** Report slug understood by `/reports/export`. Omit to hide the CSV link. */
  csvReport?: string;
  /** The report's PDF route. Omit to hide the PDF link. */
  pdfHref?: string;
}) {
  const query = new URLSearchParams({
    from: period.from.toISOString().slice(0, 10),
    to: period.to.toISOString().slice(0, 10),
  });

  const linkClass = cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-full");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {csvReport ? (
        <a href={`/reports/export?report=${csvReport}&${query.toString()}`} className={linkClass}>
          <Sheet className="size-4" aria-hidden />
          CSV
        </a>
      ) : null}

      {pdfHref ? (
        <a href={`${pdfHref}?${query.toString()}`} className={linkClass}>
          <Download className="size-4" aria-hidden />
          PDF
        </a>
      ) : null}
    </div>
  );
}
