import { z } from "zod";
import {
  optionalDateString,
  optionalEmail,
  optionalId,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const FISCAL_YEAR_MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

/**
 * Company settings.
 *
 * The lock date is a real accounting control, not a preference: the posting
 * engine refuses any entry dated on or before it. It is validated here and
 * guarded again in the service, which will not let it move backwards.
 */
export const companySettingsSchema = z.object({
  name: requiredText("Company name", 160),
  currencyCode: requiredText("Currency code", 3)
    .regex(/^[A-Za-z]{3}$/, "Use a three-letter ISO code, e.g. INR.")
    .transform((value) => value.toUpperCase()),
  currencySymbol: requiredText("Currency symbol", 8),
  fiscalYearStartMonth: z.coerce
    .number({ invalid_type_error: "Choose the month the fiscal year starts." })
    .int()
    .min(1, "Choose a month.")
    .max(12, "Choose a month."),
  lockDate: optionalDateString("Lock date"),

  defaultReceivableAccountId: optionalId(),
  defaultPayableAccountId: optionalId(),
  defaultIncomeAccountId: optionalId(),
  defaultExpenseAccountId: optionalId(),
  defaultTaxPayableAccountId: optionalId(),
  defaultTaxInputAccountId: optionalId(),

  addressLine1: optionalText("Address", 200),
  addressLine2: optionalText("Address line 2", 200),
  city: optionalText("City", 80),
  state: optionalText("State", 80),
  pincode: optionalText("Pincode", 16),
  email: optionalEmail(),
  phone: optionalText("Phone", 32),
  taxNumber: optionalText("Tax number", 40),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
