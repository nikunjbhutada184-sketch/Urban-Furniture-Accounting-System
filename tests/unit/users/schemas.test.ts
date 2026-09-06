import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  LOGIN_ID_MAX,
  LOGIN_ID_MIN,
  createUserSchema,
  loginIdSchema,
  passwordSchema,
  signUpSchema,
} from "@/modules/users/schemas";

/**
 * The credential rules from the specification, asserted directly.
 *
 * These are pure schemas, so they can be checked without a database. The
 * uniqueness half of the rules cannot live here -- it needs the database, and
 * is covered by the users integration test.
 */

function messagesFor(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);
}

describe("loginIdSchema", () => {
  it(`rejects a login id shorter than ${LOGIN_ID_MIN} characters`, () => {
    expect(loginIdSchema.safeParse("abc").success).toBe(false);
  });

  it(`rejects a login id longer than ${LOGIN_ID_MAX} characters`, () => {
    expect(loginIdSchema.safeParse("a".repeat(LOGIN_ID_MAX + 1)).success).toBe(false);
  });

  it("accepts the boundaries", () => {
    expect(loginIdSchema.safeParse("a".repeat(LOGIN_ID_MIN)).success).toBe(true);
    expect(loginIdSchema.safeParse("a".repeat(LOGIN_ID_MAX)).success).toBe(true);
  });

  it("lower-cases, so one person cannot become two accounts", () => {
    const result = loginIdSchema.safeParse("RahulS");
    expect(result.success && result.data).toBe("rahuls");
  });

  it("rejects characters that would make an ambiguous identifier", () => {
    expect(loginIdSchema.safeParse("rahul s").success).toBe(false);
    expect(loginIdSchema.safeParse("rahul@x").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("rejects a password of exactly eight characters -- the rule is MORE than eight", () => {
    expect(passwordSchema.safeParse("Abcdef1!").success).toBe(false);
    expect(passwordSchema.safeParse("Abcdef12!").success).toBe(true);
  });

  it("requires a lower case letter", () => {
    const result = passwordSchema.safeParse("ABCDEFGH1!");
    expect(messagesFor(result)).toContain("Password must contain a lower case letter.");
  });

  it("requires an upper case letter", () => {
    const result = passwordSchema.safeParse("abcdefgh1!");
    expect(messagesFor(result)).toContain("Password must contain an upper case letter.");
  });

  it("requires a special character", () => {
    const result = passwordSchema.safeParse("Abcdefgh12");
    expect(messagesFor(result)).toContain("Password must contain a special character.");
  });
});

describe("signUpSchema", () => {
  const valid = {
    loginId: "rahulsharma",
    email: "Rahul@Example.test",
    password: "Abcdef12!",
    confirmPassword: "Abcdef12!",
  };

  it("accepts a valid registration and normalises the email", () => {
    const result = signUpSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe("rahul@example.test");
  });

  it("reports a password mismatch against the confirmation field", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "Abcdef12?" });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("has no role field at all, so registration cannot ask for one", () => {
    const result = signUpSchema.safeParse({ ...valid, role: UserRole.ADMIN });
    expect(result.success).toBe(true);
    expect(result.success && "role" in result.data).toBe(false);
  });
});

describe("createUserSchema", () => {
  const valid = {
    name: "Priya Desai",
    loginId: "priyad",
    email: "priya@example.test",
    role: UserRole.ACCOUNTANT,
    password: "Abcdef12!",
    confirmPassword: "Abcdef12!",
  };

  it("accepts every role an administrator may hand out", () => {
    for (const role of [UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.CONTACT]) {
      expect(createUserSchema.safeParse({ ...valid, role }).success).toBe(true);
    }
  });

  it("rejects a role it does not recognise", () => {
    expect(createUserSchema.safeParse({ ...valid, role: "SUPERUSER" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(createUserSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("turns the form's 'none' contact option into null", () => {
    const result = createUserSchema.safeParse({ ...valid, contactId: "none" });
    expect(result.success && result.data.contactId).toBeNull();
  });
});
