-- W.I.L Pay private storage object-count forecast.
-- Additive and metadata-only. This complements byte-capacity planning by estimating
-- how many private objects are required for at least 1,000 complete clients.

CREATE OR REPLACE VIEW wilpay.storage_object_count_forecast AS
WITH per_client AS (
  SELECT
    owner_user_id,
    count(*) FILTER (WHERE status IN ('active','archived'))::bigint AS retained_objects
  FROM wilpay.private_files
  GROUP BY owner_user_id
), complete_clients AS (
  SELECT p.owner_user_id, p.retained_objects
  FROM per_client p
  JOIN wilpay.storage_client_completeness c
    ON c.owner_user_id = p.owner_user_id
  WHERE c.is_complete
), stats AS (
  SELECT
    count(*)::bigint AS sampled_complete_clients,
    coalesce(avg(retained_objects), 0)::numeric(12,2) AS avg_objects_per_complete_client,
    coalesce(
      percentile_cont(0.95) WITHIN GROUP (ORDER BY retained_objects),
      0
    )::numeric(12,2) AS p95_objects_per_complete_client,
    coalesce(max(retained_objects), 0)::bigint AS max_objects_per_complete_client
  FROM complete_clients
)
SELECT
  sampled_complete_clients,
  avg_objects_per_complete_client,
  p95_objects_per_complete_client,
  max_objects_per_complete_client,
  greatest(5000::numeric, ceil(p95_objects_per_complete_client * 1000))::bigint AS projected_objects_for_1000_clients,
  greatest(6250::numeric, ceil(p95_objects_per_complete_client * 1000 * 1.25))::bigint AS recommended_objects_for_1000_clients_with_25pct_headroom,
  sampled_complete_clients >= 30 AS forecast_sample_ready
FROM stats;

REVOKE ALL ON wilpay.storage_object_count_forecast FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_object_count_forecast IS
  'Metadata-only private object-count forecast for W.I.L Pay. Uses complete-client p95 and never reads document contents or signed URLs.';
