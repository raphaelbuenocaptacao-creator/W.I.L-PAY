-- W.I.L Pay non-destructive upgrade for existing private_files installations.
-- Purpose: align legacy 15 MiB global metadata limits with current per-category limits.
-- This script never deletes rows, truncates tables, or drops schemas/tables.
-- It only replaces the known legacy CHECK constraint when its definition is exactly
-- the old global 15 MiB limit. Unknown constraints are left untouched (fail closed).

DO $$
DECLARE
  legacy_constraint_name text;
  legacy_constraint_definition text;
BEGIN
  IF to_regclass('wilpay.private_files') IS NULL THEN
    RAISE NOTICE 'wilpay.private_files does not exist; run the base metadata schema first';
    RETURN;
  END IF;

  -- Add the current rule first. NOT VALID avoids rewriting/rejecting historical rows,
  -- while PostgreSQL still enforces it for every new or updated row.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_category_size'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_category_size CHECK (
        size_bytes > 0
        AND size_bytes <= CASE document_type
          WHEN 'selfie' THEN 10485760
          WHEN 'receipt' THEN 10485760
          WHEN 'document' THEN 15728640
          WHEN 'history' THEN 15728640
          WHEN 'guarantee' THEN 20971520
          ELSE 0
        END
      ) NOT VALID;
  END IF;

  -- Locate only the auto-generated legacy CHECK from the former inline declaration.
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO legacy_constraint_name, legacy_constraint_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'wilpay.private_files'::regclass
    AND c.contype = 'c'
    AND c.conname = 'private_files_size_bytes_check'
  LIMIT 1;

  IF legacy_constraint_name IS NULL THEN
    RAISE NOTICE 'No known legacy global size constraint found; no constraint removed';
    RETURN;
  END IF;

  -- Fail closed if the known constraint name has been repurposed or altered.
  IF legacy_constraint_definition !~* 'size_bytes[^0-9]+0'
     OR legacy_constraint_definition !~* 'size_bytes[^0-9]+15728640'
     OR legacy_constraint_definition ~* 'case[[:space:]]+document_type' THEN
    RAISE EXCEPTION
      'Refusing to replace unexpected constraint definition for %',
      legacy_constraint_name;
  END IF;

  -- Safe widening path: the new category-specific constraint already protects all
  -- new/updated rows. Removing this exact legacy check does not delete or rewrite data.
  EXECUTE format(
    'ALTER TABLE wilpay.private_files DROP CONSTRAINT %I',
    legacy_constraint_name
  );
END;
$$;

COMMENT ON CONSTRAINT wilpay_private_files_category_size ON wilpay.private_files IS
  'Per-category private file metadata size limits: selfie/receipt 10 MiB, document/history 15 MiB, guarantee 20 MiB.';
