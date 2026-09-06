-- W.I.L Pay private object content-type guard.
-- Additive/non-destructive: protects new/updated rows without rewriting legacy rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wilpay_private_files_extension_matches_content_type'
      AND conrelid = 'wilpay.private_files'::regclass
  ) THEN
    ALTER TABLE wilpay.private_files
      ADD CONSTRAINT wilpay_private_files_extension_matches_content_type CHECK (
        (content_type = 'application/pdf' AND lower(object_key) ~ '[.]pdf$')
        OR (content_type = 'image/jpeg' AND lower(object_key) ~ '[.](jpg|jpeg)$')
        OR (content_type = 'image/png' AND lower(object_key) ~ '[.]png$')
        OR (content_type = 'image/webp' AND lower(object_key) ~ '[.]webp$')
      ) NOT VALID;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT wilpay_private_files_extension_matches_content_type ON wilpay.private_files IS
  'Requires the private object extension to match its declared MIME type, preventing misleading file names and unsafe viewer behavior.';
