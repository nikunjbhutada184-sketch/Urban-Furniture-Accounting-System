import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The dashboard's quick-access cards.
 *
 * One card per area of the business: the primary action on the right of the
 * heading, and the counts that matter underneath, each linking to the list it
 * counts. Every figure is passed in from the reporting service -- nothing here
 * invents a number.
 */

export interface QuickTile {
  label: string;
  /** A count, or a money string already formatted by the server. */
  value: string;
  /** Money is rendered with the muted-decimals treatment; counts are not. */
  money?: boolean;
  href: string;
}

export function QuickAccessCard({
  title,
  action,
  tiles,
}: {
  title: string;
  action: { label: string; href: string };
  tiles: QuickTile[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link href={action.href} className={cn(buttonVariants({ size: "sm" }), "rounded-full")}>
          {action.label}
        </Link>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="hover:border-ring focus-visible:ring-ring flex flex-col gap-1 rounded-2xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-muted-foreground truncate text-xs">{tile.label}</span>
              {tile.money ? (
                <Amount value={tile.value} size="sm" />
              ) : (
                <span className="tabular text-2xl leading-none font-semibold">{tile.value}</span>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
