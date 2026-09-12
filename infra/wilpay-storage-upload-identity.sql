-- W.I.L Pay immutable upload identity upgrade.
-- Additive only: existing rows are not rewritten or deleted.
-- New uploads receive a server/database-generated UUID that can be carried through
-- storage verification to distinguish multiple object versions behind one file_id.

ALTER TABLE wilpay.private_files
  ADD COLUMN IF NOT EXISTS upload_id uuid;

ALTER TABLE wilpay.private_files
  ALTER COLUMN upload_id SET DEFAULT gen_random_uuid();

-- Legacy rows may remain NULL until they are explicitly migrated under an approved
-- infrastructure change. Every non-null upload identity is globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS wilpay_private_files_upload_id_uidx
  ON wilpay.private_files (upload_id)
  WHERE upload_id IS NOT NULL;

COMMENT ON COLUMN wilpay.private_files.upload_id IS
  'Immutable per-upload identity generated for new W.I.L Pay storage objects; legacy rows may be NULL until separately migrated.';
