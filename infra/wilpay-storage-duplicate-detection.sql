-- W.I.L Pay private storage duplicate/retry detector.
-- Additive and non-destructive: identifies likely duplicate uploaded objects using
-- metadata only so operators can review storage waste before any manual cleanup.

CREATE INDEX IF NOT EXISTS wilpay_private_files_checksum_uploaded_idx
  ON wilpay.private_files (owner_user_id, loan_id, checksum_sha256, size_bytes, content_type)
  WHERE uploaded_at IS NOT NULL;

CREATE OR REPLACE VIEW wilpay.storage_duplicate_upload_candidates AS
SELECT
  owner_user_id,
  loan_id,
  checksum_sha256,
  size_bytes,
  content_type,
  count(*)::bigint AS duplicate_file_count,
  min(uploaded_at) AS first_uploaded_at,
  max(uploaded_at) AS latest_uploaded_at,
  array_agg(file_id ORDER BY uploaded_at, file_id) AS file_ids
FROM wilpay.private_files
WHERE uploaded_at IS NOT NULL
  AND status IN ('active', 'quarantined', 'archived')
GROUP BY owner_user_id, loan_id, checksum_sha256, size_bytes, content_type
HAVING count(*) > 1;

-- Operational identifiers and checksums are private even though no file bytes,
-- object keys, signed URLs, credentials, or customer document contents are exposed.
REVOKE ALL ON wilpay.storage_duplicate_upload_candidates FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_duplicate_upload_candidates IS
  'Metadata-only detector for repeated uploads with identical checksum/size/type inside the same W.I.L Pay client loan. Review manually; never deletes objects.';
