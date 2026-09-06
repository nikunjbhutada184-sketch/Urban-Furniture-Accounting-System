import { z } from "zod";
import {
  dateString,
  decimalString,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

/**
 * A portal payment.
 *
 * Note what is absent: no contact, no direction, no journal. Those are decided
 * server-side from the session, so the form cannot influence whose invoice is
 * settled or where the money is posted.
 */
export const portalPaymentSchema = z.object({
  invoiceId: requiredText("Invoice", 40),
  amount: decimalString("Amount", { scale: 2, allowZero: false }),
  paymentDate: dateString("Payment date"),
  reference: optionalText("Reference", 80),
});

export type PortalPaymentInput = z.infer<typeof portalPaymentSchema>;
