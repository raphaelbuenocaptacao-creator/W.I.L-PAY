-- W.I.L Pay private file metadata schema.
-- Stores metadata/IDs only. Binary file contents belong in private object storage.
-- Safe to apply repeatedly; no destructive statements are included.

CREATE SCHEMA IF NOT EXISTS wilpay;

CREATE TABLE IF NOT EXISTS wilpay.private_files (
  file_id text PRIMARY KEY,
  owner_user_id text NOT NULL,
  loan_id text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('document','selfie','receipt','guarantee','history')),
  storage_provider text NOT NULL,
  storage_scope text NOT NULL DEFAULT 'wilpay-private' CHECK (storage_scope = 'wilpay-private'),
  bucket text NOT NULL DEFAULT 'wilpay-private-documents' CHECK (bucket = 'wilpay-private-documents'),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','quarantined','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wilpay_object_key_scope CHECK (object_key LIKE 'wilpay/users/%/loans/%'),
  CONSTRAINT wilpay_object_key_owner_loan_scope CHECK (
    owner_user_id <> ''
    AND loan_id <> ''
    AND position('/' IN owner_user_id) = 0
    AND position('/' IN loan_id) = 0
    AND left(
      object_key,
      length('wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/')
    ) = 'wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/'
    AND length(object_key) > length('wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/')
  ),
  CONSTRAINT wilpay_private_files_metadata_safe CHECK (
    jsonb_typeof(metadata) = 'object'
    AND octet_length(metadata::text) <= 16384
    AND NOT (metadata ?| ARRAY[
      'data_url','signed_url','service_role','token','authorization',
      'file_bytes','base64','secret','password','api_key'
    ])
  )
);

-- Existing non-destructive installations also receive the tenant/loan binding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_object_key_owner_loan_scope'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_object_key_owner_loan_scope CHECK (
        owner_user_id <> ''
        AND loan_id <> ''
        AND position('/' IN owner_user_id) = 0
        AND position('/' IN loan_id) = 0
        AND left(
          object_key,
          length('wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/')
        ) = 'wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/'
        AND length(object_key) > length('wilpay/users/' || owner_user_id || '/loans/' || loan_id || '/')
      );
  END IF;
END;
$$;

-- New writes must not persist signed URLs, credentials, raw file payloads, or
-- oversized arbitrary JSON. NOT VALID avoids blocking rollout if legacy rows need
-- separate review while still enforcing the constraint for new/updated rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_metadata_safe'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_metadata_safe CHECK (
        jsonb_typeof(metadata) = 'object'
        AND octet_length(metadata::text) <= 16384
        AND NOT (metadata ?| ARRAY[
          'data_url','signed_url','service_role','token','authorization',
          'file_bytes','base64','secret','password','api_key'
        ])
      ) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS wilpay_private_files_owner_idx
  ON wilpay.private_files (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wilpay_private_files_loan_idx
  ON wilpay.private_files (loan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wilpay_private_files_status_idx
  ON wilpay.private_files (status, created_at DESC);

CREATE TABLE IF NOT EXISTS wilpay.file_audit_log (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_id text NOT NULL,
  actor_user_id text,
  action text NOT NULL CHECK (action IN ('grant_requested','upload_completed','view_granted','metadata_updated','quarantined','archived')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wilpay_file_audit_details_safe CHECK (
    jsonb_typeof(details) = 'object'
    AND octet_length(details::text) <= 8192
    AND NOT (details ?| ARRAY[
      'data_url','signed_url','service_role','token','authorization',
      'file_bytes','base64','secret','password','api_key'
    ])
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_file_audit_details_safe'
      AND conrelid = 'wilpay.file_audit_log'::regclass
  ) THEN
    ALTER TABLE wilpay.file_audit_log
      ADD CONSTRAINT wilpay_file_audit_details_safe CHECK (
        jsonb_typeof(details) = 'object'
        AND octet_length(details::text) <= 8192
        AND NOT (details ?| ARRAY[
          'data_url','signed_url','service_role','token','authorization',
          'file_bytes','base64','secret','password','api_key'
        ])
      ) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS wilpay_file_audit_file_idx
  ON wilpay.file_audit_log (file_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS wilpay_file_audit_actor_idx
  ON wilpay.file_audit_log (actor_user_id, occurred_at DESC);

-- Audit records are append-only. Application roles may INSERT audit events, but
-- any UPDATE or DELETE attempt is rejected at the database layer.
CREATE OR REPLACE FUNCTION wilpay.reject_file_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'W.I.L Pay file audit log is append-only';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'wilpay_file_audit_append_only'
      AND tgrelid = 'wilpay.file_audit_log'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER wilpay_file_audit_append_only
      BEFORE UPDATE OR DELETE ON wilpay.file_audit_log
      FOR EACH ROW
      EXECUTE FUNCTION wilpay.reject_file_audit_mutation();
  END IF;
END;
$$;

-- Fail closed for generic database roles. Application/server roles must be granted
-- only the minimum privileges they need by the infrastructure owner.
REVOKE ALL ON SCHEMA wilpay FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA wilpay FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA wilpay FROM PUBLIC;

COMMENT ON TABLE wilpay.private_files IS
  'W.I.L Pay file metadata only; never store document bytes, base64, data URLs, signed URLs, or credentials here.';
COMMENT ON COLUMN wilpay.private_files.object_key IS
  'Private storage object key bound to the metadata owner and loan. Signed URLs are generated on demand and are never persisted.';
COMMENT ON TABLE wilpay.file_audit_log IS
  'Append-only audit trail for private file lifecycle events; UPDATE and DELETE are rejected by trigger.';
