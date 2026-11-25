-- Roll back an unused audio review setup. Real AI Receipts remain proof of
-- actual usage even when a provider rejected a call or review text expired.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT id FROM atlas_ai.runtime_config WHERE id = true FOR UPDATE;
LOCK TABLE atlas_sources.audio_proposals, atlas_sources.audio_transcripts IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_sources.audio_proposals)
    OR EXISTS (SELECT 1 FROM atlas_sources.audio_transcripts)
    OR EXISTS (SELECT 1 FROM atlas_ai.call_receipts
      WHERE agent = 'upload-declaration-helper' AND model = 'openai/gpt-transcribe')
    OR EXISTS (SELECT 1 FROM atlas_ai.grant_receipts WHERE authority = 'owner-upload-review-policy')
  THEN RAISE EXCEPTION 'Audio review Receipts exist. Roll back serving code and preserve the proof chain.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION atlas_sources.save_photo_proposal(
  p_owner_id text, p_upload_id uuid, p_receipt_id uuid, p_proposal jsonb
) RETURNS atlas_sources.photo_proposals
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  upload atlas_sources.uploads;
  saved atlas_sources.photo_proposals;
  linked record;
BEGIN
  IF NOT atlas_sources.valid_photo_proposal(p_proposal) THEN
    RAISE EXCEPTION 'PHOTO_ASSESSMENT_MISMATCH';
  END IF;

  SELECT u.* INTO upload FROM atlas_sources.uploads u
  WHERE u.id = p_upload_id AND u.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR upload.state NOT IN ('uploaded', 'published')
    OR upload.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
  THEN
    -- A photo can be deleted during the provider call. Keep the accounting
    -- Receipt while returning no evidence that could authorize publication.
    RETURN NULL;
  END IF;

  -- The gateway cannot exchange one accepted Receipt for another upload's.
  -- This short-lived binding is consumed in the same AI settlement transaction.
  SELECT a.accounting->'route'->>'provider' AS provider, r.model, r.time
  INTO linked
  FROM atlas_ai.call_receipts r
  JOIN atlas_ai.call_leases a ON a.id = r.id
  JOIN atlas_ai.session_leases s ON s.id = a.session_id AND s.grant_id = a.grant_id
  JOIN atlas_ai.grants g ON g.id = s.grant_id AND g.holder_id = s.holder_id
  WHERE r.id = p_receipt_id
    AND r.job = 'background' AND r.agent = 'upload-declaration-helper'
    AND r.validation_passed AND r.result = 'accepted' AND r.failure_class IS NULL
    AND r.cost_basis = 'measured'
    AND a.route_key = 'background'
    AND a.state IN ('dispatched', 'completed')
    AND a.accounting->>'job' = r.job
    AND a.accounting->>'agent' = r.agent
    AND a.accounting->>'model' = r.model
    AND a.accounting->'route'->>'provider' = split_part(r.model, '/', 1)
    AND a.accounting->'photo'->>'uploadId' = p_upload_id::text
    AND a.accounting->'photo'->>'contentSha256' = upload.content_sha256
    AND g.scope = 'suggest' AND g.jobs = ARRAY['background']
    AND g.agent_ids = ARRAY['upload-declaration-helper'] AND g.place_ids = ARRAY['owned-upload']
    AND g.schema_ids = ARRAY['atlas-upload-photo-scores-v1']
    AND s.holder_id::text = p_owner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PHOTO_ASSESSMENT_MISMATCH'; END IF;

  SELECT p.* INTO saved FROM atlas_sources.photo_proposals p WHERE p.upload_id = p_upload_id;
  IF FOUND THEN RETURN saved; END IF;
  IF upload.state <> 'uploaded' THEN RETURN NULL; END IF;

  INSERT INTO atlas_sources.photo_proposals
    (upload_id, owner_id, content_sha256, receipt_id, provider, model, proposal, created_at)
  VALUES (p_upload_id, p_owner_id, upload.content_sha256, p_receipt_id,
    linked.provider, linked.model, p_proposal, linked.time)
  RETURNING * INTO saved;
  RETURN saved;
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
  proposal_receipt uuid;
  expected_provenance jsonb;
  published_time timestamptz;
