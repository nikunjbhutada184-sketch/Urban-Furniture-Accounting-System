import {
  type AnalyticAccountType,
  type Budget,
  BudgetStatus,
  EntryStatus,
  type Prisma,
} from "@prisma/client";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type Decimal, ZERO, add, subtract, toAmountString, toMoney } from "@/server/money";
import { type BudgetInput, type BudgetLineInput } from "./schemas";

/**
 * Budget service.
 *
 * A budget plans income and expenditure against analytic accounts. Its lifecycle:
 *
 *   DRAFT      editable; can be confirmed or cancelled
 *   CONFIRMED  planned figures locked; can be revised or cancelled
 *   REVISED    superseded by a newer revision; read-only
 *   CANCELLED  read-only
 *   CLOSED     period ended; read-only
 *
 * `plannedAmount` is entered by the user. `committedAmount` and `achievedAmount`
 * are DERIVED from confirmed orders and the posted ledger respectively -- they
 * are recomputed, never typed in, so a report can never disagree with the books.
 */

// ---------------------------------------------------------------------------
// Status rules -- one place, shared by the service and the UI
// ---------------------------------------------------------------------------

export interface BudgetPermissions {
  canEdit: boolean;
  canConfirm: boolean;
  canRevise: boolean;
  canCancel: boolean;
  isReadOnly: boolean;
}

/**
 * Which actions the status allows.
 *
 * The UI uses this to enable/disable buttons; the service asserts the same
 * rules again, so a disabled button is a convenience, never the control.
 */
export function budgetPermissions(status: BudgetStatus): BudgetPermissions {
  switch (status) {
    case BudgetStatus.DRAFT:
      return {
        canEdit: true,
        canConfirm: true,
        canRevise: false,
        canCancel: true,
        isReadOnly: false,
      };
    case BudgetStatus.CONFIRMED:
      return {
        canEdit: false,
        canConfirm: false,
        canRevise: true,
        canCancel: true,
        isReadOnly: false,
      };
    case BudgetStatus.REVISED:
    case BudgetStatus.CANCELLED:
    case BudgetStatus.CLOSED:
      return {
        canEdit: false,
        canConfirm: false,
        canRevise: false,
        canCancel: false,
        isReadOnly: true,
      };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface BudgetListRow {
  id: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  status: BudgetStatus;
  responsibleName: string | null;
  lineCount: number;
  planned: string;
  achieved: string;
  achievedPercent: number | null;
  revisionOfName: string | null;
}

export async function listBudgets(
  filters: { status?: BudgetStatus; search?: string } = {},
  client: DbClient = prisma,
): Promise<BudgetListRow[]> {
  const where: Prisma.BudgetWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.name = { contains: filters.search, mode: "insensitive" };
  }

  const budgets = await client.budget.findMany({
    where,
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      responsibleUser: { select: { name: true } },
      revisionOf: { select: { name: true } },
      lines: { select: { plannedAmount: true, achievedAmount: true } },
    },
  });

  return budgets.map((budget) => {
    let planned = ZERO;
    let achieved = ZERO;

    for (const line of budget.lines) {
      planned = add(planned, line.plannedAmount);
      achieved = add(achieved, line.achievedAmount);
    }

    return {
      id: budget.id,
      name: budget.name,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      status: budget.status,
      responsibleName: budget.responsibleUser?.name ?? null,
      lineCount: budget.lines.length,
      planned: toAmountString(planned),
      achieved: toAmountString(achieved),
      achievedPercent: planned.isZero()
        ? null
        : Number(achieved.dividedBy(planned).times(100).toFixed(1)),
      revisionOfName: budget.revisionOf?.name ?? null,
    };
  });
}

export interface BudgetLineRow {
  id: string;
  analyticAccountId: string;
  analyticCode: string;
  analyticName: string;
  accountLabel: string | null;
  type: AnalyticAccountType;
  planned: string;
  committed: string;
  achieved: string;
  /** achieved / planned, as a percentage. Null when nothing was planned. */
  achievedPercent: number | null;
  /** planned - achieved, floored at zero: what is still left to achieve. */
  toAchieve: string;
}

