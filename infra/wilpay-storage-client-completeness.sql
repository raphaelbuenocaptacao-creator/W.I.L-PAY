-- W.I.L Pay private storage client completeness telemetry.
-- Additive/non-destructive and metadata-only: helps validate operational readiness
-- for at least 1,000 complete clients without reading file contents or signed URLs.

CREATE OR REPLACE VIEW wilpay.storage_client_completeness AS
SELECT
  owner_user_id,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL) AS uploaded_file_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'document') AS document_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'selfie') AS selfie_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'receipt') AS receipt_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'guarantee') AS guarantee_count,
  count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'history') AS history_count,
  coalesce(sum(size_bytes) FILTER (WHERE uploaded_at IS NOT NULL), 0)::bigint AS uploaded_bytes,
  bool_and(uploaded_at IS NOT NULL OR status = 'pending') AS lifecycle_known,
  (
    count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'document') > 0
    AND count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'selfie') > 0
    AND count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'receipt') > 0
    AND count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'guarantee') > 0
    AND count(*) FILTER (WHERE uploaded_at IS NOT NULL AND document_type = 'history') > 0
  ) AS storage_profile_complete
FROM wilpay.private_files
GROUP BY owner_user_id;

CREATE OR REPLACE VIEW wilpay.storage_client_readiness_summary AS
SELECT
  count(*)::bigint AS clients_with_storage_metadata,
  count(*) FILTER (WHERE storage_profile_complete)::bigint AS complete_client_count,
  count(*) FILTER (WHERE NOT storage_profile_complete)::bigint AS incomplete_client_count,
  greatest(1000 - count(*) FILTER (WHERE storage_profile_complete), 0)::bigint AS complete_clients_remaining_to_1000,
  CASE
    WHEN count(*) FILTER (WHERE storage_profile_complete) >= 1000 THEN true
    ELSE false
  END AS complete_client_target_reached
FROM wilpay.storage_client_completeness;

-- These views expose operational identifiers and capacity signals only to explicitly
-- granted W.I.L Pay roles. No public/default role access is allowed.
REVOKE ALL ON wilpay.storage_client_completeness FROM PUBLIC;
REVOKE ALL ON wilpay.storage_client_readiness_summary FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_client_completeness IS
  'Metadata-only W.I.L Pay storage coverage per client across document, selfie, receipt, guarantee and history categories.';
COMMENT ON VIEW wilpay.storage_client_readiness_summary IS
  'Private readiness telemetry toward 1,000 clients with all five W.I.L Pay storage categories represented; does not imply provider quota availability.';
