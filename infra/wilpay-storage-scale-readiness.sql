-- W.I.L Pay private storage scale-readiness gate.
-- Additive and metadata-only. This view combines the verified byte and object-capacity
-- gates and fails closed when quotas are missing, samples are insufficient, configs
-- diverge, the configured target is below 1,000 complete clients, or provider verification is stale.

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
    WHEN b.target_complete_clients < 1000 THEN 'TARGET_BELOW_MINIMUM'
    WHEN b.capacity_status = 'UNVERIFIED_QUOTA' THEN 'BYTE_UNVERIFIED_QUOTA'
    WHEN o.object_capacity_status = 'UNVERIFIED_QUOTA' THEN 'OBJECT_UNVERIFIED_QUOTA'
    WHEN b.capacity_status = 'STALE_QUOTA_VERIFICATION' THEN 'BYTE_STALE_QUOTA_VERIFICATION'
    WHEN o.object_capacity_status = 'STALE_QUOTA_VERIFICATION' THEN 'OBJECT_STALE_QUOTA_VERIFICATION'
    WHEN b.provider_quota_bytes IS NULL OR o.provider_object_quota IS NULL THEN 'UNCONFIGURED'
    WHEN b.verified_at IS NULL THEN 'BYTE_UNVERIFIED_QUOTA'
    WHEN o.verified_at IS NULL THEN 'OBJECT_UNVERIFIED_QUOTA'
    WHEN b.verified_at < now() - interval '7 days' THEN 'BYTE_STALE_QUOTA_VERIFICATION'
    WHEN o.verified_at < now() - interval '7 days' THEN 'OBJECT_STALE_QUOTA_VERIFICATION'
    WHEN b.capacity_status = 'INSUFFICIENT_SAMPLE'
      OR o.object_capacity_status = 'INSUFFICIENT_SAMPLE' THEN 'INSUFFICIENT_SAMPLE'
    WHEN b.capacity_status = 'READY'
      AND o.object_capacity_status = 'READY' THEN 'READY'
    ELSE 'INSUFFICIENT_CAPACITY'
  END AS scale_readiness_status,
  (
    b.target_complete_clients = o.target_complete_clients
    AND b.target_complete_clients >= 1000
    AND b.reserve_percent = o.reserve_percent
    AND b.provider_quota_bytes IS NOT NULL
    AND o.provider_object_quota IS NOT NULL
    AND b.verified_at IS NOT NULL
    AND o.verified_at IS NOT NULL
    AND b.verified_at >= now() - interval '7 days'
    AND o.verified_at >= now() - interval '7 days'
    AND b.capacity_status = 'READY'
    AND o.object_capacity_status = 'READY'
  ) AS scale_ready
FROM wilpay.storage_capacity_readiness b
CROSS JOIN wilpay.storage_object_capacity_readiness o;

REVOKE ALL ON wilpay.storage_scale_readiness FROM PUBLIC;

COMMENT ON VIEW wilpay.storage_scale_readiness IS
  'Fail-closed W.I.L Pay private-storage scale gate. READY requires consistent configs, a target of at least 1,000 complete clients, byte/object quotas verified within the last 7 days, sufficient samples and capacity; unverified and stale quota states are propagated explicitly.';
