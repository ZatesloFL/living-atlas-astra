-- File 19 explicitly authorizes output headroom. Data-only configuration patch:
-- no DDL, prices, models, monetary caps, grants, prompt or validator changes.
-- Commit this file and its rollback before applying to ftnxmuenqfqkodizyekk.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5s';
DO $$
DECLARE guide atlas_ai.routing_config%ROWTYPE;
BEGIN
 -- Match the proxy's lock order so reservations cannot race this adjustment.
 PERFORM 1 FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime configuration missing'; END IF;
 SELECT * INTO STRICT guide FROM atlas_ai.routing_config WHERE route_key='guide' FOR UPDATE;
 IF guide.provider<>'anthropic' OR guide.model_id IS DISTINCT FROM 'claude-haiku-5-5'
    OR NOT guide.enabled OR guide.output_token_cap<>512 THEN
  RAISE EXCEPTION 'Expected the enabled Haiku guide with 512 output tokens';
 END IF;
 IF EXISTS(SELECT 1 FROM atlas_ai.call_leases WHERE route_key='guide'
   AND state IN ('reserved','dispatched') AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'A guide call is in flight; wait for it to settle before applying';
 END IF;
 UPDATE atlas_ai.routing_config SET output_token_cap=2048 WHERE route_key='guide';
END $$;
COMMIT;
