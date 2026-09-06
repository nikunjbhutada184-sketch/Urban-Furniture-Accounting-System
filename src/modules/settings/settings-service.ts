import { AccountType } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/errors";
import { type CompanySettingsInput } from "./schemas";

/**
 * Company settings.
 *
 * One row, id `"company"`, holding the identity of the business, its fiscal
 * year, the accounting lock date and the fallback accounts the posting engine
 * reaches for when a contact, product or journal does not override them.
 *
 * The lock date is the only setting here with teeth: `assertPeriodOpen` in the
 * posting engine refuses any entry dated on or before it, so moving it forwards
 * closes a period for good.
 */

export const COMPANY_SETTINGS_ID = "company";

export async function getCompanySettings(client: DbClient = prisma) {
  return client.companySettings.findUnique({ where: { id: COMPANY_SETTINGS_ID } });
}

export interface AccountChoice {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

/**
 * The accounts selectable as company defaults, grouped by the role each
 * default plays. Offering every account would invite a receivable default that
 * points at an expense account.
 */
export async function listDefaultAccountChoices(client: DbClient = prisma): Promise<{
  receivable: AccountChoice[];
  payable: AccountChoice[];
  income: AccountChoice[];
  expense: AccountChoice[];
  tax: AccountChoice[];
}> {
  const accounts = await client.ledgerAccount.findMany({
    where: { isArchived: false },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  const of = (...types: AccountType[]) =>
    accounts.filter((account) => types.includes(account.type));

  return {
    receivable: of(AccountType.ASSET),
    payable: of(AccountType.LIABILITY),
    income: of(AccountType.INCOME),
    expense: of(AccountType.EXPENSE),
    tax: of(AccountType.LIABILITY, AccountType.ASSET),
  };
}

/**
 * Saves the settings.
 *
 * Moving the lock date backwards is refused: reopening a closed period would
 * let entries be posted into books that have already been reported on, which is
 * exactly what the lock exists to prevent. Clearing it entirely is allowed,
 * because that is an explicit administrative decision rather than a slip.
 */
export async function updateCompanySettings(
  tx: DbClient,
  input: CompanySettingsInput,
  context: { actorId?: string | null } = {},
): Promise<{ id: string }> {
  const existing = await tx.companySettings.findUnique({
    where: { id: COMPANY_SETTINGS_ID },
    select: { lockDate: true },
  });

  if (
    existing?.lockDate &&
    input.lockDate &&
    input.lockDate.getTime() < existing.lockDate.getTime()
  ) {
    throw new ValidationError(
      `The lock date cannot be moved backwards. It is currently ${existing.lockDate
        .toISOString()
        .slice(0, 10)}, which means those books are closed.`,
      { fieldErrors: { lockDate: "Cannot reopen a closed period." } },
    );
  }

  const data = {
    name: input.name,
    currencyCode: input.currencyCode,
    currencySymbol: input.currencySymbol,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    lockDate: input.lockDate,
    defaultReceivableAccountId: input.defaultReceivableAccountId,
    defaultPayableAccountId: input.defaultPayableAccountId,
    defaultIncomeAccountId: input.defaultIncomeAccountId,
    defaultExpenseAccountId: input.defaultExpenseAccountId,
    defaultTaxPayableAccountId: input.defaultTaxPayableAccountId,
    defaultTaxInputAccountId: input.defaultTaxInputAccountId,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    email: input.email,
    phone: input.phone,
    taxNumber: input.taxNumber,
  };

  await tx.companySettings.upsert({
    where: { id: COMPANY_SETTINGS_ID },
    update: data,
    create: { id: COMPANY_SETTINGS_ID, ...data },
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "CompanySettings",
      entityId: COMPANY_SETTINGS_ID,
      summary: `Updated company settings${
        input.lockDate ? ` (lock date ${input.lockDate.toISOString().slice(0, 10)})` : ""
      }`,
    },
    { userId: context.actorId ?? null },
  );

  return { id: COMPANY_SETTINGS_ID };
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string | null;
  userName: string | null;
  createdAt: Date;
}

/**
 * The audit trail.
 *
 * Read-only by design: rows are written inside the transaction they describe
 * and there is no service that edits or deletes one. That is the whole point —
 * a trail that can be tidied up is not a trail.
 */
export async function listAuditLog(
  filters: { entity?: string; action?: string; search?: string; take?: number } = {},
  client: DbClient = prisma,
): Promise<AuditLogRow[]> {
  const rows = await client.auditLog.findMany({
    where: {
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.search
        ? {
            OR: [
              { summary: { contains: filters.search, mode: "insensitive" as const } },
              { entityId: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.take ?? 100, 500),
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
    userName: row.user?.name ?? null,
    createdAt: row.createdAt,
  }));
}

/** The entities and actions actually present, so the filters offer real values. */
export async function listAuditFacets(client: DbClient = prisma) {
  const [entities, actions] = await Promise.all([
    client.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, take: 100 }),
    client.auditLog.findMany({ distinct: ["action"], select: { action: true }, take: 100 }),
  ]);

  return {
    entities: entities.map((row) => row.entity).sort(),
    actions: actions.map((row) => row.action).sort(),
  };
}
