-- W.I.L Pay private storage capacity pressure telemetry.
-- Additive and metadata-only. It never changes provider quota or deletes objects.
-- The view stays fail-closed until the dedicated W.I.L Pay provider quota is verified.

CREATE OR REPLACE VIEW wilpay.storage_capacity_pressure AS
SELECT
  r.target_complete_clients,
  r.provider_quota_bytes,
  r.verified_at,
  d.sampled_clients,
  d.observed_bytes,
  r.forecast_required_bytes,
  CASE
    WHEN r.provider_quota_bytes IS NULL OR r.provider_quota_bytes = 0 THEN NULL
    ELSE round((d.observed_bytes::numeric / r.provider_quota_bytes::numeric) * 100, 2)
  END AS observed_quota_percent,
  CASE
    WHEN r.provider_quota_bytes IS NULL OR r.provider_quota_bytes = 0 THEN NULL
    ELSE round((r.forecast_required_bytes::numeric / r.provider_quota_bytes::numeric) * 100, 2)
  END AS forecast_quota_percent,
  CASE
    WHEN r.provider_quota_bytes IS NULL THEN 'UNCONFIGURED'
    WHEN NOT r.forecast_sample_ready THEN 'INSUFFICIENT_SAMPLE'
    WHEN r.forecast_required_bytes >= r.provider_quota_bytes THEN 'CRITICAL'
    WHEN (r.forecast_required_bytes::numeric / r.provider_quota_bytes::numeric) >= 0.85 THEN 'HIGH'
    WHEN (r.forecast_required_bytes::numeric / r.provider_quota_bytes::numeric) >= 0.70 THEN 'WATCH'
    ELSE 'HEALTHY'
  END AS pressure_status,
  CASE
    WHEN r.provider_quota_bytes IS NULL THEN NULL
    ELSE GREATEST(r.provider_quota_bytes - d.observed_bytes, 0)
  END AS observed_headroom_bytes
FROM wilpay.storage_capacity_readiness r
CROSS JOIN wilpay.storage_capacity_distribution d;

REVOKE ALL ON wilpay.storage_capacity_pressure FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_capacity_pressure IS
  'Metadata-only W.I.L Pay storage pressure telemetry. Uses only a verified provider quota and reports observed/forecast utilization with fail-closed status thresholds.';
