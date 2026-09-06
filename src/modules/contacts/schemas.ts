import { ContactType } from "@prisma/client";
import { z } from "zod";
import {
  optionalEmail,
  optionalId,
  optionalText,
  optionalUrlOrPath,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const CONTACT_TYPE_OPTIONS = [
  { value: ContactType.CUSTOMER, label: "Customer" },
  { value: ContactType.VENDOR, label: "Vendor" },
  { value: ContactType.BOTH, label: "Both" },
] as const;

export const CONTACT_SORT_FIELDS = ["name", "type", "city", "createdAt", "updatedAt"] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

/**
 * Contact master data.
 *
 * `type` decides which documents a contact may appear on: a CUSTOMER cannot be
 * the vendor on a purchase, and a VENDOR cannot be the customer on a sale.
 * `BOTH` is valid on either side.
 */
export const contactInputSchema = z.object({
  name: requiredText("Name", 160),
  type: z.nativeEnum(ContactType, {
    errorMap: () => ({ message: "Select a contact type." }),
  }),
  email: optionalEmail(),
  mobile: optionalText("Mobile", 32),
  addressLine1: optionalText("Address", 200),
  addressLine2: optionalText("Address line 2", 200),
  city: optionalText("City", 80),
  state: optionalText("State", 80),
  pincode: optionalText("Pincode", 16),
  profileImage: optionalUrlOrPath("Profile photo"),
  receivableAccountId: optionalId(),
  payableAccountId: optionalId(),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactArchiveSchema = z.object({
  id: z.string().min(1),
  isArchived: z.coerce.boolean(),
});

/** Human labels for a contact type, used in tables and badges. */
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  [ContactType.CUSTOMER]: "Customer",
  [ContactType.VENDOR]: "Vendor",
  [ContactType.BOTH]: "Both",
};
