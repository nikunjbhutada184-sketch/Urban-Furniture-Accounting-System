import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "PDF" for a document.
 *
 * A plain link: the file is produced by a server route from the same service
 * the page used, so the browser only has to follow a URL. Not a `next/link` —
 * this is a download, not a navigation, and client-side routing would try to
 * render the PDF as a page.
 */
export function DocumentPdfLink({ href, label = "PDF" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className={cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-full")}
    >
      <Download className="size-4" aria-hidden />
      {label}
    </a>
  );
}