BEGIN
  IF NOT atlas_sources.valid_scores(p_scores) THEN RAISE EXCEPTION 'SCORES_INVALID'; END IF;
  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state = 'published' THEN
    IF ROW(u.scores, u.proposal_provenance) IS DISTINCT FROM ROW(p_scores, p_proposal_provenance)
    THEN RAISE EXCEPTION 'UPLOAD_CONFLICT'; END IF;
    RETURN u;
  END IF;
  IF u.state <> 'uploaded' THEN RAISE EXCEPTION 'UPLOAD_STATE_CONFLICT'; END IF;

  IF u.content_type IN ('image/jpeg', 'image/png', 'image/webp') THEN
    IF p_proposal_provenance IS NULL THEN RAISE EXCEPTION 'PHOTO_ASSESSMENT_REQUIRED'; END IF;
    IF jsonb_typeof(p_proposal_provenance) <> 'object' OR
      COALESCE(p_proposal_provenance->>'receiptId', '') !~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN RAISE EXCEPTION 'PHOTO_ASSESSMENT_MISMATCH'; END IF;
    proposal_receipt := (p_proposal_provenance->>'receiptId')::uuid;
    expected_provenance := atlas_sources.photo_provenance(p_owner_id, p_upload_id, proposal_receipt);
    IF expected_provenance IS NULL OR p_proposal_provenance <> expected_provenance
    THEN RAISE EXCEPTION 'PHOTO_ASSESSMENT_MISMATCH'; END IF;
  ELSIF u.content_type LIKE 'audio/%' THEN
    RAISE EXCEPTION 'AUDIO_ASSESSMENT_UNAVAILABLE';
  ELSIF p_proposal_provenance IS NOT NULL THEN
    -- Retain the already deployed text proposal contract.
    IF jsonb_typeof(p_proposal_provenance) <> 'object'
      OR (p_proposal_provenance - ARRAY['provider','model','receiptId']) <> '{}'::jsonb
    THEN RAISE EXCEPTION 'UPLOAD_INVALID'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_proposal_provenance) v
      WHERE jsonb_typeof(v.value) <> 'string' OR (v.value #>> '{}') !~ '^[a-zA-Z0-9:._/-]{1,128}$')
    THEN RAISE EXCEPTION 'UPLOAD_INVALID'; END IF;
  END IF;

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

DROP TRIGGER atlas_audio_transcript_erasure ON atlas_sources.uploads;
DROP FUNCTION atlas_sources.clear_audio_transcript_on_delete();
DROP FUNCTION atlas_sources.audio_provenance(text, uuid, uuid);
DROP FUNCTION atlas_sources.save_audio_proposal(text, uuid, uuid, uuid, jsonb);
DROP FUNCTION atlas_sources.get_audio_proposal(text, uuid);
DROP FUNCTION atlas_sources.expire_audio_transcripts(integer);
DROP FUNCTION atlas_sources.save_audio_transcript(text, uuid, uuid, text);
DROP FUNCTION atlas_sources.get_audio_transcript(text, uuid);
DROP FUNCTION atlas_sources.audio_review_receipt(text, uuid, text, uuid, text);
DROP TABLE atlas_sources.audio_proposals, atlas_sources.audio_transcripts;
DROP FUNCTION atlas_sources.valid_audio_proposal(jsonb);
DROP TABLE atlas_ai.transcription_config;
ALTER TABLE atlas_ai.call_receipts DROP COLUMN audio_duration_ms;
ALTER TABLE atlas_ai.grant_receipts
  DROP CONSTRAINT grant_receipts_authority_check,
  ADD CONSTRAINT grant_receipts_authority_check CHECK (
    authority IN ('approved-public-docent-policy', 'owner-approved-benchmark', 'operator-model-check')
    OR (authority = 'owner-upload-photo-policy' AND scope = 'suggest'
      AND jobs = ARRAY['background'] AND place_ids = ARRAY['owned-upload'])
  );
COMMIT;
