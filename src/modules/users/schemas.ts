import { UserRole } from "@prisma/client";
import { z } from "zod";
import { optionalId, requiredText } from "@/modules/shared/zod-helpers";

/**
 * User account validation.
 *
 * One definition of "valid", shared by the sign-up form, the admin's create
 * user form and the server actions behind both. The rules come straight from
 * the specification:
 *
 *   1. Login id is unique and between 6 and 12 characters.
 *   2. Email must not already exist in the database.
 *   3. Password must contain a lower case letter, an upper case letter and a
 *      special character, and be longer than 8 characters.
 *
 * Uniqueness (1 and 2) cannot be decided by a schema -- it is checked against
 * the database inside `user-service`, which is also where the race is closed
 * by the unique indexes themselves.
 */

export const LOGIN_ID_MIN = 6;
export const LOGIN_ID_MAX = 12;
/** "More than 8 characters" -- so nine is the shortest acceptable password. */
export const PASSWORD_MIN = 9;

export const PASSWORD_RULES = [
  "More than 8 characters",
  "At least one lower case letter",
  "At least one upper case letter",
  "At least one special character",
] as const;

/**
 * A login id: letters, digits, dot, underscore or hyphen. Lower-cased so
 * "Rahul" and "rahul" can never become two different accounts.
 */
export const loginIdSchema = z
  .string({ required_error: "Login id is required." })
  .trim()
  .min(LOGIN_ID_MIN, `Login id must be between ${LOGIN_ID_MIN} and ${LOGIN_ID_MAX} characters.`)
  .max(LOGIN_ID_MAX, `Login id must be between ${LOGIN_ID_MIN} and ${LOGIN_ID_MAX} characters.`)
  .regex(/^[A-Za-z0-9._-]+$/, "Login id can only use letters, digits, dot, underscore or hyphen.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ required_error: "Password is required." })
  .min(PASSWORD_MIN, "Password must be more than 8 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[a-z]/, "Password must contain a lower case letter.")
  .regex(/[A-Z]/, "Password must contain an upper case letter.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character.");

export const emailSchema = z
  .string({ required_error: "Email is required." })
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

/** Shared "password twice" shape, so both forms report the mismatch the same way. */
function withPasswordConfirmation<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      password: passwordSchema,
      confirmPassword: z.string({ required_error: "Re-enter the password." }),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: "The two passwords do not match.",
      path: ["confirmPassword"],
    });
}

/**
 * Public sign-up.
 *
 * Self-service registration only ever creates an invoicing (portal) user --
 * a role is never something the visitor can choose.
 */
export const signUpSchema = withPasswordConfirmation({
  loginId: loginIdSchema,
  email: emailSchema,
  name: z.string().trim().max(160).optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/** Roles an administrator may hand out on the create user screen. */
export const CREATABLE_ROLES = [
  {
    value: UserRole.ADMIN,
    label: "Administrator",
    description: "Full access, including users, settings and archiving.",
  },
  {
    value: UserRole.ACCOUNTANT,
    label: "Accountant",
    description: "Master data, transactions, payments and reports.",
  },
  {
    value: UserRole.CONTACT,
    label: "User",
    description: "Portal only: sees and pays their own invoices and bills.",
  },
] as const;

export const createUserSchema = withPasswordConfirmation({
  name: requiredText("Name", 160),
  loginId: loginIdSchema,
  email: emailSchema,
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Choose a role." }),
  }),
  /** Only meaningful for the portal role: which contact this login can see. */
  contactId: optionalId(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrator",
  [UserRole.ACCOUNTANT]: "Accountant",
  [UserRole.CONTACT]: "User",
};
