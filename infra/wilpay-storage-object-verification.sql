-- W.I.L Pay private object verification evidence.
-- Additive/non-destructive: records only trusted Storage reconciliation metadata.
-- Object bytes, signed URLs and credentials never belong in Neon/AUREON metadata.

ALTER TABLE wilpay.private_files
  ADD COLUMN IF NOT EXISTS storage_verified_at timestamptz;
ALTER TABLE wilpay.private_files
  ADD COLUMN IF NOT EXISTS storage_verified_size_bytes bigint;
ALTER TABLE wilpay.private_files
  ADD COLUMN IF NOT EXISTS storage_verified_checksum_sha256 text;

-- A verification is usable only when the server-side reconciler recorded the full
-- evidence tuple after upload. NOT VALID preserves legacy rows while enforcing the
-- contract for every new or updated row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_storage_verification_consistent'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_storage_verification_consistent CHECK (
        (
          storage_verified_at IS NULL
          AND storage_verified_size_bytes IS NULL
          AND storage_verified_checksum_sha256 IS NULL
        )
        OR (
          storage_verified_at IS NOT NULL
          AND uploaded_at IS NOT NULL
          AND storage_verified_at >= uploaded_at
          AND storage_verified_size_bytes > 0
          AND storage_verified_checksum_sha256 ~ '^[a-f0-9]{64}$'
        )
      ) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS wilpay_private_files_unverified_active_idx
  ON wilpay.private_files (created_at ASC)
  WHERE status = 'active'
    AND uploaded_at IS NOT NULL
    AND (
      storage_verified_at IS NULL
      OR storage_verified_size_bytes IS NULL
      OR storage_verified_checksum_sha256 IS NULL
    );

CREATE OR REPLACE VIEW wilpay.storage_unverified_active_objects AS
SELECT
  file_id,
  owner_user_id,
  loan_id,
  document_type,
  storage_provider,
  bucket,
  object_key,
  size_bytes,
  checksum_sha256,
  uploaded_at,
  storage_verified_at,
  storage_verified_size_bytes,
  storage_verified_checksum_sha256
FROM wilpay.private_files
WHERE status = 'active'
  AND uploaded_at IS NOT NULL
  AND (
    storage_verified_at IS NULL
    OR storage_verified_at < uploaded_at
    OR storage_verified_size_bytes IS NULL
    OR storage_verified_size_bytes <> size_bytes
    OR storage_verified_checksum_sha256 IS NULL
    OR storage_verified_checksum_sha256 <> checksum_sha256
  );

REVOKE ALL ON wilpay.storage_unverified_active_objects FROM PUBLIC;

COMMENT ON COLUMN wilpay.private_files.storage_verified_at IS
  'Timestamp of the latest trusted server-side Storage object reconciliation.';
COMMENT ON COLUMN wilpay.private_files.storage_verified_size_bytes IS
  'Object size observed by the trusted Storage reconciler; must match size_bytes before operational completeness.';
COMMENT ON COLUMN wilpay.private_files.storage_verified_checksum_sha256 IS
  'Object checksum observed by the trusted Storage reconciler; must match checksum_sha256 before operational completeness.';
COMMENT ON VIEW wilpay.storage_unverified_active_objects IS
  'Active W.I.L Pay file metadata whose private Storage object has not been reconciled or no longer matches recorded size/checksum.';
