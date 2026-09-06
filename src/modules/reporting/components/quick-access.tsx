import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The dashboard's quick-access cards.
 *
 * One card per area of the business: the primary action beside the heading, and
 * three counts underneath, each linking to the list it counts. Every figure is
 * passed in from the reporting service -- nothing here invents a number.
 *
 * The tiles hold **counts only**. An earlier version mixed two money totals in
 * beside them, which put "5,47,586.00" in a box sized for "18": the label was
 * clipped to "Com..." and the decimals spilled past the border. Money now goes
 * on the footnote line, where it has the width to be shown in full.
 */

export interface QuickTile {
  label: string;
  /** A whole number, already computed by the server. */
  value: number;
  href: string;
}

export function QuickAccessCard({
  title,
  action,
  tiles,
  footnote,
}: {
  title: string;
  action: { label: string; href: string };
  tiles: QuickTile[];
  /** Optional line under the tiles, for figures that are not counts. */
  footnote?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="truncate text-base">{title}</CardTitle>
        <Link
          href={action.href}
          className={cn(buttonVariants({ size: "sm" }), "shrink-0 rounded-full")}
        >
          {action.label}
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              // `min-w-0` matters: without it a grid column refuses to shrink
              // below its content, which is what pushed the value outside the
              // border instead of wrapping the label.
              className="hover:border-ring focus-visible:ring-ring flex min-w-0 flex-col justify-between gap-1 rounded-2xl border px-2.5 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {/*
                Wraps rather than truncates. "Confirmed" was being clipped to
                "Confi…", which is worse than a second line.
              */}
              <span className="text-muted-foreground text-[11px] leading-tight break-words">
                {tile.label}
              </span>
              <span className="tabular text-2xl leading-none font-semibold">
                {tile.value.toLocaleString("en-IN")}
              </span>
            </Link>
          ))}
        </div>

        {footnote ? <div className="text-muted-foreground text-xs">{footnote}</div> : null}
      </CardContent>
    </Card>
  );
}