export async function getBudget(id: string, client: DbClient = prisma) {
  const budget = await client.budget.findUnique({
    where: { id },
    include: {
      responsibleUser: { select: { id: true, name: true, email: true } },
      revisionOf: { select: { id: true, name: true, status: true } },
      revisedBy: { select: { id: true, name: true, status: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        include: {
          analyticAccount: { select: { id: true, code: true, name: true, type: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  if (!budget) throw new NotFoundError("Budget", id);
  return budget;
}

/** The budget's lines shaped for the table, with the derived columns computed. */
export function toBudgetLineRows(
  lines: Awaited<ReturnType<typeof getBudget>>["lines"],
): BudgetLineRow[] {
  return lines.map((line) => {
    const planned = toMoney(line.plannedAmount);
    const achieved = toMoney(line.achievedAmount);
    const remaining = subtract(planned, achieved);

    return {
      id: line.id,
      analyticAccountId: line.analyticAccountId,
      analyticCode: line.analyticAccount.code,
      analyticName: line.analyticAccount.name,
      accountLabel: line.account ? `${line.account.code} · ${line.account.name}` : null,
      type: line.type,
      planned: toAmountString(planned),
      committed: toAmountString(line.committedAmount),
      achieved: toAmountString(achieved),
      achievedPercent: planned.isZero()
        ? null
        : Number(achieved.dividedBy(planned).times(100).toFixed(1)),
      toAchieve: toAmountString(remaining.isNegative() ? ZERO : remaining),
    };
  });
}

/**
 * The full revision chain, oldest first.
 *
 * Budgets are revised rather than edited, so the chain is the planning history.
 */
export async function getRevisionHistory(
  id: string,
  client: DbClient = prisma,
): Promise<{ id: string; name: string; status: BudgetStatus; createdAt: Date }[]> {
  const chain: { id: string; name: string; status: BudgetStatus; createdAt: Date }[] = [];
  const seen = new Set<string>();

  // Walk back to the original.
  let cursor: string | null = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const budget: {
      id: string;
      name: string;
      status: BudgetStatus;
      createdAt: Date;
      revisionOfId: string | null;
    } | null = await client.budget.findUnique({
      where: { id: cursor as string },
      select: { id: true, name: true, status: true, createdAt: true, revisionOfId: true },
    });
    if (!budget) break;

    chain.unshift({
      id: budget.id,
      name: budget.name,
      status: budget.status,
      createdAt: budget.createdAt,
    });
    cursor = budget.revisionOfId;
  }

  // Walk forward to the newest revision.
  cursor = id;
  while (cursor) {
    const next: { id: string; name: string; status: BudgetStatus; createdAt: Date } | null =
      await client.budget.findFirst({
        where: { revisionOfId: cursor },
        select: { id: true, name: true, status: true, createdAt: true },
      });
    if (!next || seen.has(next.id)) break;

    seen.add(next.id);
    chain.push(next);
    cursor = next.id;
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function buildLineData(tx: DbClient, lines: BudgetLineInput[]) {
  if (lines.length === 0) {
    throw new ValidationError("A budget needs at least one line.");
  }

  const analyticIds = [...new Set(lines.map((line) => line.analyticAccountId))];
  const analytics = await tx.analyticAccount.findMany({
    where: { id: { in: analyticIds } },
    select: { id: true, name: true, type: true, isArchived: true },
  });
  const byId = new Map(analytics.map((analytic) => [analytic.id, analytic]));

  for (const analyticId of analyticIds) {
    const analytic = byId.get(analyticId);
    if (!analytic) {
      throw new ValidationError(`Analytic account '${analyticId}' does not exist.`);
    }
    if (analytic.isArchived) {
      throw new ValidationError(`${analytic.name} is archived and cannot be budgeted against.`);
    }
  }

  // One line per analytic account keeps the report unambiguous.
  const duplicate = analyticIds.length !== lines.length;
  if (duplicate) {
    throw new ValidationError(
      "Each analytic account may appear only once on a budget. Combine the duplicate lines.",
    );
  }

  return lines.map((line) => ({
    analyticAccountId: line.analyticAccountId,
    accountId: line.accountId,
    // Denormalised so historic lines keep their classification even if the
    // analytic account is later re-typed.
    type: byId.get(line.analyticAccountId)!.type,
    plannedAmount: line.plannedAmount,
    committedAmount: "0",
    achievedAmount: "0",
  }));
}

export async function createBudget(
  tx: DbClient,
  input: BudgetInput,
  context: { userId?: string | null } = {},
): Promise<Budget> {
  if (input.periodEnd.getTime() < input.periodStart.getTime()) {
    throw new ValidationError("The budget period ends before it starts.", {
      fieldErrors: { periodEnd: "The end date must be on or after the start date." },
    });
  }

  const lines = await buildLineData(tx, input.lines);

  const budget = await tx.budget.create({
    data: {
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: BudgetStatus.DRAFT,
      responsibleUserId: input.responsibleUserId,
      lines: { create: lines },
    },
  });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "Budget",
      entityId: budget.id,
      summary: `Created budget ${budget.name}`,
    },
    context,
  );

  return budget;
}

/** Editing is only possible while the budget is a draft. */
export async function updateBudget(
  tx: DbClient,
  id: string,
  input: BudgetInput,
  context: { userId?: string | null } = {},
): Promise<Budget> {
  const existing = await tx.budget.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });
  if (!existing) throw new NotFoundError("Budget", id);

  if (!budgetPermissions(existing.status).canEdit) {
    throw new ConflictError(
      `Budget ${existing.name} is ${existing.status.toLowerCase()} and its figures can no longer be edited. Create a revision instead.`,
    );
  }

  const lines = await buildLineData(tx, input.lines);
  await tx.budgetLine.deleteMany({ where: { budgetId: id } });

  const budget = await tx.budget.update({
    where: { id },
    data: {
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      responsibleUserId: input.responsibleUserId,
      lines: { create: lines },
    },
  });

  await recordAudit(
    tx,
    { action: "update", entity: "Budget", entityId: id, summary: `Updated budget ${budget.name}` },
    context,
  );

  return budget;
}

/** DRAFT -> CONFIRMED. Locks the planned figures and starts tracking. */
export async function confirmBudget(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<Budget> {
  const existing = await tx.budget.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, _count: { select: { lines: true } } },
  });
  if (!existing) throw new NotFoundError("Budget", id);

  if (!budgetPermissions(existing.status).canConfirm) {
    throw new ConflictError(
      `Only a draft budget can be confirmed. ${existing.name} is ${existing.status.toLowerCase()}.`,
    );
  }
  if (existing._count.lines === 0) {
    throw new ValidationError("Add at least one line before confirming this budget.");
  }

  const budget = await tx.budget.update({
    where: { id },
    data: { status: BudgetStatus.CONFIRMED },
  });

  // Pick up anything already posted inside the period.
  await recomputeBudgetProgress(tx, id);

  await recordAudit(
    tx,
    {
      action: "confirm",
      entity: "Budget",
      entityId: id,
      summary: `Confirmed budget ${budget.name}`,
    },
    context,
  );

  return budget;
}

/**
 * CONFIRMED -> REVISED, creating a new DRAFT that supersedes it.
 *
 * The original is kept intact and marked REVISED: the planning history is
 * preserved rather than overwritten.
 */
export async function reviseBudget(
  tx: DbClient,
  id: string,
  lines: BudgetLineInput[],
  context: { userId?: string | null } = {},
): Promise<Budget> {
  const original = await tx.budget.findUnique({
    where: { id },
    include: { revisedBy: { select: { id: true } } },
  });
  if (!original) throw new NotFoundError("Budget", id);

  if (!budgetPermissions(original.status).canRevise) {
    throw new ConflictError(
      `Only a confirmed budget can be revised. ${original.name} is ${original.status.toLowerCase()}.`,
    );
  }
  if (original.revisedBy) {
    throw new ConflictError(`${original.name} has already been revised.`);
  }

  const lineData = await buildLineData(tx, lines);

  await tx.budget.update({ where: { id }, data: { status: BudgetStatus.REVISED } });

  // "Budget (rev 2)", "(rev 3)", ... derived from how far back the chain goes.
  const revisionNumber = (await countRevisions(tx, id)) + 2;
  const baseName = original.name.replace(/\s*\(rev \d+\)\s*$/i, "");

  const revision = await tx.budget.create({
    data: {
      name: `${baseName} (rev ${revisionNumber})`,
      periodStart: original.periodStart,
      periodEnd: original.periodEnd,
      status: BudgetStatus.DRAFT,
      responsibleUserId: original.responsibleUserId,
      revisionOfId: original.id,
      lines: { create: lineData },
    },
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "Budget",
      entityId: revision.id,
      summary: `Revised ${original.name} as ${revision.name}`,
      metadata: { revisionOfId: original.id },
    },
    context,
  );

  return revision;
}

async function countRevisions(client: DbClient, id: string): Promise<number> {
  let count = 0;
  let cursor: string | null = id;
  const seen = new Set<string>();

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    // Explicitly typed: the assignment back into `cursor` makes this recursive
    // for inference, which TypeScript cannot resolve on its own.
    const parent: { revisionOfId: string | null } | null = await client.budget.findUnique({
      where: { id: cursor as string },
      select: { revisionOfId: true },
    });
    cursor = parent?.revisionOfId ?? null;
    if (cursor) count += 1;
  }

  return count;
}

export async function cancelBudget(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<Budget> {
  const existing = await tx.budget.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });
  if (!existing) throw new NotFoundError("Budget", id);

  if (!budgetPermissions(existing.status).canCancel) {
    throw new ConflictError(
      `${existing.name} is ${existing.status.toLowerCase()} and cannot be cancelled.`,
    );
  }

  const budget = await tx.budget.update({
    where: { id },
    data: { status: BudgetStatus.CANCELLED },
  });

  await recordAudit(
    tx,
    {
      action: "cancel",
      entity: "Budget",
      entityId: id,
      summary: `Cancelled budget ${budget.name}`,
    },
    context,
  );

  return budget;
}

// ---------------------------------------------------------------------------
// Derived figures
// ---------------------------------------------------------------------------

/**
 * Recomputes committed and achieved for every line of a budget.
 *
 *   achieved   posted journal items carrying the line's analytic account,
 *              inside the budget period. Income counts credit - debit;
 *              expense counts debit - credit, so both read as positive
 *              progress towards the plan.
 *
 *   committed  confirmed orders not yet posted to the ledger -- money the
 *              business has promised but not yet recognised.
 *
 * Derived, never typed in, so the budget report cannot disagree with the books.
 */
export async function recomputeBudgetProgress(tx: DbClient, id: string): Promise<void> {
  const budget = await tx.budget.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!budget) throw new NotFoundError("Budget", id);

  for (const line of budget.lines) {
    const [items, purchaseLines, salesLines] = await Promise.all([
      tx.journalItem.groupBy({
        by: ["analyticAccountId"],
        where: {
          analyticAccountId: line.analyticAccountId,
          ...(line.accountId ? { accountId: line.accountId } : {}),
          status: EntryStatus.POSTED,
          date: { gte: budget.periodStart, lte: budget.periodEnd },
        },
        _sum: { debit: true, credit: true },
      }),
      // Confirmed purchase orders not yet billed.
      tx.purchaseOrderLine.aggregate({
        where: {
          analyticAccountId: line.analyticAccountId,
          order: { status: "CONFIRMED", orderDate: { gte: budget.periodStart, lte: budget.periodEnd } },
        },
        _sum: { subtotal: true },
      }),
      // Confirmed sales orders not yet invoiced.
      tx.salesOrderLine.aggregate({
        where: {
          analyticAccountId: line.analyticAccountId,
          order: { status: "CONFIRMED", orderDate: { gte: budget.periodStart, lte: budget.periodEnd } },
        },
        _sum: { subtotal: true },
      }),
    ]);

    const totals = items[0];
    const debit = toMoney(totals?._sum.debit ?? 0);
    const credit = toMoney(totals?._sum.credit ?? 0);

    const achieved =
      line.type === "INCOME" ? subtract(credit, debit) : subtract(debit, credit);

    const committed =
      line.type === "INCOME"
        ? toMoney(salesLines._sum.subtotal ?? 0)
        : toMoney(purchaseLines._sum.subtotal ?? 0);

    await tx.budgetLine.update({
      where: { id: line.id },
      data: { achievedAmount: achieved, committedAmount: committed },
    });
  }
}

