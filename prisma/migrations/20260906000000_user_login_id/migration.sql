-- Sign-in identifier.
--
-- The sign-in form asks for a "Login Id" rather than an email address, so the
-- column has to exist, be unique, and be NOT NULL. Existing rows are backfilled
-- from the local part of their email (de-duplicated with a numeric suffix)
-- before the constraints go on, so no row is left without a way to sign in.

ALTER TABLE "users" ADD COLUMN "loginId" TEXT;

UPDATE "users" AS u
SET "loginId" = backfill.candidate
FROM (
  SELECT
    id,
    lower(regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9._-]', '', 'g'))
      || CASE
           WHEN row_number() OVER (
             PARTITION BY lower(regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9._-]', '', 'g'))
             ORDER BY "createdAt", id
           ) = 1 THEN ''
           ELSE row_number() OVER (
             PARTITION BY lower(regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9._-]', '', 'g'))
             ORDER BY "createdAt", id
           )::text
         END AS candidate
  FROM "users"
) AS backfill
WHERE u.id = backfill.id;

-- A login id must still be usable if the email local part was shorter than the
-- six characters the form requires.
UPDATE "users"
SET "loginId" = rpad("loginId", 6, '0')
WHERE length("loginId") < 6;

ALTER TABLE "users" ALTER COLUMN "loginId" SET NOT NULL;

CREATE UNIQUE INDEX "users_loginId_key" ON "users"("loginId");
