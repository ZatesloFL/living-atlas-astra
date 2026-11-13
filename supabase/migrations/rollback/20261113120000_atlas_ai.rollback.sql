-- Operational rollback, deliberately outside the forward migration glob.
-- Preserve permanent Receipts, pending accounting and all existing resources.
BEGIN;
SELECT id FROM atlas_ai.runtime_config WHERE id FOR UPDATE;
UPDATE atlas_ai.runtime_config SET enabled=false, revision=revision+1;
UPDATE atlas_ai.routing_config SET enabled=false, model_id=NULL;
INSERT INTO atlas_ai.grant_receipts(id,time,grant_id,action,scope,jobs,place_ids,expires_at,authority)
SELECT gen_random_uuid(),now(),id,'revoked',scope,jobs,place_ids,expires_at,
 CASE WHEN agent_ids=ARRAY['operator-model-check']::text[] THEN 'operator-model-check'
      WHEN agent_ids=ARRAY['docent-silver']::text[] THEN 'approved-public-docent-policy'
      ELSE 'owner-approved-benchmark' END
FROM atlas_ai.grants WHERE revoked_at IS NULL;
UPDATE atlas_ai.grants SET revoked_at=now() WHERE revoked_at IS NULL;
UPDATE atlas_ai.session_leases SET revoked_at=now() WHERE revoked_at IS NULL;
UPDATE atlas_ai.holder_leases SET revoked_at=now() WHERE revoked_at IS NULL;
COMMIT;
-- Silver also removes the ai-proxy deployment (no prior function may be replaced
-- during Stage A). A failed atomic forward migration needs no schema rollback.
-- Never drop atlas_ai or refund uncertain reservations merely to roll back.
