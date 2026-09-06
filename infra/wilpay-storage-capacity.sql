-- W.I.L Pay private storage capacity/read-path support.
-- Additive only: improves metadata/audit lookup and exposes metadata-only usage totals.
-- Safe to apply repeatedly; does not create, move, overwrite, or delete stored objects.

CREATE INDEX IF NOT EXISTS wilpay_private_files_owner_loan_type_status_created_idx
  ON wilpay.private_files (
    owner_user_id,
    loan_id,
    document_type,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS wilpay_file_audit_file_occurred_idx
  ON wilpay.file_audit_log (file_id, occurred_at DESC);

-- Capacity telemetry is derived exclusively from metadata for uploaded objects.
-- Archived/quarantined files remain counted because they can still occupy private
-- object storage until a separately approved physical-retention process removes them.
CREATE OR REPLACE VIEW wilpay.storage_usage_by_loan AS
SELECT
  owner_user_id,
  loan_id,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL) AS uploaded_file_count,
  COALESCE(sum(size_bytes) FILTER (WHERE uploaded_at IS NOT NULL), 0)::bigint AS uploaded_bytes,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'document') AS document_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'selfie') AS selfie_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'receipt') AS receipt_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'guarantee') AS guarantee_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'history') AS history_count,
  max(uploaded_at) AS latest_upload_at
FROM wilpay.private_files
GROUP BY owner_user_id, loan_id;

-- Per-client telemetry makes it possible to monitor growth across 1,000+ clients
-- without reading object contents or introducing another source of customer data.
CREATE OR REPLACE VIEW wilpay.storage_usage_by_owner AS
SELECT
  owner_user_id,
  count(DISTINCT loan_id) FILTER (WHERE uploaded_at IS NOT NULL) AS loan_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL) AS uploaded_file_count,
  COALESCE(sum(size_bytes) FILTER (WHERE uploaded_at IS NOT NULL), 0)::bigint AS uploaded_bytes,
  max(uploaded_at) AS latest_upload_at
FROM wilpay.private_files
GROUP BY owner_user_id;

-- Fleet-level totals support capacity planning while exposing no customer payloads.
CREATE OR REPLACE VIEW wilpay.storage_usage_total AS
SELECT
  count(DISTINCT owner_user_id) FILTER (WHERE uploaded_at IS NOT NULL) AS client_count,
  count(DISTINCT loan_id) FILTER (WHERE uploaded_at IS NOT NULL) AS loan_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL) AS uploaded_file_count,
  COALESCE(sum(size_bytes) FILTER (WHERE uploaded_at IS NOT NULL), 0)::bigint AS uploaded_bytes,
  max(uploaded_at) AS latest_upload_at
FROM wilpay.private_files;

-- Keep all capacity views isolated with the rest of the W.I.L Pay schema.
REVOKE ALL ON wilpay.storage_usage_by_loan FROM PUBLIC;
REVOKE ALL ON wilpay.storage_usage_by_owner FROM PUBLIC;
REVOKE ALL ON wilpay.storage_usage_total FROM PUBLIC;
