import { type MonthlyPoint } from "@/modules/reporting/dashboard-service";

/**
 * Income and expenses by month.
 *
 * Inline SVG rather than a charting library: two series, a handful of bars, and
 * full control over the marks. Bars are capped in width with rounded tops and a
 * gap between neighbours, and the values are carried by the axis plus the
 * per-bar title, so nothing depends on colour alone.
 */
export function IncomeExpenseChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">
        Nothing posted in this period yet.
      </div>
    );
  }

  const width = 640;
  const height = 240;
  const padding = { top: 16, right: 8, bottom: 28, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const peak = Math.max(...data.flatMap((point) => [point.income, point.expenses]), 1);
  // Round the scale up to something readable on the axis.
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil(peak / magnitude) * magnitude;

  const slot = plotWidth / data.length;
  const barWidth = Math.min(18, slot / 3.2);
  const gap = 4;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);

  const compact = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1000
        ? `${Math.round(value / 1000)}k`
        : String(Math.round(value));

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-1 size-2.5 rounded-full" aria-hidden />
          <span className="text-muted-foreground">Income</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-2 size-2.5 rounded-full" aria-hidden />
          <span className="text-muted-foreground">Expenses</span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[240px] w-full"
        role="img"
        aria-label="Income and expenses by month"
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / max) * plotHeight;

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {compact(tick)}
              </text>
            </g>
          );
        })}

        {data.map((point, index) => {
          const centre = padding.left + slot * index + slot / 2;
          const incomeHeight = (point.income / max) * plotHeight;
          const expenseHeight = (point.expenses / max) * plotHeight;

          return (
            <g key={point.month}>
              <rect
                x={centre - barWidth - gap / 2}
                y={padding.top + plotHeight - incomeHeight}
                width={barWidth}
                height={Math.max(incomeHeight, 0)}
                rx={4}
                fill="var(--chart-1)"
              >
                <title>{`${point.label} income: ${point.income.toFixed(2)}`}</title>
              </rect>

              <rect
                x={centre + gap / 2}
                y={padding.top + plotHeight - expenseHeight}
                width={barWidth}
                height={Math.max(expenseHeight, 0)}
                rx={4}
                fill="var(--chart-2)"
              >
                <title>{`${point.label} expenses: ${point.expenses.toFixed(2)}`}</title>
              </rect>

              <text
                x={centre}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10, letterSpacing: "0.04em" }}
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
