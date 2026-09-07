-- W.I.L Pay private storage object-capacity budget.
-- Additive and metadata-only. Provider object quota remains NULL until the dedicated
-- W.I.L Pay storage service is provisioned and its real object limit is confirmed.

CREATE TABLE IF NOT EXISTS wilpay.storage_object_capacity_config (
  config_key text PRIMARY KEY CHECK (config_key = 'primary'),
  target_complete_clients integer NOT NULL DEFAULT 1000 CHECK (target_complete_clients >= 1000),
  reserve_percent numeric(5,2) NOT NULL DEFAULT 25.00 CHECK (reserve_percent >= 20 AND reserve_percent <= 100),
  provider_object_quota bigint CHECK (provider_object_quota IS NULL OR provider_object_quota > 0),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wilpay_object_quota_verification_pair CHECK (
    (provider_object_quota IS NULL AND verified_at IS NULL)
    OR (provider_object_quota IS NOT NULL AND verified_at IS NOT NULL)
  )
);

INSERT INTO wilpay.storage_object_capacity_config (
  config_key, target_complete_clients, reserve_percent, provider_object_quota, verified_at
)
VALUES ('primary', 1000, 25.00, NULL, NULL)
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE VIEW wilpay.storage_object_capacity_readiness AS
WITH required AS (
  SELECT
    c.config_key,
    c.target_complete_clients,
    c.reserve_percent,
    c.provider_object_quota,
    c.verified_at,
    f.sampled_complete_clients,
    f.p95_objects_per_complete_client,
    f.forecast_sample_ready,
    greatest(
      ceil(c.target_complete_clients * 5 * (1 + c.reserve_percent / 100.0)),
      ceil(c.target_complete_clients * f.p95_objects_per_complete_client * (1 + c.reserve_percent / 100.0))
    )::bigint AS required_objects_with_reserve
  FROM wilpay.storage_object_capacity_config c
  CROSS JOIN wilpay.storage_object_count_forecast f
  WHERE c.config_key = 'primary'
)
SELECT
  target_complete_clients,
  reserve_percent,
  provider_object_quota,
  verified_at,
  sampled_complete_clients,
  p95_objects_per_complete_client,
  required_objects_with_reserve,
  forecast_sample_ready,
  CASE
    WHEN provider_object_quota IS NULL THEN 'UNCONFIGURED'
    WHEN NOT forecast_sample_ready THEN 'INSUFFICIENT_SAMPLE'
    WHEN provider_object_quota >= required_objects_with_reserve THEN 'READY'
    ELSE 'INSUFFICIENT_OBJECT_QUOTA'
  END AS object_capacity_status,
  CASE
    WHEN provider_object_quota IS NULL THEN NULL
    ELSE provider_object_quota - required_objects_with_reserve
  END AS object_quota_margin
FROM required;

REVOKE ALL ON wilpay.storage_object_capacity_config FROM PUBLIC;
REVOKE ALL ON wilpay.storage_object_capacity_readiness FROM PUBLIC;

COMMENT ON TABLE wilpay.storage_object_capacity_config IS
  'Dedicated W.I.L Pay private-storage object quota settings. Keep provider_object_quota NULL until the exclusive provider limit is verified.';
COMMENT ON VIEW wilpay.storage_object_capacity_readiness IS
  'Fail-closed object-capacity readiness for at least 1,000 complete W.I.L Pay clients using metadata-only p95 object counts and configured reserve.';
