import { cn } from "@/lib/utils";

/**
 * Achieved against the balance still to achieve, as a donut.
 *
 * Two slices only, which is what a pie can honestly carry. The hues are the
 * validated categorical pair, assigned in fixed order so "achieved" is the
 * same colour on every budget and never repaints when a filter changes the
 * rows on screen.
 *
 * Colour is never the only encoding: the legend names each slice and prints
 * its amount, and the SVG carries an accessible label -- so the chart still
 * reads for a colour-blind viewer, in print, and in forced-colours mode.
 */

/** Achieved. Assigned first, always. */
const ACHIEVED = "#1baf7a";
/** Balance still to achieve. */
const BALANCE = "#eb6834";

export interface BudgetPieData {
  achieved: string;
  toAchieve: string;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * The donut itself.
 *
 * Drawn with two `stroke-dasharray` arcs rather than paths, which keeps the
 * geometry exact at any size and leaves a clean 2px surface gap between the
 * segments. `size` is the rendered pixel width.
 */
export function BudgetPie({
  achieved,
  toAchieve,
  size = 40,
  className,
}: BudgetPieData & { size?: number; className?: string }) {
  const achievedValue = toNumber(achieved);
  const balanceValue = toNumber(toAchieve);
  const total = achievedValue + balanceValue;

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  // A 2px gap on the surface between the two segments, in path units.
  const gap = total > 0 && achievedValue > 0 && balanceValue > 0 ? 1.5 : 0;

  const achievedLength = total === 0 ? 0 : (achievedValue / total) * circumference;
  const achievedArc = Math.max(achievedLength - gap, 0);
  const balanceArc = Math.max(circumference - achievedLength - gap, 0);

  const label =
    total === 0
      ? "Nothing planned for this budget yet"
      : `${Math.round((achievedValue / total) * 100)}% achieved`;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn("shrink-0 -rotate-90", className)}
    >
      {total === 0 ? (
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
      ) : (
        <>
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={ACHIEVED}
            strokeWidth="7"
            strokeDasharray={`${achievedArc} ${circumference - achievedArc}`}
            strokeDashoffset="0"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={BALANCE}
            strokeWidth="7"
            strokeDasharray={`${balanceArc} ${circumference - balanceArc}`}
            strokeDashoffset={-(achievedLength + gap)}
          />
        </>
      )}
    </svg>
  );
}

/** Donut plus a named, valued legend -- the labelled form used on cards. */
export function BudgetPieWithLegend({
  achieved,
  toAchieve,
  size = 64,
}: BudgetPieData & { size?: number }) {
  const rows = [
    { label: "Achieved", value: achieved, colour: ACHIEVED },
    { label: "Balance", value: toAchieve, colour: BALANCE },
  ];

  return (
    <div className="flex items-center gap-3">
      <BudgetPie achieved={achieved} toAchieve={toAchieve} size={size} />

      <dl className="min-w-0 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="ring-card size-2.5 shrink-0 rounded-[3px] ring-2"
              style={{ backgroundColor: row.colour }}
            />
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="tabular font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
