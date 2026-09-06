import { ContactType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type CreateUserInput, type SignUpInput } from "./schemas";

/**
 * User accounts.
 *
 * Passwords are hashed here and nowhere else, and the uniqueness rules the
 * forms promise are enforced against the database rather than trusted from the
 * client. The unique indexes on `loginId` and `email` are the real guarantee;
 * the explicit look-ups exist to turn a violation into a message pinned to the
 * right field instead of a raw Prisma error.
 */

const BCRYPT_COST = 10;

/** A uniqueness failure the form should show next to the offending input. */
function fieldConflict(field: string, message: string): ConflictError {
  return new ConflictError(message, { fieldErrors: { [field]: message } });
}

/**
 * Rejects a login id or email that is already taken.
 *
 * `excludeUserId` lets the same check be reused when editing an existing user
 * without it colliding with itself.
 */
async function assertCredentialsAvailable(
  tx: DbClient,
  credentials: { loginId: string; email: string },
  excludeUserId?: string,
): Promise<void> {
  const clashes = await tx.user.findMany({
    where: {
      OR: [{ loginId: credentials.loginId }, { email: credentials.email }],
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true, loginId: true, email: true },
  });

  if (clashes.some((user) => user.loginId === credentials.loginId)) {
    throw fieldConflict("loginId", "That login id is already taken. Choose another.");
  }

  if (clashes.some((user) => user.email === credentials.email)) {
    throw fieldConflict("email", "An account with that email already exists.");
  }
}

/**
 * Creates a login for someone (administrator only).
 *
 * A portal user must be bound to exactly one contact, because that binding is
 * what `AccessScope` uses to keep them inside their own data. When no existing
 * contact is chosen, one is created from the user's own details so the account
 * is never left able to see nothing at all.
 */
export async function createUser(
  tx: DbClient,
  input: CreateUserInput,
  context: { actorId?: string | null } = {},
): Promise<{ id: string }> {
  await assertCredentialsAvailable(tx, { loginId: input.loginId, email: input.email });

  let contactId: string | null = null;

  if (input.role === UserRole.CONTACT) {
    if (input.contactId) {
      await assertContactIsUnlinked(tx, input.contactId);
      contactId = input.contactId;
    } else {
      contactId = await createContactForPortalUser(tx, input.name, input.email);
    }
  } else if (input.contactId) {
    // A back-office role has no business being bound to a contact; silently
    // dropping it would hide a mistake, so say so.
    throw new ValidationError("Only the portal role can be linked to a contact.");
  }

  const user = await tx.user.create({
    data: {
      name: input.name,
      loginId: input.loginId,
      email: input.email,
      role: input.role,
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_COST),
      contactId,
    },
    select: { id: true },
  });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "User",
      entityId: user.id,
      summary: `Created ${input.role} login '${input.loginId}'`,
    },
    { userId: context.actorId ?? null },
  );

  return user;
}

/**
 * Self-service registration.
 *
 * Only ever creates an invoicing (portal) user: the role is decided here, not
 * submitted by the browser, so a visitor cannot register themselves as an
 * administrator. A matching customer contact is created in the same
 * transaction, which is what the portal then scopes every query to.
 */
export async function signUpPortalUser(tx: DbClient, input: SignUpInput): Promise<{ id: string }> {
  await assertCredentialsAvailable(tx, { loginId: input.loginId, email: input.email });

  const name = input.name?.trim() || input.loginId;

  // Reuse a contact that already exists for this email -- a customer who was
  // invoiced before signing up should land on their own history, not a second
  // empty contact record.
  const existing = await tx.contact.findFirst({
    where: { email: input.email, isArchived: false, portalUser: { is: null } },
    select: { id: true },
  });

  const contactId = existing?.id ?? (await createContactForPortalUser(tx, name, input.email));

  const user = await tx.user.create({
    data: {
      name,
      loginId: input.loginId,
      email: input.email,
      role: UserRole.CONTACT,
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_COST),
      contactId,
    },
    select: { id: true },
  });

  await recordAudit(tx, {
    action: "create",
    entity: "User",
    entityId: user.id,
    summary: `Self sign-up '${input.loginId}'`,
  });

  return user;
}

async function createContactForPortalUser(
  tx: DbClient,
  name: string,
  email: string,
): Promise<string> {
  const contact = await tx.contact.create({
    data: { name, email, type: ContactType.CUSTOMER },
    select: { id: true },
  });

  return contact.id;
}

/** A contact may back at most one login -- `User.contactId` is unique. */
async function assertContactIsUnlinked(tx: DbClient, contactId: string): Promise<void> {
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, portalUser: { select: { id: true } } },
  });

  if (!contact) throw new NotFoundError("Contact", contactId);

  if (contact.portalUser) {
    throw fieldConflict("contactId", `${contact.name} already has a portal login.`);
  }
}

export interface UserListRow {
  id: string;
  name: string;
  loginId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  contactName: string | null;
  createdAt: Date;
}

/** Builds the WHERE shared by the list and its count, so they cannot diverge. */
function userWhere(filters: { search?: string; role?: UserRole }) {
  return {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { loginId: { contains: filters.search, mode: "insensitive" as const } },
            { email: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function countUsers(
  filters: { search?: string; role?: UserRole } = {},
  client: DbClient = prisma,
): Promise<number> {
  return client.user.count({ where: userWhere(filters) });
}

export async function listUsers(
  filters: { search?: string; role?: UserRole; skip?: number; take?: number } = {},
  client: DbClient = prisma,
): Promise<UserListRow[]> {
  const users = await client.user.findMany({
    where: userWhere(filters),
    ...(filters.skip === undefined ? {} : { skip: filters.skip }),
    ...(filters.take === undefined ? {} : { take: filters.take }),
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      loginId: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      contact: { select: { name: true } },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    loginId: user.loginId,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    contactName: user.contact?.name ?? null,
    createdAt: user.createdAt,
  }));
}

/** Contacts that do not yet have a portal login, for the create user form. */
export async function listLinkableContacts(
  client: DbClient = prisma,
): Promise<{ id: string; name: string; email: string | null }[]> {
  return client.contact.findMany({
    where: { isArchived: false, portalUser: { is: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

/** Deactivates or reactivates a login without losing the history behind it. */
export async function setUserActive(
  tx: DbClient,
  id: string,
  isActive: boolean,
  context: { actorId?: string | null } = {},
): Promise<{ id: string }> {
  const user = await tx.user.findUnique({ where: { id }, select: { id: true, loginId: true } });
  if (!user) throw new NotFoundError("User", id);

  if (!isActive && user.id === context.actorId) {
    throw new ValidationError("You cannot deactivate your own account.");
  }

  await tx.user.update({ where: { id }, data: { isActive } });

  await recordAudit(
    tx,
    {
      action: isActive ? "restore" : "archive",
      entity: "User",
      entityId: id,
      summary: `${isActive ? "Reactivated" : "Deactivated"} login '${user.loginId}'`,
    },
    { userId: context.actorId ?? null },
  );

  return { id };
}
