import { FileQuestion, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Empty states.
 *
 * Distinguishes "nothing exists yet" (offer to create the first record) from
 * "your filters matched nothing" (offer to clear them) -- they need different
 * next actions.
 */
export function EmptyState({
  title,
  description,
  action,
  variant = "empty",
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
  variant?: "empty" | "no-results";
}) {
  const Icon = variant === "no-results" ? SearchX : FileQuestion;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      {action ? (
        <Link href={action.href} className={cn(buttonVariants({ size: "sm" }), "mt-5")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
