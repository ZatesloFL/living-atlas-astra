-- B-5. Add duration-priced audio transcription to the existing AI accounting
-- envelope, with private, expiring review text. Existing routes and caps stay in force.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT id FROM atlas_ai.runtime_config WHERE id = true FOR UPDATE;

CREATE TABLE atlas_ai.transcription_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL CHECK (provider = 'openai'),
  model_id text NOT NULL CHECK (model_id = 'gpt-transcribe'),
  enabled boolean NOT NULL DEFAULT false,
  microusd_per_minute bigint NOT NULL CHECK (microusd_per_minute > 0),
  max_duration_ms bigint NOT NULL CHECK (max_duration_ms BETWEEN 1 AND 30000),
  expires_at timestamptz NOT NULL,
  pricing_source_url text NOT NULL
);
INSERT INTO atlas_ai.transcription_config
  (provider, model_id, enabled, microusd_per_minute, max_duration_ms, expires_at, pricing_source_url)
SELECT 'openai', 'gpt-transcribe', true, 4500, 30000, expires_at,
  'https://developers.openai.com/api/docs/models/gpt-transcribe'
FROM atlas_ai.runtime_config WHERE id = true;
ALTER TABLE atlas_ai.transcription_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_ai.transcription_config FROM PUBLIC, anon, authenticated;

ALTER TABLE atlas_ai.call_receipts
  ADD COLUMN audio_duration_ms bigint,
  ADD CONSTRAINT call_receipts_audio_duration_scope CHECK (
    audio_duration_ms IS NULL OR (
      audio_duration_ms > 0 AND job = 'background' AND agent = 'upload-declaration-helper'
      AND model IS NOT NULL AND model = 'openai/gpt-transcribe'
    )
  );
ALTER TABLE atlas_ai.grant_receipts
  DROP CONSTRAINT grant_receipts_authority_check,
  ADD CONSTRAINT grant_receipts_authority_check CHECK (
    authority IN ('approved-public-docent-policy', 'owner-approved-benchmark', 'operator-model-check')
    OR (authority IN ('owner-upload-photo-policy', 'owner-upload-review-policy') AND scope = 'suggest'
      AND jobs = ARRAY['background'] AND place_ids = ARRAY['owned-upload'])
  );

CREATE TABLE atlas_sources.audio_transcripts (
  upload_id uuid PRIMARY KEY REFERENCES atlas_sources.uploads(id),
  owner_id text NOT NULL REFERENCES atlas_sources.owner_allotments(owner_id),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_id uuid NOT NULL UNIQUE REFERENCES atlas_ai.call_receipts(id),
  provider text NOT NULL CHECK (provider = 'openai'),
  model text NOT NULL CHECK (model = 'openai/gpt-transcribe'),
  route text NOT NULL DEFAULT 'audio_transcription' CHECK (route = 'audio_transcription'),
  transcript text CHECK (transcript IS NULL OR (
    octet_length(transcript) BETWEEN 1 AND 8192 AND transcript ~ '[^[:space:]]'
  )),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = created_at + interval '15 minutes')
);
CREATE INDEX atlas_audio_transcripts_active_expiry
  ON atlas_sources.audio_transcripts (expires_at, upload_id) WHERE transcript IS NOT NULL;
