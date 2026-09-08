-- W.I.L Pay private-storage attachment history integrity gate.
-- Additive and metadata-only. It never deletes or rewrites existing files.
-- Purpose: preserve a complete document/selfie/receipt/guarantee/history trail while
-- allowing the application to identify ambiguous active versions before granting access.

CREATE OR REPLACE VIEW wilpay.storage_history_integrity AS
WITH version_sets AS (
  SELECT
    owner_user_id,
    loan_id,
    document_type,
    count(*) AS total_versions,
    count(*) FILTER (WHERE status = 'active') AS active_versions,
    count(*) FILTER (WHERE status = 'archived') AS archived_versions,
    count(*) FILTER (WHERE status = 'quarantined') AS quarantined_versions,
    min(created_at) AS first_version_at,
    max(created_at) AS latest_version_at,
    bool_and(checksum_sha256 ~ '^[a-f0-9]{64}$') AS checksums_valid,
    bool_and(object_key LIKE 'wilpay/users/%/loans/%') AS object_scope_valid
  FROM wilpay.private_files
  GROUP BY owner_user_id, loan_id, document_type
)
SELECT
  owner_user_id,
  loan_id,
  document_type,
  total_versions,
  active_versions,
  archived_versions,
  quarantined_versions,
  first_version_at,
  latest_version_at,
  checksums_valid,
  object_scope_valid,
  CASE
    WHEN total_versions < 1 THEN 'EMPTY_HISTORY'
    WHEN active_versions > 1 THEN 'MULTIPLE_ACTIVE_VERSIONS'
    WHEN NOT checksums_valid THEN 'INVALID_CHECKSUM'
    WHEN NOT object_scope_valid THEN 'INVALID_OBJECT_SCOPE'
    WHEN active_versions = 0 AND quarantined_versions > 0 THEN 'QUARANTINED_ONLY'
    WHEN active_versions = 0 AND archived_versions > 0 THEN 'ARCHIVED_ONLY'
    WHEN active_versions = 1 THEN 'READY'
    ELSE 'REVIEW_REQUIRED'
  END AS history_status,
  (
    total_versions >= 1
    AND active_versions = 1
    AND checksums_valid
    AND object_scope_valid
  ) AS history_ready
FROM version_sets;

REVOKE ALL ON wilpay.storage_history_integrity FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_history_integrity IS
  'W.I.L Pay metadata-only history gate. Preserves every stored version and flags ambiguous active versions, invalid checksums or invalid tenant/object scope without destructive cleanup.';
