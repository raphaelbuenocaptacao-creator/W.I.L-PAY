-- W.I.L Pay private storage identity guard.
-- Prevents existing file metadata from being repointed to another object, owner,
-- loan, checksum, provider, MIME type, or size after the row is created.
-- Non-destructive: existing rows are not rewritten and status/lifecycle fields remain mutable.

CREATE OR REPLACE FUNCTION wilpay.reject_private_file_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.file_id IS DISTINCT FROM OLD.file_id
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
    OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
    OR NEW.storage_scope IS DISTINCT FROM OLD.storage_scope
    OR NEW.bucket IS DISTINCT FROM OLD.bucket
    OR NEW.object_key IS DISTINCT FROM OLD.object_key
    OR NEW.content_type IS DISTINCT FROM OLD.content_type
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'W.I.L Pay private file identity is immutable after creation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'wilpay_private_file_identity_immutable'
      AND tgrelid = 'wilpay.private_files'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER wilpay_private_file_identity_immutable
      BEFORE UPDATE ON wilpay.private_files
      FOR EACH ROW
      EXECUTE FUNCTION wilpay.reject_private_file_identity_mutation();
  END IF;
END;
$$;

COMMENT ON FUNCTION wilpay.reject_private_file_identity_mutation() IS
  'Protects W.I.L Pay private file identity and object binding after creation while allowing lifecycle/status metadata updates.';
