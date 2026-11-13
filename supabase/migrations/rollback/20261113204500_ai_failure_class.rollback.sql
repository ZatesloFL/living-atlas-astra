-- Silver first redeploys the prior bundle (5b290c0), confirms deployment and
-- lets in-flight requests finish. Never run this while the new bundle serves.
-- Preserve every recorded diagnostic. The nullable column is compatible with
-- the prior bundle and remains whenever diagnostics or in-flight calls exist.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT id FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='atlas_ai.call_receipts'::regclass
   AND attname='failure_class' AND NOT attisdropped) THEN RETURN; END IF;
 LOCK TABLE atlas_ai.call_receipts IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM atlas_ai.call_receipts WHERE failure_class IS NOT NULL)
   OR EXISTS(SELECT 1 FROM atlas_ai.call_leases WHERE state IN ('reserved','dispatched')) THEN RETURN; END IF;
 ALTER TABLE atlas_ai.call_receipts
  DROP CONSTRAINT call_receipts_failure_class_rejected,
  DROP CONSTRAINT call_receipts_failure_class_allowed,
  DROP COLUMN failure_class;
END $$;
SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='atlas_ai.call_receipts'::regclass
 AND attname='failure_class' AND NOT attisdropped) AS diagnostic_column_retained;
COMMIT;
-- No route, config, grant, receipt-row or quota changes. No CASCADE or backfill.
