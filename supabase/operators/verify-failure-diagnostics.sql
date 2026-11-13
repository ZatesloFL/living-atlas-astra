-- Read-only; Silver runs after the additive migration, before redeploy/retest.
BEGIN READ ONLY;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='atlas_ai.call_receipts'::regclass
   AND attname='failure_class' AND atttypid='text'::regtype AND NOT attnotnull AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Expected nullable text failure_class';
 END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='atlas_ai.call_receipts'::regclass
   AND contype='c' AND convalidated AND conname IN ('call_receipts_failure_class_allowed','call_receipts_failure_class_rejected'))<>2 THEN
  RAISE EXCEPTION 'Expected both validated diagnostic constraints';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='atlas_ai.call_receipts'::regclass)
   OR has_schema_privilege('anon','atlas_ai','USAGE') OR has_schema_privilege('authenticated','atlas_ai','USAGE') THEN
  RAISE EXCEPTION 'Private receipt access must remain unchanged';
 END IF;
END $$;
SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
 WHERE conrelid='atlas_ai.call_receipts'::regclass
 AND conname IN ('call_receipts_failure_class_allowed','call_receipts_failure_class_rejected') ORDER BY conname;
SELECT id,time,job,model,agent,input_tokens,output_tokens,cost_microusd,cost_basis,
 validation_passed,result,failure_class FROM atlas_ai.call_receipts ORDER BY time DESC LIMIT 5;
COMMIT;
