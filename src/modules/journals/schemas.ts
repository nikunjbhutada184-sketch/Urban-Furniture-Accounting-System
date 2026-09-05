import { JournalType } from "@prisma/client";
import { z } from "zod";
import { optionalId, requiredText } from "@/modules/shared/zod-helpers";

export const JOURNAL_TYPE_OPTIONS = [
  { value: JournalType.SALES, label: "Sales" },
  { value: JournalType.PURCHASE, label: "Purchase" },
  { value: JournalType.BANK, label: "Bank" },
  { value: JournalType.CASH, label: "Cash" },
  { value: JournalType.MISCELLANEOUS, label: "Miscellaneous" },
] as const;

export const JOURNAL_TYPE_LABELS: Record<JournalType, string> = {
  [JournalType.SALES]: "Sales",
  [JournalType.PURCHASE]: "Purchase",
  [JournalType.BANK]: "Bank",
  [JournalType.CASH]: "Cash",
  [JournalType.MISCELLANEOUS]: "Miscellaneous",
};

export const JOURNAL_SORT_FIELDS = ["code", "name", "type", "createdAt"] as const;
export type JournalSortField = (typeof JOURNAL_SORT_FIELDS)[number];

/**
 * A journal groups similar transactions and supplies the default accounts the
 * posting engine falls back to.
 *
 * Bank and cash journals must name the account money actually moves through --
 * without it, payments posted to that journal would have nowhere to go.
 */
export const journalInputSchema = z
  .object({
    code: requiredText("Journal code", 12).refine((value) => /^[A-Za-z0-9-]+$/.test(value), {
      message: "Journal code may only contain letters, numbers and dashes.",
    }),
    name: requiredText("Journal name", 120),
    type: z.nativeEnum(JournalType, {
      errorMap: () => ({ message: "Select a journal type." }),
    }),
    defaultDebitAccountId: optionalId(),
    defaultCreditAccountId: optionalId(),
    paymentAccountId: optionalId(),
    sequenceCode: optionalId(),
  })
  .refine(
    (value) =>
      (value.type !== JournalType.BANK && value.type !== JournalType.CASH) ||
      Boolean(value.paymentAccountId),
    {
      message: "Bank and cash journals need the account money moves through.",
      path: ["paymentAccountId"],
    },
  );

export type JournalInput = z.infer<typeof journalInputSchema>;
