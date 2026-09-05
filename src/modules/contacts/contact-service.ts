import { type Contact, ContactType, type Prisma } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { archiveWhere, searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type ContactInput, type ContactSortField } from "./schemas";

/**
 * Contact master data service.
 *
 * All business rules live here; server actions only authorise, validate and
 * delegate. Contacts are archived, never deleted: they are referenced by
 * journal items and documents that must stay resolvable forever.
 */

export interface ContactListRow {
  id: string;
  name: string;
  type: ContactType;
  email: string | null;
  mobile: string | null;
  city: string | null;
  state: string | null;
  profileImage: string | null;
  isArchived: boolean;
  hasPortalUser: boolean;
}

function buildWhere(params: ListParams<ContactSortField>): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {
    ...archiveWhere(params.filters.status),
  };

  if (params.filters.type) {
    where.type = params.filters.type as ContactType;
  }

  if (params.search) {
    Object.assign(where, searchWhere(params.search, ["name", "email", "mobile", "city"]));
  }

  return where;
}

export async function listContacts(
  params: ListParams<ContactSortField>,
  client: DbClient = prisma,
): Promise<{ rows: ContactListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.contact.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        mobile: true,
        city: true,
        state: true,
        profileImage: true,
        isArchived: true,
        portalUser: { select: { id: true } },
      },
    }),
    client.contact.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      name: record.name,
      type: record.type,
      email: record.email,
      mobile: record.mobile,
      city: record.city,
      state: record.state,
      profileImage: record.profileImage,
      isArchived: record.isArchived,
      hasPortalUser: Boolean(record.portalUser),
    })),
  };
}

export async function getContact(id: string, client: DbClient = prisma): Promise<Contact> {
  const contact = await client.contact.findUnique({ where: { id } });
  if (!contact) throw new NotFoundError("Contact", id);
  return contact;
}

/** Contacts selectable as a vendor on purchase documents. */
export async function listVendorOptions(client: DbClient = prisma) {
  return client.contact.findMany({
    where: { isArchived: false, type: { in: [ContactType.VENDOR, ContactType.BOTH] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Contacts selectable as a customer on sales documents. */
export async function listCustomerOptions(client: DbClient = prisma) {
  return client.contact.findMany({
    where: { isArchived: false, type: { in: [ContactType.CUSTOMER, ContactType.BOTH] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Rejects a duplicate name, which in practice always means a mistaken
 * re-entry. Names are not unique in the database (two real people can share
 * one), so this is a service-level guard rather than a constraint.
 */
async function assertNameAvailable(
  client: DbClient,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await client.contact.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`A contact named "${name}" already exists.`, {
      fieldErrors: { name: "A contact with this name already exists." },
    });
  }
}

export async function createContact(
  tx: DbClient,
  input: ContactInput,
  context: { userId?: string | null } = {},
): Promise<Contact> {
  await assertNameAvailable(tx, input.name);

  const contact = await tx.contact.create({ data: input });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "Contact",
      entityId: contact.id,
      summary: `Created contact ${contact.name}`,
    },
    context,
  );

  return contact;
}

export async function updateContact(
  tx: DbClient,
  id: string,
  input: ContactInput,
  context: { userId?: string | null } = {},
): Promise<Contact> {
  const existing = await getContact(id, tx);
  await assertNameAvailable(tx, input.name, id);

  // Narrowing a BOTH contact is only safe if the side being removed is unused.
  await assertTypeChangeAllowed(tx, existing, input.type);

  const contact = await tx.contact.update({ where: { id }, data: input });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "Contact",
      entityId: id,
      summary: `Updated contact ${contact.name}`,
    },
    context,
  );

  return contact;
}

/**
 * A contact used as a vendor cannot become customer-only, and vice versa --
 * that would leave existing documents pointing at a contact that is no longer
 * valid for them.
 */
async function assertTypeChangeAllowed(
  client: DbClient,
  existing: Contact,
  nextType: ContactType,
): Promise<void> {
  if (existing.type === nextType) return;

  if (nextType === ContactType.CUSTOMER) {
    const purchases = await client.purchaseOrder.count({ where: { vendorId: existing.id } });
    const bills = await client.vendorBill.count({ where: { vendorId: existing.id } });

    if (purchases + bills > 0) {
      throw new ConflictError(
        `${existing.name} is used as a vendor on ${purchases + bills} document(s) and cannot be changed to Customer only.`,
        { fieldErrors: { type: "This contact is already used as a vendor." } },
      );
    }
  }

  if (nextType === ContactType.VENDOR) {
    const orders = await client.salesOrder.count({ where: { customerId: existing.id } });
    const invoices = await client.customerInvoice.count({ where: { customerId: existing.id } });

    if (orders + invoices > 0) {
      throw new ConflictError(
        `${existing.name} is used as a customer on ${orders + invoices} document(s) and cannot be changed to Vendor only.`,
        { fieldErrors: { type: "This contact is already used as a customer." } },
      );
    }
  }
}

/**
 * Archives or restores a contact.
 *
 * Archiving hides a contact from new documents. It never deletes: accounting
 * history keeps referencing it, and reports must still be able to name it.
 */
export async function setContactArchived(
  tx: DbClient,
  id: string,
  isArchived: boolean,
  context: { userId?: string | null } = {},
): Promise<Contact> {
  const existing = await getContact(id, tx);

  if (existing.isArchived === isArchived) return existing;

  const contact = await tx.contact.update({ where: { id }, data: { isArchived } });

  await recordAudit(
    tx,
    {
      action: isArchived ? "archive" : "restore",
      entity: "Contact",
      entityId: id,
      summary: `${isArchived ? "Archived" : "Restored"} contact ${contact.name}`,
    },
    context,
  );

  return contact;
}

/**
 * How many accounting records reference this contact.
 *
 * Used by the detail page to explain why a contact can only be archived. There
 * is deliberately no hard-delete path in this system.
 */
export async function countContactReferences(
  id: string,
  client: DbClient = prisma,
): Promise<number> {
  const [purchaseOrders, vendorBills, salesOrders, invoices, payments, journalItems] =
    await Promise.all([
      client.purchaseOrder.count({ where: { vendorId: id } }),
      client.vendorBill.count({ where: { vendorId: id } }),
      client.salesOrder.count({ where: { customerId: id } }),
      client.customerInvoice.count({ where: { customerId: id } }),
      client.payment.count({ where: { contactId: id } }),
      client.journalItem.count({ where: { contactId: id } }),
    ]);

  return purchaseOrders + vendorBills + salesOrders + invoices + payments + journalItems;
}

/** Guard used by any future delete path. Accounting history is never removed. */
export async function assertContactDeletable(client: DbClient, id: string): Promise<void> {
  const references = await countContactReferences(id, client);

  if (references > 0) {
    throw new ValidationError(
      `This contact is referenced by ${references} accounting record(s) and cannot be deleted. Archive it instead.`,
    );
  }
}
