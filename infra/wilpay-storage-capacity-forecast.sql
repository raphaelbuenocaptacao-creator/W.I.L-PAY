-- W.I.L Pay private storage capacity forecast.
-- Additive and metadata-only: estimates object-storage demand for 1,000 complete clients.
-- It does not inspect object contents, expose signed URLs, mutate metadata, or claim provider quota.

CREATE OR REPLACE VIEW wilpay.storage_capacity_forecast AS
WITH complete_clients AS (
  SELECT uploaded_bytes::numeric AS uploaded_bytes
  FROM wilpay.storage_client_completeness
  WHERE storage_profile_complete
),
stats AS (
  SELECT
    count(*)::bigint AS sampled_complete_clients,
    COALESCE(avg(uploaded_bytes), 0)::numeric AS avg_bytes_per_complete_client,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY uploaded_bytes), 0)::numeric AS p95_bytes_per_complete_client,
    COALESCE(max(uploaded_bytes), 0)::numeric AS max_bytes_per_complete_client
  FROM complete_clients
)
SELECT
  sampled_complete_clients,
  round(avg_bytes_per_complete_client)::bigint AS avg_bytes_per_complete_client,
  round(p95_bytes_per_complete_client)::bigint AS p95_bytes_per_complete_client,
  round(max_bytes_per_complete_client)::bigint AS max_bytes_per_complete_client,
  round(avg_bytes_per_complete_client * 1000)::bigint AS projected_1000_clients_avg_bytes,
  round(p95_bytes_per_complete_client * 1000)::bigint AS projected_1000_clients_p95_bytes,
  round(p95_bytes_per_complete_client * 1000 * 1.25)::bigint AS recommended_1000_clients_bytes_with_25pct_headroom,
  (sampled_complete_clients >= 30) AS forecast_sample_ready
FROM stats;

REVOKE ALL ON wilpay.storage_capacity_forecast FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_capacity_forecast IS
  'Metadata-only W.I.L Pay forecast for 1,000 complete clients using observed average and p95 bytes/client plus 25% headroom. Provider quota must be verified separately.';
