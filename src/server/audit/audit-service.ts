import { type Prisma } from "@prisma/client";
import { type DbClient } from "@/server/db/prisma";

/**
 * Audit trail for master data and document actions.
 *
 * Journal entries carry their own audit fields (`createdBy`, `postedBy`,
 * `postedAt`, `sourceType`/`sourceId`) and are immutable. This log covers
 * everything else: who created, changed or archived master data, and who moved
 * a document through its lifecycle.
 *
 * Takes the transaction client so an audit row commits with the change it
 * describes -- never separately.
 */

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "confirm"
  | "cancel"
  | "post"
  | "reverse"
  | "convert"
  | "pay";

export interface AuditContext {
  userId?: string | null;
}

export async function recordAudit(
  tx: DbClient,
  entry: {
    action: AuditAction;
    entity: string;
    entityId: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
  },
  context: AuditContext = {},
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: context.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      summary: entry.summary ?? null,
      metadata: entry.metadata,
    },
  });
}