ALTER TABLE atlas_sources.audio_transcripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_sources.audio_transcripts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION atlas_sources.valid_audio_proposal(p_proposal jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN jsonb_typeof(p_proposal) = 'object' THEN COALESCE(
    p_proposal ?& ARRAY['kind','basis','scores','observation','descriptionDisagrees']
    AND (p_proposal - ARRAY['kind','basis','scores','observation','descriptionDisagrees']) = '{}'::jsonb
    AND p_proposal->'kind' = '"upload-scores"'::jsonb
    AND p_proposal->'basis' = '"audio-transcript"'::jsonb
    AND atlas_sources.valid_scores(p_proposal->'scores')
    AND jsonb_typeof(p_proposal->'observation') = 'string'
    AND char_length(p_proposal->>'observation') BETWEEN 1 AND 380
    AND p_proposal->>'observation' ~ '[^[:space:]]'
    AND p_proposal->>'observation' !~ '[[:cntrl:]]'
    AND p_proposal->>'observation' !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    AND jsonb_typeof(p_proposal->'descriptionDisagrees') = 'boolean',
    false
  ) ELSE false END;
$$;

CREATE TABLE atlas_sources.audio_proposals (
  upload_id uuid PRIMARY KEY REFERENCES atlas_sources.uploads(id),
  owner_id text NOT NULL REFERENCES atlas_sources.owner_allotments(owner_id),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_id uuid NOT NULL UNIQUE REFERENCES atlas_ai.call_receipts(id),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 128),
  route text NOT NULL DEFAULT 'background' CHECK (route = 'background'),
  basis text NOT NULL DEFAULT 'audio-transcript' CHECK (basis = 'audio-transcript'),
  transcription_receipt_id uuid NOT NULL UNIQUE REFERENCES atlas_ai.call_receipts(id),
  transcription_provider text NOT NULL CHECK (transcription_provider = 'openai'),
  transcription_model text NOT NULL CHECK (transcription_model = 'openai/gpt-transcribe'),
  transcription_route text NOT NULL CHECK (transcription_route = 'audio_transcription'),
  proposal jsonb NOT NULL CHECK (atlas_sources.valid_audio_proposal(proposal)),
  created_at timestamptz NOT NULL,
  CHECK (receipt_id <> transcription_receipt_id)
);
ALTER TABLE atlas_sources.audio_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_sources.audio_proposals FROM PUBLIC, anon, authenticated;

-- Settlement consumes the short-lived lease in the same transaction as its
-- accepted measured Receipt. Owner knowledge of any Receipt ID is insufficient.
CREATE FUNCTION atlas_sources.audio_review_receipt(
  p_owner_id text, p_upload_id uuid, p_content_sha256 text, p_receipt_id uuid, p_stage text
) RETURNS TABLE(provider text, model text, "time" timestamptz, transcription_receipt text)
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT a.accounting->'route'->>'provider', r.model, r.time,
    a.accounting->p_stage->>'transcriptionReceiptId'
  FROM atlas_ai.call_receipts r
  JOIN atlas_ai.call_leases a ON a.id = r.id
  JOIN atlas_ai.session_leases s ON s.id = a.session_id AND s.grant_id = a.grant_id
  JOIN atlas_ai.grants g ON g.id = s.grant_id AND g.holder_id = s.holder_id
  WHERE r.id = p_receipt_id
    AND r.job = 'background' AND r.agent = 'upload-declaration-helper'
    AND r.validation_passed AND r.result = 'accepted' AND r.failure_class IS NULL AND r.cost_basis = 'measured'
    AND (
      (p_stage = 'transcription' AND a.route_key = 'audio_transcription'
       AND r.audio_duration_ms BETWEEN 1 AND 30000 AND r.model = 'openai/gpt-transcribe')
      OR (p_stage = 'audio' AND a.route_key = 'background' AND r.audio_duration_ms IS NULL)
    )
    AND a.state IN ('dispatched', 'completed')
    AND a.accounting->>'job' = r.job AND a.accounting->>'agent' = r.agent AND a.accounting->>'model' = r.model
    AND a.accounting->'route'->>'provider' = split_part(r.model, '/', 1)
    AND a.accounting->p_stage->>'uploadId' = p_upload_id::text
    AND a.accounting->p_stage->>'contentSha256' = p_content_sha256
    AND g.scope = 'suggest' AND g.jobs = ARRAY['background']
    AND g.agent_ids = ARRAY['upload-declaration-helper'] AND g.place_ids = ARRAY['owned-upload']
    AND cardinality(g.schema_ids) = 3 AND g.schema_ids @> ARRAY[
      'atlas-upload-photo-scores-v1', 'atlas-upload-audio-transcription-v1', 'atlas-upload-audio-scores-v1'
    ]
    AND s.holder_id::text = p_owner_id;
$$;

CREATE FUNCTION atlas_sources.get_audio_transcript(p_owner_id text, p_upload_id uuid)
RETURNS SETOF atlas_sources.audio_transcripts
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT t.* FROM atlas_sources.audio_transcripts t
  JOIN atlas_sources.uploads u ON u.id = t.upload_id AND u.owner_id = t.owner_id
    AND u.content_sha256 = t.content_sha256
  WHERE t.owner_id = p_owner_id AND t.upload_id = p_upload_id
    AND u.state = 'uploaded' AND u.content_type LIKE 'audio/%'
    AND t.transcript IS NOT NULL AND t.expires_at > statement_timestamp();
$$;

