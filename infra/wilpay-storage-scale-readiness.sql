-- W.I.L Pay private storage scale-readiness gate.
-- Additive and metadata-only. This view combines the verified byte and object-capacity
-- gates and fails closed when quotas are missing, samples are insufficient, configs
-- diverge, or provider verification is stale.

CREATE OR REPLACE VIEW wilpay.storage_scale_readiness AS
SELECT
  b.target_complete_clients,
  b.reserve_percent AS byte_reserve_percent,
  o.reserve_percent AS object_reserve_percent,
  b.provider_quota_bytes,
  o.provider_object_quota,
  b.forecast_required_bytes,
  o.required_objects_with_reserve,
  b.quota_margin_bytes,
  o.object_quota_margin,
  b.sampled_complete_clients AS byte_sampled_complete_clients,
  o.sampled_complete_clients AS object_sampled_complete_clients,
  b.verified_at AS byte_quota_verified_at,
  o.verified_at AS object_quota_verified_at,
  b.capacity_status AS byte_capacity_status,
  o.object_capacity_status,
  CASE
    WHEN b.target_complete_clients <> o.target_complete_clients
      OR b.reserve_percent <> o.reserve_percent THEN 'CONFIG_MISMATCH'
    WHEN b.provider_quota_bytes IS NULL OR o.provider_object_quota IS NULL THEN 'UNCONFIGURED'
    WHEN b.verified_at IS NULL OR o.verified_at IS NULL THEN 'UNCONFIGURED'
    WHEN b.verified_at < now() - interval '30 days'
      OR o.verified_at < now() - interval '30 days' THEN 'STALE_VERIFICATION'
    WHEN b.capacity_status = 'INSUFFICIENT_SAMPLE'
      OR o.object_capacity_status = 'INSUFFICIENT_SAMPLE' THEN 'INSUFFICIENT_SAMPLE'
    WHEN b.capacity_status = 'READY'
      AND o.object_capacity_status = 'READY' THEN 'READY'
    ELSE 'INSUFFICIENT_CAPACITY'
  END AS scale_readiness_status,
  (
    b.target_complete_clients = o.target_complete_clients
    AND b.reserve_percent = o.reserve_percent
    AND b.provider_quota_bytes IS NOT NULL
    AND o.provider_object_quota IS NOT NULL
    AND b.verified_at IS NOT NULL
    AND o.verified_at IS NOT NULL
    AND b.verified_at >= now() - interval '30 days'
    AND o.verified_at >= now() - interval '30 days'
    AND b.capacity_status = 'READY'
    AND o.object_capacity_status = 'READY'
  ) AS scale_ready
FROM wilpay.storage_capacity_readiness b
CROSS JOIN wilpay.storage_object_capacity_readiness o;

REVOKE ALL ON wilpay.storage_scale_readiness FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_scale_readiness IS
  'Fail-closed W.I.L Pay private-storage scale gate. READY requires consistent configs, fresh verified byte/object quotas, sufficient samples and capacity for at least 1,000 complete clients.';
