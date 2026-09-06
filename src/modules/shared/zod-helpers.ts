import { z } from "zod";

/**
 * Shared Zod building blocks.
 *
 * The same schemas validate on the server (in server actions) and describe the
 * form, so there is exactly one definition of what "valid" means. HTML forms
 * submit empty strings for untouched optional fields, so optional text is
 * normalised to `null` before it reaches the database.
 */

/** Required, trimmed text. */
export function requiredText(label: string, max = 200) {
  return z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

/** Optional text: empty string becomes `null`. */
export function optionalText(label: string, max = 200) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));
}

/** Optional email: empty is allowed, anything present must be a valid address. */
export function optionalEmail(label = "Email") {
  return z
    .union([z.literal(""), z.string().trim().email(`Enter a valid ${label.toLowerCase()}.`)])
    .optional()
    .transform((value) => (value && value.length > 0 ? value.toLowerCase() : null));
}

/** Optional URL, for image links. */
export function optionalUrl(label: string) {
  return z
    .union([z.literal(""), z.string().trim().url(`${label} must be a valid URL.`)])
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));
}

/**
 * An optional image location: either an absolute URL (hosted elsewhere) or a
 * site-relative upload path such as `/uploads/<uuid>.png`.
 *
 * Rejects anything else, so a form cannot smuggle in `javascript:` or a
 * traversal path.
 */
export function optionalUrlOrPath(label: string) {
  return z
    .union([z.literal(""), z.string().trim()])
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine(
      (value) =>
        value === null ||
        /^\/uploads\/[A-Za-z0-9._-]+$/.test(value) ||
        /^https?:\/\/\S+$/i.test(value),
      { message: `${label} must be an uploaded image or a http(s) URL.` },
    );
}

/** Optional foreign key: the form's "none" option and empty string become `null`. */
export function optionalId() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 && value !== "none" ? value : null));
}

/**
 * A monetary or quantity amount submitted as a string.
 *
 * Kept as a string all the way to Prisma so it becomes an exact NUMERIC -- it
 * is never parsed into a JavaScript number.
 */
export function decimalString(
  label: string,
  options: { scale?: number; min?: number; allowZero?: boolean } = {},
) {
  const { scale = 2, min = 0, allowZero = true } = options;
  const pattern = new RegExp(`^-?\\d{1,15}(\\.\\d{1,${scale}})?$`);

  return z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => pattern.test(value), {
      message: `${label} must be a number with at most ${scale} decimal places.`,
    })
    .refine((value) => Number(value) >= min, {
      message: min === 0 ? `${label} cannot be negative.` : `${label} must be at least ${min}.`,
    })
    .refine((value) => allowZero || Number(value) !== 0, {
      message: `${label} must be greater than zero.`,
    });
}

/** An optional amount that defaults to "0" when the field is left blank. */
export function optionalDecimalString(label: string, options: { scale?: number } = {}) {
  const { scale = 2 } = options;
  const pattern = new RegExp(`^\\d{1,15}(\\.\\d{1,${scale}})?$`);

  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "0"))
    .refine((value) => pattern.test(value), {
      message: `${label} must be a positive number with at most ${scale} decimal places.`,
    });
}

/** A date submitted by `<input type="date">` (YYYY-MM-DD), read as UTC midnight. */
export function dateString(label: string) {
  return z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must be a valid date.`)
    .transform((value) => new Date(`${value}T00:00:00.000Z`))
    .refine((value) => !Number.isNaN(value.getTime()), `${label} must be a valid date.`);
}

/** An optional date field. */
export function optionalDateString(label: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: `${label} must be a valid date.`,
    })
    .transform((value) => (value === null ? null : new Date(`${value}T00:00:00.000Z`)));
}

/** Turns a `FormData` into a plain object Zod can parse. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;

    const existing = object[key];
    if (existing === undefined) {
      object[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      object[key] = [existing, value];
    }
  }

  return object;
}
