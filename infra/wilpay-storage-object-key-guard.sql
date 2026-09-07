-- W.I.L Pay canonical private object-key guard.
-- Additive and non-destructive: legacy rows are not rewritten or deleted.
-- New/updated rows must point to the exact object derived from metadata.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_canonical_object_key'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_canonical_object_key CHECK (
        object_key =
          'wilpay/users/' || owner_user_id ||
          '/loans/' || loan_id ||
          '/' || document_type ||
          '/' || file_id ||
          CASE content_type
            WHEN 'application/pdf' THEN '.pdf'
            WHEN 'image/jpeg' THEN '.jpg'
            WHEN 'image/png' THEN '.png'
            WHEN 'image/webp' THEN '.webp'
            ELSE ''
          END
      ) NOT VALID;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT wilpay_private_files_canonical_object_key
  ON wilpay.private_files IS
  'Binds each metadata row to exactly one W.I.L Pay private object path: owner/loan/type/fileId + MIME-derived extension.';
