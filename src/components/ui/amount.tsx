import { cn } from "@/lib/utils";

/**
 * A monetary figure.
 *
 * The rupees carry the weight and the paise recede, so a column of numbers is
 * scanned by its significant digits. Amounts arrive as exact decimal strings
 * from the server -- this component only splits and styles them, it never does
 * arithmetic.
 */
export function Amount({
  value,
  size = "md",
  className,
  signed,
  currency,
}: {
  /** An exact decimal string, e.g. "26550.00". */
  value: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Colour negatives red and prefix a sign. */
  signed?: boolean;
  /** Optional prefix, e.g. "Rs." */
  currency?: string;
}) {
  const negative = value.trim().startsWith("-");
  const absolute = negative ? value.trim().slice(1) : value.trim();
  const [whole = "0", fraction] = absolute.split(".");

  const grouped = Number.isNaN(Number(whole))
    ? whole
    : Number(whole).toLocaleString("en-IN");

  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
    xl: "text-3xl",
  } as const;

  return (
    <span
      className={cn(
        "tabular font-semibold tracking-tight",
        sizes[size],
        signed && negative && "text-destructive",
        className,
      )}
    >
      {negative ? "−" : signed ? "+" : ""}
      {currency ? <span className="text-muted-foreground mr-0.5 font-normal">{currency}</span> : null}
      {grouped}
      {fraction ? <span className="text-muted-foreground font-medium">.{fraction}</span> : null}
    </span>
  );
}

/**
 * A small percentage-change pill, as used beside headline figures.
 */
export function DeltaBadge({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        positive
          ? "bg-primary-soft text-accent-foreground"
          : "bg-destructive/10 text-destructive",
        className,
      )}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
