-- W.I.L Pay private file lifecycle guard.
-- Additive/non-destructive: protects new writes without rewriting legacy rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_lifecycle_consistent'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_lifecycle_consistent CHECK (
        (status = 'pending' AND uploaded_at IS NULL AND archived_at IS NULL)
        OR (status IN ('active','quarantined') AND uploaded_at IS NOT NULL AND archived_at IS NULL)
        OR (status = 'archived' AND uploaded_at IS NOT NULL AND archived_at IS NOT NULL)
      ) NOT VALID;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT wilpay_private_files_lifecycle_consistent ON wilpay.private_files IS
  'Prevents impossible file lifecycle states while preserving legacy rows until separately reviewed.';
