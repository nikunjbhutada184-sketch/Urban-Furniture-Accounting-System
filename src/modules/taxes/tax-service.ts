import { type Tax, type TaxScope } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/errors";

/**
 * Tax master data.
 *
 * Taxes carry the accounts the posting engine credits (tax collected on sales)
 * and debits (input tax paid on purchases), so a document line never has to
 * name a tax account itself.
 */

export interface TaxOption {
  id: string;
  name: string;
  /** Percentage or fixed amount, serialised for the client boundary. */
  rate: string;
  collectedAccountId: string | null;
  paidAccountId: string | null;
}

export async function listTaxOptions(
  scope?: TaxScope,
  client: DbClient = prisma,
): Promise<TaxOption[]> {
  const taxes = await client.tax.findMany({
    where: {
      isArchived: false,
      ...(scope ? { OR: [{ scope }, { scope: "BOTH" }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      rate: true,
      collectedAccountId: true,
      paidAccountId: true,
    },
  });

  return taxes.map((tax) => ({
    id: tax.id,
    name: tax.name,
    rate: tax.rate.toString(),
    collectedAccountId: tax.collectedAccountId,
    paidAccountId: tax.paidAccountId,
  }));
}

export async function getTax(id: string, client: DbClient = prisma): Promise<Tax> {
  const tax = await client.tax.findUnique({ where: { id } });
  if (!tax) throw new NotFoundError("Tax", id);
  return tax;
}
