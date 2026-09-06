import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it } from "vitest";
import { createUser, signUpPortalUser } from "@/modules/users/user-service";
import { ConflictError, ValidationError } from "@/server/errors";

/**
 * User creation against a real database.
 *
 * The interesting rules here are the ones a schema cannot decide: a login id
 * and an email must be unique across the table, a portal login must end up
 * bound to exactly one contact, and self-service registration must never be
 * able to mint anything but a portal user.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("user accounts (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  /** Unique per run, so repeated runs against the same database do not clash. */
  const suffix = Date.now().toString(36).slice(-6);
  const created: string[] = [];

  async function makeUser(overrides: Partial<Parameters<typeof createUser>[1]> = {}) {
    const user = await prisma.$transaction((tx) =>
      createUser(tx, {
        name: "Test Person",
        loginId: `u${suffix}a`,
        email: `u${suffix}a@example.test`,
        role: UserRole.ACCOUNTANT,
        password: "Abcdef12!",
        confirmPassword: "Abcdef12!",
        contactId: null,
        ...overrides,
      }),
    );

    created.push(user.id);
    return user;
  }

  afterAll(async () => {
    // Contacts created for portal logins go with them.
    const users = await prisma.user.findMany({
      where: { id: { in: created } },
      select: { id: true, contactId: true },
    });

    await prisma.auditLog.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.contact.deleteMany({
      where: {
        id: { in: users.map((user) => user.contactId).filter((id): id is string => id !== null) },
      },
    });

    await prisma.$disconnect();
  });

  it("hashes the password rather than storing it", async () => {
    const { id } = await makeUser();

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { passwordHash: true },
    });

    expect(stored.passwordHash).not.toBe("Abcdef12!");
    expect(bcrypt.compareSync("Abcdef12!", stored.passwordHash ?? "")).toBe(true);
  });

  it("refuses a duplicate login id, and says which field is at fault", async () => {
    const attempt = makeUser({
      loginId: `u${suffix}a`,
      email: `different-${suffix}@example.test`,
    });

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);

    await attempt.catch((error: ConflictError) => {
      expect((error.details as { fieldErrors: Record<string, string> }).fieldErrors).toHaveProperty(
        "loginId",
      );
    });
  });

  it("refuses a duplicate email", async () => {
    await expect(
      makeUser({ loginId: `u${suffix}zz`, email: `u${suffix}a@example.test` }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("binds a portal login to a contact, creating one when none is chosen", async () => {
    const { id } = await makeUser({
      role: UserRole.CONTACT,
      loginId: `p${suffix}a`,
      email: `p${suffix}a@example.test`,
      name: "Portal Person",
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { role: true, contactId: true, contact: { select: { name: true, type: true } } },
    });

    expect(user.role).toBe(UserRole.CONTACT);
    // Without a contact a portal user could see nothing at all, so one is
    // always present.
    expect(user.contactId).not.toBeNull();
    expect(user.contact?.name).toBe("Portal Person");
  });

  it("refuses to bind a back-office role to a contact", async () => {
    const contact = await prisma.contact.create({
      data: { name: `Spare ${suffix}`, type: "CUSTOMER" },
      select: { id: true },
    });

    await expect(
      makeUser({
        role: UserRole.ACCOUNTANT,
        loginId: `b${suffix}a`,
        email: `b${suffix}a@example.test`,
        contactId: contact.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await prisma.contact.delete({ where: { id: contact.id } });
  });

  it("refuses a contact that already backs another login", async () => {
    const first = await makeUser({
      role: UserRole.CONTACT,
      loginId: `p${suffix}b`,
      email: `p${suffix}b@example.test`,
    });

    const { contactId } = await prisma.user.findUniqueOrThrow({
      where: { id: first.id },
      select: { contactId: true },
    });

    await expect(
      makeUser({
        role: UserRole.CONTACT,
        loginId: `p${suffix}c`,
        email: `p${suffix}c@example.test`,
        contactId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("only ever creates a portal user on sign-up, whatever the form submits", async () => {
    const user = await prisma.$transaction((tx) =>
      signUpPortalUser(tx, {
        loginId: `s${suffix}a`,
        email: `s${suffix}a@example.test`,
        password: "Abcdef12!",
        confirmPassword: "Abcdef12!",
        name: "Self Signup",
      }),
    );

    created.push(user.id);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { role: true, contactId: true },
    });

    expect(stored.role).toBe(UserRole.CONTACT);
    expect(stored.contactId).not.toBeNull();
  });

  it("rolls the whole creation back when a later step fails", async () => {
    const before = await prisma.contact.count();

    await expect(
      makeUser({
        role: UserRole.CONTACT,
        // Duplicate email: the failure happens after the contact would have
        // been created, so the contact must not survive either.
        loginId: `r${suffix}a`,
        email: `u${suffix}a@example.test`,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await prisma.contact.count()).toBe(before);
  });
});
