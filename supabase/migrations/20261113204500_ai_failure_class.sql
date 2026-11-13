-- Round 2d diagnosis. Silver applies after Nic approves, before the new bundle.
-- Additive and backward compatible: old function instances may omit this column.
-- Existing receipts stay unchanged; NULL means accepted or historically unclassified.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT id FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE;
ALTER TABLE atlas_ai.call_receipts
 ADD COLUMN failure_class text,
 ADD CONSTRAINT call_receipts_failure_class_allowed CHECK (failure_class IS NULL OR failure_class IN (
  'provider_key_missing','provider_request_failed','provider_response_invalid',
  'provider_usage_invalid','provider_output_incomplete','provider_content_invalid',
  'proposal_json_invalid','proposal_schema_invalid','evidence_block_not_visible',
  'evidence_quote_not_exact','builder_validation_failed','dispatch_recheck_failed',
  'result_recheck_failed','accounting_bound_exceeded','reservation_expired',
  'dispatch_outcome_unknown','unclassified_rejection'
 )),
 ADD CONSTRAINT call_receipts_failure_class_rejected CHECK (NOT validation_passed OR failure_class IS NULL);
COMMIT;
