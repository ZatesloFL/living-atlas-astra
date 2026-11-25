-- Roll back an unused feature. If photo processing already issued Receipts,
-- roll back the serving code and preserve the proof chain and its schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT id FROM atlas_ai.runtime_config WHERE id = true FOR UPDATE;
LOCK TABLE atlas_sources.photo_proposals IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_sources.photo_proposals)
    OR EXISTS (SELECT 1 FROM atlas_ai.call_receipts WHERE agent = 'upload-declaration-helper')
    OR EXISTS (SELECT 1 FROM atlas_ai.grant_receipts WHERE authority = 'owner-upload-photo-policy')
  THEN RAISE EXCEPTION 'Photo assessment Receipts exist. Roll back serving code and preserve the proof chain.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION atlas_sources.publish_upload(
  p_owner_id text, p_upload_id uuid, p_scores jsonb, p_proposal_provenance jsonb DEFAULT NULL
) RETURNS atlas_sources.uploads
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  u atlas_sources.uploads;
  receipt_id uuid;
  published_time timestamptz;
BEGIN
  IF NOT atlas_sources.valid_scores(p_scores) THEN RAISE EXCEPTION 'SCORES_INVALID'; END IF;
  IF p_proposal_provenance IS NOT NULL THEN
    IF jsonb_typeof(p_proposal_provenance) <> 'object'
      OR (p_proposal_provenance - ARRAY['provider','model','receiptId']) <> '{}'::jsonb
    THEN RAISE EXCEPTION 'UPLOAD_INVALID'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_proposal_provenance) v
      WHERE jsonb_typeof(v.value) <> 'string' OR (v.value #>> '{}') !~ '^[a-zA-Z0-9:._/-]{1,128}$')
    THEN RAISE EXCEPTION 'UPLOAD_INVALID'; END IF;
  END IF;

  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state = 'published' THEN
    IF ROW(u.scores, u.proposal_provenance) IS DISTINCT FROM ROW(p_scores, p_proposal_provenance)
    THEN RAISE EXCEPTION 'UPLOAD_CONFLICT'; END IF;
    RETURN u;
  END IF;
  IF u.state <> 'uploaded' THEN RAISE EXCEPTION 'UPLOAD_STATE_CONFLICT'; END IF;

  published_time := clock_timestamp();
  INSERT INTO atlas_sources.upload_receipts
    (upload_id, owner_id, place_id, source_id, action, time, original_bytes,
      preview_bytes, content_sha256, preview_sha256, scores, proposal_provenance)
  VALUES (u.id, u.owner_id, u.place_id, u.source_id, 'declared', published_time,
    u.original_bytes, u.preview_bytes, u.content_sha256, u.preview_sha256, p_scores, p_proposal_provenance)
  RETURNING id INTO receipt_id;
  UPDATE atlas_sources.uploads SET state = 'published', published_at = published_time,
    declaration_receipt_id = receipt_id, scores = p_scores, proposal_provenance = p_proposal_provenance
  WHERE id = u.id RETURNING * INTO u;
  RETURN u;
END;
$$;

DROP FUNCTION atlas_sources.photo_provenance(text, uuid, uuid);
DROP FUNCTION atlas_sources.save_photo_proposal(text, uuid, uuid, jsonb);
DROP FUNCTION atlas_sources.get_photo_proposal(text, uuid);
DROP TABLE atlas_sources.photo_proposals;
DROP FUNCTION atlas_sources.valid_photo_proposal(jsonb);

ALTER TABLE atlas_ai.call_receipts
  DROP CONSTRAINT call_receipts_agent_check,
  ADD CONSTRAINT call_receipts_agent_check CHECK (agent IN ('docent-silver', 'gus-benchmark'));
ALTER TABLE atlas_ai.grant_receipts
  DROP CONSTRAINT grant_receipts_authority_check,
  ADD CONSTRAINT grant_receipts_authority_check CHECK (
    authority IN ('approved-public-docent-policy', 'owner-approved-benchmark', 'operator-model-check')
  );
COMMIT;
