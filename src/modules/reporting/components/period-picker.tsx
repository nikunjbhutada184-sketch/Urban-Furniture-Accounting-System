"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Report period selector.
 *
 * Writes `from` and `to` into the URL so a report is shareable and survives a
 * reload, and offers the ranges people actually ask for.
 */
export function PeriodPicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function presetRange(preset: "month" | "quarter" | "fy" | "year") {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();

    const ranges = {
      month: [Date.UTC(year, month, 1), Date.UTC(year, month + 1, 0)],
      quarter: [
        Date.UTC(year, Math.floor(month / 3) * 3, 1),
        Date.UTC(year, Math.floor(month / 3) * 3 + 3, 0),
      ],
      // Indian financial year: 1 April to 31 March.
      fy: [
        Date.UTC(month >= 3 ? year : year - 1, 3, 1),
        Date.UTC(month >= 3 ? year + 1 : year, 2, 31),
      ],
      year: [Date.UTC(year, 0, 1), Date.UTC(year, 11, 31)],
    } as const;

    const [start, end] = ranges[preset];
    apply(new Date(start).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        Full width on a phone, natural width from `sm` up. Two fixed-width date
        inputs plus their chrome are wider than a 375px viewport, so on mobile
        they share the row instead of running off the edge.
      */}
      <div className="bg-card flex w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 sm:w-auto">
        <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Input
          type="date"
          value={from}
          aria-label="Period start"
          onChange={(event) => apply(event.target.value, to)}
          className="h-7 w-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 sm:w-[9.5rem] sm:flex-none"
        />
        <span className="text-muted-foreground shrink-0 text-sm">to</span>
        <Input
          type="date"
          value={to}
          aria-label="Period end"
          onChange={(event) => apply(from, event.target.value)}
          className="h-7 w-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 sm:w-[9.5rem] sm:flex-none"
        />
      </div>

      <div className="flex items-center gap-1">
        {(
          [
            ["month", "Month"],
            ["quarter", "Quarter"],
            ["fy", "FY"],
            ["year", "Year"],
          ] as const
        ).map(([preset, label]) => (
          <Button
            key={preset}
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => presetRange(preset)}
          >
            {label}
          </Button>
        ))}
      </div>

      <span aria-live="polite" className="sr-only">
        {isPending ? "Updating report" : ""}
      </span>
    </div>
  );
}
