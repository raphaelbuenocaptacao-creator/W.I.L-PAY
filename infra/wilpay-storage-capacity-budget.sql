-- W.I.L Pay private storage capacity budget.
-- Additive and metadata-only. Provider quota is intentionally NULL until the dedicated
-- W.I.L Pay storage project is provisioned and its real quota is confirmed.

CREATE TABLE IF NOT EXISTS wilpay.storage_capacity_config (
  config_key text PRIMARY KEY CHECK (config_key = 'primary'),
  target_complete_clients integer NOT NULL DEFAULT 1000 CHECK (target_complete_clients >= 1000),
  reserve_percent numeric(5,2) NOT NULL DEFAULT 25.00 CHECK (reserve_percent >= 20 AND reserve_percent <= 100),
  provider_quota_bytes bigint CHECK (provider_quota_bytes IS NULL OR provider_quota_bytes > 0),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wilpay_capacity_quota_verification_pair CHECK (
    (provider_quota_bytes IS NULL AND verified_at IS NULL)
    OR (provider_quota_bytes IS NOT NULL AND verified_at IS NOT NULL)
  )
);

INSERT INTO wilpay.storage_capacity_config (
  config_key, target_complete_clients, reserve_percent, provider_quota_bytes, verified_at
)
VALUES ('primary', 1000, 25.00, NULL, NULL)
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE VIEW wilpay.storage_capacity_readiness AS
SELECT
  c.target_complete_clients,
  c.reserve_percent,
  c.provider_quota_bytes,
  c.verified_at,
  f.sampled_complete_clients,
  f.recommended_1000_clients_bytes_with_25pct_headroom AS forecast_required_bytes,
  f.forecast_sample_ready,
  CASE
    WHEN c.provider_quota_bytes IS NULL THEN 'UNCONFIGURED'
    WHEN NOT f.forecast_sample_ready THEN 'INSUFFICIENT_SAMPLE'
    WHEN c.provider_quota_bytes >= f.recommended_1000_clients_bytes_with_25pct_headroom THEN 'READY'
    ELSE 'INSUFFICIENT_QUOTA'
  END AS capacity_status,
  CASE
    WHEN c.provider_quota_bytes IS NULL THEN NULL
    ELSE c.provider_quota_bytes - f.recommended_1000_clients_bytes_with_25pct_headroom
  END AS quota_margin_bytes
FROM wilpay.storage_capacity_config c
CROSS JOIN wilpay.storage_capacity_forecast f
WHERE c.config_key = 'primary';

REVOKE ALL ON wilpay.storage_capacity_config FROM PUBLIC;
REVOKE ALL ON wilpay.storage_capacity_readiness FROM PUBLIC;

COMMENT ON TABLE wilpay.storage_capacity_config IS
  'Dedicated W.I.L Pay storage capacity settings. provider_quota_bytes must stay NULL until the real exclusive provider quota is verified.';
COMMENT ON VIEW wilpay.storage_capacity_readiness IS
  'Fail-closed readiness check comparing verified provider quota with the metadata-only forecast for at least 1,000 complete clients.';