CREATE FUNCTION atlas_sources.save_audio_transcript(
  p_owner_id text, p_upload_id uuid, p_receipt_id uuid, p_transcript text
) RETURNS atlas_sources.audio_transcripts
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  upload atlas_sources.uploads;
  saved atlas_sources.audio_transcripts;
  linked record;
BEGIN
  IF p_transcript IS NULL OR octet_length(p_transcript) NOT BETWEEN 1 AND 8192 OR p_transcript !~ '[^[:space:]]'
  THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;
  SELECT u.* INTO upload FROM atlas_sources.uploads u
  WHERE u.id = p_upload_id AND u.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR upload.state <> 'uploaded' OR upload.content_type NOT LIKE 'audio/%' THEN RETURN NULL; END IF;

  SELECT * INTO linked FROM atlas_sources.audio_review_receipt(
    p_owner_id, p_upload_id, upload.content_sha256, p_receipt_id, 'transcription'
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;
  IF linked.time + interval '15 minutes' <= clock_timestamp() THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM atlas_sources.audio_proposals p WHERE p.upload_id = p_upload_id) THEN RETURN NULL; END IF;

  SELECT t.* INTO saved FROM atlas_sources.audio_transcripts t WHERE t.upload_id = p_upload_id FOR UPDATE;
  IF FOUND THEN
    IF saved.transcript IS NOT NULL AND saved.expires_at > clock_timestamp() THEN RETURN saved; END IF;
    -- Retries of an old Receipt cannot re-create a cleared or expired transcript.
    IF saved.receipt_id = p_receipt_id OR linked.time <= saved.created_at THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO atlas_sources.audio_transcripts AS t
    (upload_id, owner_id, content_sha256, receipt_id, provider, model, transcript, created_at, expires_at)
  VALUES (p_upload_id, p_owner_id, upload.content_sha256, p_receipt_id, linked.provider, linked.model,
    p_transcript, linked.time, linked.time + interval '15 minutes')
  ON CONFLICT (upload_id) DO UPDATE SET
    receipt_id = EXCLUDED.receipt_id, provider = EXCLUDED.provider, model = EXCLUDED.model,
    transcript = EXCLUDED.transcript, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
  RETURNING * INTO saved;
  RETURN saved;
END;
$$;

CREATE FUNCTION atlas_sources.expire_audio_transcripts(p_limit integer DEFAULT 20)
RETURNS integer
LANGUAGE sql VOLATILE SET search_path = pg_catalog
AS $$
  WITH expired AS (
    SELECT upload_id FROM atlas_sources.audio_transcripts
    WHERE transcript IS NOT NULL AND expires_at <= statement_timestamp()
    ORDER BY expires_at, upload_id LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    FOR UPDATE SKIP LOCKED
  ), erased AS (
    UPDATE atlas_sources.audio_transcripts t SET transcript = NULL
    FROM expired WHERE t.upload_id = expired.upload_id RETURNING 1
  )
  SELECT count(*)::integer FROM erased;
$$;

CREATE FUNCTION atlas_sources.clear_audio_transcript_on_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE atlas_sources.audio_transcripts SET transcript = NULL
    WHERE upload_id = NEW.id AND transcript IS NOT NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atlas_audio_transcript_erasure
AFTER UPDATE OF state ON atlas_sources.uploads
FOR EACH ROW WHEN (NEW.state IN ('deleting', 'deleted'))
EXECUTE FUNCTION atlas_sources.clear_audio_transcript_on_delete();

CREATE FUNCTION atlas_sources.get_audio_proposal(p_owner_id text, p_upload_id uuid)
RETURNS SETOF atlas_sources.audio_proposals
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT p.* FROM atlas_sources.audio_proposals p
  JOIN atlas_sources.uploads u ON u.id = p.upload_id AND u.owner_id = p.owner_id
    AND u.content_sha256 = p.content_sha256
  WHERE p.owner_id = p_owner_id AND p.upload_id = p_upload_id
    AND u.state IN ('uploaded', 'published') AND u.content_type LIKE 'audio/%';
$$;

CREATE FUNCTION atlas_sources.save_audio_proposal(
  p_owner_id text, p_upload_id uuid, p_receipt_id uuid, p_transcription_receipt_id uuid, p_proposal jsonb
) RETURNS atlas_sources.audio_proposals
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  upload atlas_sources.uploads;
  saved atlas_sources.audio_proposals;
  t atlas_sources.audio_transcripts;
  linked record;
