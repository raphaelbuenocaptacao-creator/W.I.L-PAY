-- W.I.L Pay private storage reconciliation helpers.
-- Additive/non-destructive: detects stale pending uploads and legacy lifecycle anomalies.
-- Stores/reads metadata only; never object bytes or signed URLs.

CREATE INDEX IF NOT EXISTS wilpay_private_files_pending_created_idx
  ON wilpay.private_files (created_at ASC)
  WHERE status = 'pending';

CREATE OR REPLACE VIEW wilpay.storage_stale_pending_uploads AS
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
  created_at,
  now() - created_at AS pending_age
FROM wilpay.private_files
WHERE status = 'pending'
  AND uploaded_at IS NULL
  AND archived_at IS NULL
  AND created_at < now() - interval '15 minutes';

CREATE OR REPLACE VIEW wilpay.storage_lifecycle_anomalies AS
SELECT
  file_id,
  owner_user_id,
  loan_id,
  document_type,
  status,
  created_at,
  uploaded_at,
  archived_at
FROM wilpay.private_files
WHERE NOT (
  (status = 'pending' AND uploaded_at IS NULL AND archived_at IS NULL)
  OR (status IN ('active','quarantined') AND uploaded_at IS NOT NULL AND archived_at IS NULL)
  OR (status = 'archived' AND uploaded_at IS NOT NULL AND archived_at IS NOT NULL)
);

-- Reconciliation surfaces contain operational identifiers and remain private.
REVOKE ALL ON wilpay.storage_stale_pending_uploads FROM PUBLIC;
REVOKE ALL ON wilpay.storage_lifecycle_anomalies FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_stale_pending_uploads IS
  'W.I.L Pay metadata rows still pending after 15 minutes; review storage state before any cleanup.';
COMMENT ON VIEW wilpay.storage_lifecycle_anomalies IS
  'Read-only detector for legacy file metadata that does not satisfy the current lifecycle contract.';
