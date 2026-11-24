-- Full rollback is for a migration that has never taken uploads. After use,
-- stop the gateway at the deployment layer and preserve bytes and Receipts.
-- Hosted objects are removed by owner action through Storage, never SQL.
BEGIN;
LOCK TABLE atlas_sources.owner_allotments, atlas_sources.uploads,
  atlas_sources.upload_receipts, atlas_sources.egress_totals IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_sources.uploads)
    OR EXISTS (SELECT 1 FROM atlas_sources.upload_receipts)
    OR EXISTS (SELECT 1 FROM atlas_sources.egress_totals)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'atlas-user-uploads')
  THEN
    RAISE EXCEPTION 'The uploads rollback would remove objects or their accounting history. Disable the gateway and preserve the schema.';
  END IF;
END;
$$;
DROP POLICY atlas_user_uploads_gateway_only ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'atlas-user-uploads';
DROP SCHEMA atlas_sources CASCADE;
COMMIT;
