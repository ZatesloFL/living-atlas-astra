-- Read-only verification by Silver after applying the named implementation.
-- No provider secrets, visitor text or existing-project records are selected.
BEGIN READ ONLY;
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='atlas_ai' AND c.relkind='r';
 IF n<>9 THEN RAISE EXCEPTION 'Expected nine atlas_ai tables'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='atlas_ai' AND c.relkind='r' AND NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'RLS must be enabled on every atlas_ai table';
 END IF;
 IF has_schema_privilege('anon','atlas_ai','USAGE') OR has_schema_privilege('authenticated','atlas_ai','USAGE') THEN
  RAISE EXCEPTION 'Public roles must not access atlas_ai';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM atlas_ai.runtime_config WHERE id=true AND NOT enabled AND expires_at>now()
   AND public_origin='https://zateslofl.github.io') THEN RAISE EXCEPTION 'Expected valid disabled master configuration'; END IF;
 SELECT count(*) INTO n FROM atlas_ai.routing_config;
 IF n<>5 OR EXISTS(SELECT 1 FROM atlas_ai.routing_config WHERE enabled OR model_id IS NOT NULL OR billing_contract IS NOT NULL) THEN
  RAISE EXCEPTION 'Expected five disabled null model routes';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='atlas_ai') THEN RAISE EXCEPTION 'Unexpected public table policy'; END IF;
END $$;
SELECT table_name FROM information_schema.tables WHERE table_schema='atlas_ai' ORDER BY table_name;
SELECT enabled,public_origin,public_day_calls,public_day_microusd,all_jobs_day_microusd,
 provider_month_microusd,new_holders_per_day,expires_at FROM atlas_ai.runtime_config;
SELECT route_key,provider,enabled,model_id FROM atlas_ai.routing_config ORDER BY route_key;
SELECT current_setting('pgrst.db_schemas',true) AS database_exposed_schema_setting;
-- NULL here is not proof. Silver must also inspect the project's actual Data API
-- exposed schemas in its configuration; atlas_ai must not appear there.
COMMIT;