BEGIN
  IF NOT atlas_sources.valid_audio_proposal(p_proposal) THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;
  SELECT u.* INTO upload FROM atlas_sources.uploads u
  WHERE u.id = p_upload_id AND u.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR upload.state NOT IN ('uploaded', 'published')
    OR upload.content_type NOT LIKE 'audio/%' THEN RETURN NULL; END IF;

  SELECT * INTO linked FROM atlas_sources.audio_review_receipt(
    p_owner_id, p_upload_id, upload.content_sha256, p_receipt_id, 'audio'
  );
  IF NOT FOUND OR linked.transcription_receipt IS DISTINCT FROM p_transcription_receipt_id::text
    OR p_transcription_receipt_id IS NULL THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;

  SELECT p.* INTO saved FROM atlas_sources.audio_proposals p WHERE p.upload_id = p_upload_id;
  IF FOUND THEN RETURN saved; END IF;
  IF upload.state <> 'uploaded' THEN RETURN NULL; END IF;

  SELECT v.* INTO t FROM atlas_sources.audio_transcripts v
  WHERE v.upload_id = p_upload_id AND v.owner_id = p_owner_id AND v.content_sha256 = upload.content_sha256
    AND v.receipt_id = p_transcription_receipt_id AND v.transcript IS NOT NULL
    AND v.expires_at > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO atlas_sources.audio_proposals
    (upload_id, owner_id, content_sha256, receipt_id, provider, model,
    transcription_receipt_id, transcription_provider, transcription_model, transcription_route, proposal, created_at)
  VALUES (p_upload_id, p_owner_id, upload.content_sha256, p_receipt_id, linked.provider, linked.model,
    t.receipt_id, t.provider, t.model, t.route, p_proposal, linked.time)
  RETURNING * INTO saved;
  UPDATE atlas_sources.audio_transcripts SET transcript = NULL WHERE upload_id = p_upload_id;
  RETURN saved;
END;
$$;

CREATE FUNCTION atlas_sources.audio_provenance(p_owner_id text, p_upload_id uuid, p_receipt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'provider', p.provider, 'model', p.model, 'receiptId', p.receipt_id,
    'basis', p.basis, 'route', p.route, 'transcriptionReceiptId', p.transcription_receipt_id,
    'transcriptionProvider', p.transcription_provider, 'transcriptionModel', p.transcription_model,
    'transcriptionRoute', p.transcription_route
  )
  FROM atlas_sources.get_audio_proposal(p_owner_id, p_upload_id) p
  WHERE p.receipt_id = p_receipt_id;
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
    AND (g.schema_ids = ARRAY['atlas-upload-photo-scores-v1']
      OR (cardinality(g.schema_ids) = 3 AND g.schema_ids @> ARRAY[
        'atlas-upload-photo-scores-v1','atlas-upload-audio-transcription-v1','atlas-upload-audio-scores-v1'
      ]))
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
    IF p_proposal_provenance IS NULL THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_REQUIRED'; END IF;
    IF jsonb_typeof(p_proposal_provenance) <> 'object' OR
      COALESCE(p_proposal_provenance->>'receiptId', '') !~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;
    proposal_receipt := (p_proposal_provenance->>'receiptId')::uuid;
    expected_provenance := atlas_sources.audio_provenance(p_owner_id, p_upload_id, proposal_receipt);
    IF expected_provenance IS NULL OR p_proposal_provenance <> expected_provenance
    THEN RAISE EXCEPTION 'AUDIO_ASSESSMENT_MISMATCH'; END IF;
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

REVOKE ALL ON FUNCTION atlas_sources.valid_audio_proposal(jsonb),
  atlas_sources.audio_review_receipt(text, uuid, text, uuid, text),
  atlas_sources.get_audio_transcript(text, uuid),
  atlas_sources.save_audio_transcript(text, uuid, uuid, text),
  atlas_sources.expire_audio_transcripts(integer),
  atlas_sources.clear_audio_transcript_on_delete(),
  atlas_sources.get_audio_proposal(text, uuid),
  atlas_sources.save_audio_proposal(text, uuid, uuid, uuid, jsonb),
  atlas_sources.audio_provenance(text, uuid, uuid)
FROM PUBLIC, anon, authenticated;
COMMIT;
