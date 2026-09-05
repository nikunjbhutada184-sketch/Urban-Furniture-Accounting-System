"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Account selector for the general ledger.
 *
 * Writes `?account=` so the chosen account is part of the shareable URL,
 * alongside the period.
 */
export function AccountPicker({
  accounts,
  selected,
}: {
  accounts: { id: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(accountId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", accountId);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <>
      <Select value={selected} onValueChange={select}>
        <SelectTrigger className="w-[18rem] rounded-full" aria-label="Ledger account">
          <SelectValue placeholder="Select an account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span aria-live="polite" className="sr-only">
        {isPending ? "Loading account" : ""}
      </span>
    </>
  );
}
