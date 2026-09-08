-- W.I.L Pay backup readiness manifest.
-- Read-only observability for metadata/audit backup checks.
-- Safe to apply repeatedly; no destructive statements are included.

CREATE SCHEMA IF NOT EXISTS wilpay;

CREATE OR REPLACE VIEW wilpay.backup_readiness AS
SELECT
  now() AS checked_at,
  (SELECT count(*) FROM wilpay.private_files) AS private_file_rows,
  (SELECT count(*) FROM wilpay.file_audit_log) AS audit_rows,
  (SELECT max(created_at) FROM wilpay.private_files) AS latest_private_file_at,
  (SELECT max(occurred_at) FROM wilpay.file_audit_log) AS latest_audit_at,
  (SELECT count(*) FROM wilpay.private_files WHERE status = 'active') AS active_file_rows,
  (SELECT count(*) FROM wilpay.private_files WHERE status = 'quarantined') AS quarantined_file_rows,
  (SELECT count(*) FROM wilpay.private_files WHERE uploaded_at IS NULL AND status = 'active') AS active_without_upload_timestamp,
  (SELECT count(*) FROM wilpay.private_files WHERE checksum_sha256 IS NULL OR checksum_sha256 !~ '^[a-f0-9]{64}$') AS invalid_checksum_rows;

COMMENT ON VIEW wilpay.backup_readiness IS
  'W.I.L Pay metadata-only backup readiness counters. Contains no file bytes, signed URLs, credentials, tokens or personal document contents.';

-- Snapshot manifest query for an operator/backup job. This does not copy or delete
-- data; it provides a stable checkpoint that can be stored alongside an external
-- encrypted backup artifact.
CREATE OR REPLACE VIEW wilpay.backup_checkpoint AS
SELECT
  now() AS checkpoint_at,
  coalesce((SELECT max(file_id) FROM wilpay.private_files), '') AS max_file_id,
  coalesce((SELECT max(audit_id) FROM wilpay.file_audit_log), 0) AS max_audit_id,
  (SELECT count(*) FROM wilpay.private_files) AS private_file_rows,
  (SELECT count(*) FROM wilpay.file_audit_log) AS audit_rows;

COMMENT ON VIEW wilpay.backup_checkpoint IS
  'Non-sensitive checkpoint for verifying completeness of W.I.L Pay metadata and audit backups.';