/**
 * The posted journal items behind a line's achieved figure.
 *
 * Backs the drill-down: every number on the budget report can be traced to the
 * entries that produced it.
 */
export async function getAchievedBreakdown(
  budgetId: string,
  lineId: string,
  client: DbClient = prisma,
) {
  const line = await client.budgetLine.findUnique({
    where: { id: lineId },
    include: {
      budget: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
      analyticAccount: { select: { code: true, name: true } },
    },
  });

  if (!line || line.budgetId !== budgetId) {
    throw new NotFoundError("Budget line", lineId);
  }

  const items = await client.journalItem.findMany({
    where: {
      analyticAccountId: line.analyticAccountId,
      ...(line.accountId ? { accountId: line.accountId } : {}),
      status: EntryStatus.POSTED,
      date: { gte: line.budget.periodStart, lte: line.budget.periodEnd },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      debit: true,
      credit: true,
      description: true,
      account: { select: { code: true, name: true } },
      contact: { select: { name: true } },
      journalEntry: {
        select: { id: true, number: true, sourceType: true, sourceId: true },
      },
    },
  });

  let running = ZERO;
  const rows = items.map((item) => {
    const contribution =
      line.type === "INCOME"
        ? subtract(toMoney(item.credit), toMoney(item.debit))
        : subtract(toMoney(item.debit), toMoney(item.credit));
    running = add(running, contribution);

    return {
      id: item.id,
      date: item.date,
      entryId: item.journalEntry.id,
      entryNumber: item.journalEntry.number,
      sourceType: item.journalEntry.sourceType,
      sourceId: item.journalEntry.sourceId,
      accountLabel: `${item.account.code} · ${item.account.name}`,
      contactName: item.contact?.name ?? null,
      description: item.description,
      debit: toAmountString(item.debit),
      credit: toAmountString(item.credit),
      contribution: toAmountString(contribution),
      runningTotal: toAmountString(running),
    };
  });

  return {
    line: {
      id: line.id,
      type: line.type,
      analyticLabel: `${line.analyticAccount.code} · ${line.analyticAccount.name}`,
      planned: toAmountString(line.plannedAmount),
      achieved: toAmountString(line.achievedAmount),
    },
    budget: line.budget,
    rows,
    total: toAmountString(running),
  };
}

/** Recomputes every budget that is currently being tracked. */
export async function recomputeActiveBudgets(tx: DbClient): Promise<number> {
  const budgets = await tx.budget.findMany({
    where: { status: { in: [BudgetStatus.CONFIRMED, BudgetStatus.DRAFT] } },
    select: { id: true },
  });

  for (const budget of budgets) {
    await recomputeBudgetProgress(tx, budget.id);
  }

  return budgets.length;
}

export type { Decimal };
