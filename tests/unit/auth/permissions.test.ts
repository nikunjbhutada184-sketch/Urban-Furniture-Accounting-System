import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  type Actor,
  assertOwnership,
  assertPermission,
  can,
  canAccessContact,
  canAll,
  getAccessScope,
  scopeToWhere,
} from "@/server/auth/permissions";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";

const admin: Actor = { id: "u_admin", role: UserRole.ADMIN };
const accountant: Actor = { id: "u_acct", role: UserRole.ACCOUNTANT };
const contactUser: Actor = { id: "u_nimesh", role: UserRole.CONTACT, contactId: "contact_nimesh" };
const orphanContact: Actor = { id: "u_orphan", role: UserRole.CONTACT, contactId: null };

describe("ADMIN access", () => {
  it("has full access, including administration", () => {
    expect(
      canAll(admin, [
        "master:view",
        "master:create",
        "master:update",
        "master:archive",
        "transaction:post",
        "transaction:reverse",
        "payment:post",
        "report:view",
        "budget:manage",
        "user:manage",
        "settings:manage",
        "audit:view",
      ]),
    ).toBe(true);
  });

  it("passes assertPermission without throwing", () => {
    expect(() => assertPermission(admin, "user:manage")).not.toThrow();
  });
});

describe("ACCOUNTANT access", () => {
  it("can create master data, record transactions and view reports", () => {
    expect(
      canAll(accountant, [
        "master:view",
        "master:create",
        "master:update",
        "transaction:create",
        "transaction:post",
        "payment:create",
        "payment:post",
        "report:view",
        "budget:manage",
      ]),
    ).toBe(true);
  });

  it("cannot manage users or company settings", () => {
    expect(can(accountant, "user:manage")).toBe(false);
    expect(can(accountant, "settings:manage")).toBe(false);
    expect(() => assertPermission(accountant, "user:manage")).toThrow(ForbiddenError);
  });

  it("cannot archive master data or reverse a posted entry", () => {
    expect(can(accountant, "master:archive")).toBe(false);
    expect(can(accountant, "transaction:reverse")).toBe(false);
  });

  it("reports a helpful error naming the role and permission", () => {
    try {
      assertPermission(accountant, "settings:manage");
      expect.unreachable("accountant must not hold settings:manage");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
      expect((error as ForbiddenError).message).toContain("ACCOUNTANT");
      expect((error as ForbiddenError).message).toContain("settings:manage");
    }
  });
});

describe("CONTACT isolation", () => {
  it("holds only the two portal permissions", () => {
    expect(can(contactUser, "portal:view-own")).toBe(true);
    expect(can(contactUser, "portal:pay-own")).toBe(true);
  });

  it("cannot reach back-office capabilities", () => {
    for (const permission of [
      "master:view",
      "master:create",
      "transaction:view",
      "transaction:create",
      "transaction:post",
      "payment:view",
      "report:view",
      "budget:view",
      "user:manage",
      "settings:manage",
      "audit:view",
    ] as const) {
      expect(can(contactUser, permission)).toBe(false);
    }
  });

  it("can access only its own contact", () => {
    expect(canAccessContact(contactUser, "contact_nimesh")).toBe(true);
    expect(canAccessContact(contactUser, "contact_priya")).toBe(false);
  });

  it("throws when reaching for another contact's data", () => {
    expect(() => assertOwnership(contactUser, "contact_nimesh")).not.toThrow();
    expect(() => assertOwnership(contactUser, "contact_priya")).toThrow(ForbiddenError);
  });

  it("scopes every query to its own contact id", () => {
    expect(getAccessScope(contactUser)).toEqual({
      kind: "contact",
      contactId: "contact_nimesh",
    });
    expect(scopeToWhere(getAccessScope(contactUser))).toEqual({ contactId: "contact_nimesh" });
  });

  it("fails closed when the portal user has no linked contact", () => {
    expect(getAccessScope(orphanContact)).toEqual({ kind: "none" });
    expect(canAccessContact(orphanContact, "contact_nimesh")).toBe(false);
    // An impossible filter, never an open one.
    expect(scopeToWhere(getAccessScope(orphanContact))).toEqual({ contactId: "__no_access__" });
  });
});

describe("back-office scoping", () => {
  it("lets ADMIN and ACCOUNTANT see every contact", () => {
    for (const actor of [admin, accountant]) {
      expect(getAccessScope(actor)).toEqual({ kind: "all" });
      expect(scopeToWhere(getAccessScope(actor))).toEqual({});
      expect(canAccessContact(actor, "contact_anyone")).toBe(true);
    }
  });
});

describe("unauthenticated callers", () => {
  it("are denied every permission", () => {
    expect(can(null, "report:view")).toBe(false);
    expect(can(undefined, "portal:view-own")).toBe(false);
  });

  it("receive UnauthenticatedError (401), not ForbiddenError", () => {
    try {
      assertPermission(null, "report:view");
      expect.unreachable("a signed-out caller must not be authorised");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthenticatedError);
      expect((error as UnauthenticatedError).status).toBe(401);
      expect((error as UnauthenticatedError).code).toBe("UNAUTHENTICATED");
    }
  });

  it("get a closed scope", () => {
    expect(getAccessScope(null)).toEqual({ kind: "none" });
    expect(canAccessContact(null, "contact_nimesh")).toBe(false);
    expect(() => assertOwnership(null, "contact_nimesh")).toThrow(UnauthenticatedError);
  });
});
