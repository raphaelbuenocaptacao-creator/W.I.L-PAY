-- W.I.L Pay private storage distribution telemetry.
-- Additive and metadata-only: helps validate capacity assumptions for 1,000+ clients
-- without reading object contents, changing quotas, or deleting stored objects.

CREATE OR REPLACE VIEW wilpay.storage_capacity_distribution AS
WITH owner_usage AS (
  SELECT uploaded_bytes
  FROM wilpay.storage_usage_by_owner
  WHERE uploaded_file_count > 0
),
stats AS (
  SELECT
    count(*)::bigint AS sampled_clients,
    COALESCE(sum(uploaded_bytes), 0)::bigint AS observed_bytes,
    COALESCE(avg(uploaded_bytes), 0)::numeric AS average_client_bytes,
    COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY uploaded_bytes), 0)::numeric AS p50_client_bytes,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY uploaded_bytes), 0)::numeric AS p95_client_bytes,
    COALESCE(max(uploaded_bytes), 0)::bigint AS largest_client_bytes
  FROM owner_usage
)
SELECT
  sampled_clients,
  observed_bytes,
  average_client_bytes,
  p50_client_bytes,
  p95_client_bytes,
  largest_client_bytes,
  CASE
    WHEN observed_bytes = 0 THEN 0::numeric
    ELSE round((largest_client_bytes::numeric / observed_bytes::numeric) * 100, 2)
  END AS largest_client_share_percent,
  sampled_clients >= 30 AS distribution_sample_ready
FROM stats;

REVOKE ALL ON wilpay.storage_capacity_distribution FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_capacity_distribution IS
  'Metadata-only client storage distribution telemetry (p50/p95/max) used to validate 1,000-client capacity assumptions and detect concentration before setting provider quota.';
