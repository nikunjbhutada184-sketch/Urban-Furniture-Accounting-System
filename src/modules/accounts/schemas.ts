import { AccountKind, AccountType } from "@prisma/client";
import { z } from "zod";
import { optionalId, optionalText, requiredText } from "@/modules/shared/zod-helpers";

/**
 * Chart of Accounts.
 *
 * `type` decides which financial statement the account lands in. `kind` is the
 * machine-readable role the posting engine resolves special accounts by
 * (receivable, payable, bank, tax) -- automation never matches on name.
 */

export const ACCOUNT_TYPE_OPTIONS = [
  { value: AccountType.ASSET, label: "Asset" },
  { value: AccountType.LIABILITY, label: "Liability" },
  { value: AccountType.EXPENSE, label: "Expense" },
  { value: AccountType.INCOME, label: "Income" },
  { value: AccountType.CAPITAL, label: "Capital" },
] as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.ASSET]: "Asset",
  [AccountType.LIABILITY]: "Liability",
  [AccountType.EXPENSE]: "Expense",
  [AccountType.INCOME]: "Income",
  [AccountType.CAPITAL]: "Capital",
};

/** Which statement each type appears on. */
export const ACCOUNT_TYPE_STATEMENT: Record<AccountType, "Balance Sheet" | "Profit & Loss"> = {
  [AccountType.ASSET]: "Balance Sheet",
  [AccountType.LIABILITY]: "Balance Sheet",
  [AccountType.CAPITAL]: "Balance Sheet",
  [AccountType.INCOME]: "Profit & Loss",
  [AccountType.EXPENSE]: "Profit & Loss",
};

export const ACCOUNT_KIND_OPTIONS = Object.values(AccountKind).map((kind) => ({
  value: kind,
  label: kind
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
}));

export const ACCOUNT_SORT_FIELDS = ["code", "name", "type", "createdAt"] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

export const accountInputSchema = z.object({
  code: requiredText("Account code", 24).refine((value) => /^[A-Za-z0-9._-]+$/.test(value), {
    message: "Account code may only contain letters, numbers, dots, dashes and underscores.",
  }),
  name: requiredText("Account name", 160),
  type: z.nativeEnum(AccountType, {
    errorMap: () => ({ message: "Select an account type." }),
  }),
  kind: z.nativeEnum(AccountKind).default(AccountKind.OTHER),
  parentId: optionalId(),
  description: optionalText("Description", 400),
  isReconcilable: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined()])
    .transform((value) => value === "on" || value === "true"),
});

export type AccountInput = z.infer<typeof accountInputSchema>;
