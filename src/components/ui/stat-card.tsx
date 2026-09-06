import Link from "next/link";
import { Amount, DeltaBadge } from "@/components/ui/amount";
import { cn } from "@/lib/utils";

/**
 * A headline figure on a floating card.
 *
 * Used across the dashboard and the report summaries so every key number is
 * presented the same way: a quiet label, a loud figure, and an optional change
 * pill beside it.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  href,
  tone = "default",
  currency,
  className,
}: {
  label: string;
  /** Exact decimal string. */
  value: string;
  /**
   * A node, not a string, so a hint can hold `<Amount>` components. As plain
   * text the figures came out ungrouped -- "Cash 4212452.17" sitting under a
   * headline reading "41,34,495.12".
   */
  hint?: React.ReactNode;
  delta?: number;
  href?: string;
  tone?: "default" | "primary";
  currency?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "card-float rounded-xl border p-4 transition-colors",
        tone === "primary" ? "bg-primary text-primary-foreground border-transparent" : "bg-card",
        href && "hover:border-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "min-w-0 text-xs font-medium",
            tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {delta !== undefined ? <DeltaBadge value={delta} /> : null}
      </div>

      <div className="mt-2 min-w-0">
        <Amount
          value={value}
          size="lg"
          currency={currency}
          className={tone === "primary" ? "text-primary-foreground" : undefined}
        />
      </div>

      {hint ? (
        <div
          className={cn(
            "mt-1 text-xs",
            tone === "primary" ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
