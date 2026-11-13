-- Full undo ONLY for a failed, otherwise unused first installation.
-- Silver runs after Nic approves. Never use after ANY Receipt exists.
-- For a forward transaction that failed before COMMIT, nothing was installed:
-- this script then safely does nothing. No CASCADE; unexpected dependencies abort.
BEGIN;
DO $$
BEGIN
 IF to_regnamespace('atlas_ai') IS NULL THEN RETURN; END IF;
 -- Same first lock as every application writer. Hold all nine tables until the
 -- transaction commits, so an operator or request cannot race the empty check.
 LOCK TABLE atlas_ai.runtime_config,atlas_ai.routing_config,atlas_ai.holder_leases,
  atlas_ai.grants,atlas_ai.session_leases,atlas_ai.quota_windows,
  atlas_ai.call_leases,atlas_ai.call_receipts,atlas_ai.grant_receipts
  IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM atlas_ai.call_receipts) OR EXISTS(SELECT 1 FROM atlas_ai.grant_receipts) THEN
  RAISE EXCEPTION 'Full undo refused: permanent Receipts exist; use access-off rollback';
 END IF;
 IF EXISTS(SELECT 1 FROM atlas_ai.call_leases) OR EXISTS(SELECT 1 FROM atlas_ai.session_leases)
  OR EXISTS(SELECT 1 FROM atlas_ai.grants) OR EXISTS(SELECT 1 FROM atlas_ai.holder_leases)
  OR EXISTS(SELECT 1 FROM atlas_ai.quota_windows WHERE calls_used<>0 OR reserved_microusd<>0 OR spent_microusd<>0) THEN
  RAISE EXCEPTION 'Full undo refused: lease or accounting activity exists; use access-off rollback';
 END IF;
 IF EXISTS(SELECT 1 FROM atlas_ai.runtime_config WHERE enabled)
  OR EXISTS(SELECT 1 FROM atlas_ai.routing_config WHERE enabled OR model_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Full undo refused: installation must still be disabled with null routes';
 END IF;
 -- Explicit FK order, no IF EXISTS masking a partially mismatched installation.
 -- Any unrecognized object/dependency makes DROP SCHEMA or DROP TABLE fail and
 -- the entire transaction roll back; existing external resources are preserved.
 DROP TABLE atlas_ai.call_leases;
 DROP TABLE atlas_ai.session_leases;
 DROP TABLE atlas_ai.grants;
 DROP TABLE atlas_ai.holder_leases;
 DROP TABLE atlas_ai.quota_windows;
 DROP TABLE atlas_ai.call_receipts;
 DROP TABLE atlas_ai.grant_receipts;
 DROP TABLE atlas_ai.routing_config;
 DROP TABLE atlas_ai.runtime_config;
 DROP SCHEMA atlas_ai;
END $$;
COMMIT;
-- Silver must also remove the newly deployed ai-proxy. No deployment automation.
-- If the forward migration was recorded by Supabase, Silver must reconcile ONLY
-- that migration's history through the supported tool after Nic approves, and
-- receipt that action. This file never edits Supabase's internal history tables.
