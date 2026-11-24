-- File 30. Storage bytes are written only via the Storage API. The catalog,
-- quota, and counters are private and reachable only by the trusted gateway.
BEGIN;

CREATE SCHEMA atlas_sources;
REVOKE ALL ON SCHEMA atlas_sources FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('atlas-user-uploads', 'atlas-user-uploads', false, 16777216, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'audio/mpeg',
  'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4'
]);

-- A restrictive policy also blocks this bucket if another feature adds a
-- permissive policy later. It leaves existing buckets' policies in force.
CREATE POLICY atlas_user_uploads_gateway_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'atlas-user-uploads')
  WITH CHECK (bucket_id <> 'atlas-user-uploads');

CREATE TABLE atlas_sources.storage_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  default_allotment_bytes bigint NOT NULL CHECK (default_allotment_bytes >= 0)
);
INSERT INTO atlas_sources.storage_config (default_allotment_bytes) VALUES (1000000000);

-- The holder is an opaque gateway authority. Quota data and receipts survive
-- expiry or revocation of the lease used to authorize access.
CREATE TABLE atlas_sources.owner_allotments (
  owner_id text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 128),
  allotment_bytes bigint NOT NULL CHECK (allotment_bytes >= 0)
);

CREATE TABLE atlas_sources.uploads (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES atlas_sources.owner_allotments(owner_id),
  place_id text NOT NULL CHECK (length(place_id) BETWEEN 1 AND 256),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 256),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 180 AND filename !~ '[[:cntrl:]]'),
  content_type text NOT NULL CHECK (content_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'audio/mpeg',
    'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4'
  )),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  original_bytes bigint NOT NULL CHECK (original_bytes BETWEEN 1 AND 16777216),
  preview_bytes bigint NOT NULL DEFAULT 0 CHECK (preview_bytes BETWEEN 0 AND 524288),
  preview_sha256 text,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','uploaded','published','deleting','deleted')),
  scores jsonb,
  proposal_provenance jsonb,
  snapshot_receipt_id uuid,
  declaration_receipt_id uuid,
  delete_receipt_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  uploaded_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  CHECK ((preview_bytes = 0 AND preview_sha256 IS NULL) OR
    (preview_bytes > 0 AND content_type IN ('image/jpeg', 'image/png', 'image/webp') AND
     preview_sha256 IS NOT NULL AND preview_sha256 ~ '^[a-f0-9]{64}$')),
  CHECK ((uploaded_at IS NULL) = (snapshot_receipt_id IS NULL)),
  CHECK ((published_at IS NULL) = (declaration_receipt_id IS NULL)),
  CHECK ((deleted_at IS NULL) = (delete_receipt_id IS NULL))
);
CREATE INDEX connected_upload_owner_inventory
  ON atlas_sources.uploads (owner_id, created_at DESC, id);
CREATE INDEX connected_upload_owner_accounting
  ON atlas_sources.uploads (owner_id) WHERE state <> 'deleted';

-- The receipt fields are independent of mutable quotas, filenames and sessions.
CREATE TABLE atlas_sources.upload_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL,
  owner_id text NOT NULL,
  place_id text NOT NULL,
  source_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('snapshot','declared','deleted')),
  time timestamptz NOT NULL,
  original_bytes bigint NOT NULL,
  preview_bytes bigint NOT NULL,
  content_sha256 text NOT NULL,
  preview_sha256 text,
  scores jsonb,
  proposal_provenance jsonb,
  UNIQUE (upload_id, action)
);
CREATE INDEX connected_receipt_owner_time ON atlas_sources.upload_receipts (owner_id, time DESC);

-- Only total served bytes per destination and source are kept. Counts carry
-- no viewer identity, URLs, headers, credentials, or individual view history.
CREATE TABLE atlas_sources.egress_totals (
  owner_id text NOT NULL REFERENCES atlas_sources.owner_allotments(owner_id),
  place_id text NOT NULL,
  source_id text NOT NULL,
  served_bytes bigint NOT NULL CHECK (served_bytes > 0),
  PRIMARY KEY (owner_id, place_id, source_id)
);

ALTER TABLE atlas_sources.storage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sources.owner_allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sources.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sources.upload_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sources.egress_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA atlas_sources FROM PUBLIC, anon, authenticated;

CREATE FUNCTION atlas_sources.storage_usage(p_owner_id text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'allotmentBytes', COALESCE(
      (SELECT o.allotment_bytes FROM atlas_sources.owner_allotments o WHERE o.owner_id = p_owner_id),
      (SELECT c.default_allotment_bytes FROM atlas_sources.storage_config c WHERE c.singleton)
    ),
    'usedBytes', COALESCE(SUM(u.original_bytes + u.preview_bytes) FILTER (WHERE u.uploaded_at IS NOT NULL), 0),
    'reservedBytes', COALESCE(SUM(u.original_bytes + u.preview_bytes) FILTER (WHERE u.uploaded_at IS NULL), 0)
  )
  FROM atlas_sources.uploads u
  WHERE u.owner_id = p_owner_id AND u.state <> 'deleted';
$$;

CREATE FUNCTION atlas_sources.list_uploads(p_owner_id text) RETURNS SETOF atlas_sources.uploads
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT u.* FROM atlas_sources.uploads u
  WHERE u.owner_id = p_owner_id
  ORDER BY u.created_at DESC, u.id;
$$;

CREATE FUNCTION atlas_sources.storage_metrics(p_owner_id text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$
  SELECT atlas_sources.storage_usage(p_owner_id) || jsonb_build_object(
    'served', COALESCE(jsonb_agg(jsonb_build_object(
      'placeId', m.place_id, 'sourceId', m.source_id, 'servedBytes', m.served_bytes
    ) ORDER BY m.place_id, m.source_id), '[]'::jsonb)
  )
  FROM atlas_sources.egress_totals m WHERE m.owner_id = p_owner_id;
$$;

CREATE FUNCTION atlas_sources.reserve_upload(
  p_owner_id text, p_upload_id uuid, p_place_id text, p_source_id text,
  p_filename text, p_content_type text, p_content_sha256 text, p_original_bytes bigint,
  p_preview_bytes bigint DEFAULT 0, p_preview_sha256 text DEFAULT NULL
) RETURNS atlas_sources.uploads
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  prior atlas_sources.uploads;
  allotment bigint;
  booked numeric;
BEGIN
  IF p_owner_id IS NULL OR length(p_owner_id) NOT BETWEEN 1 AND 128 OR p_upload_id IS NULL
    OR p_place_id IS NULL OR length(p_place_id) NOT BETWEEN 1 AND 256
    OR p_source_id IS NULL OR length(p_source_id) NOT BETWEEN 1 AND 256
    OR p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 180 OR p_filename ~ '[[:cntrl:]]'
    OR p_content_type IS NULL OR p_content_type NOT IN (
      'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'audio/mpeg',
      'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4'
    )
    OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[a-f0-9]{64}$'
    OR p_original_bytes IS NULL OR p_original_bytes NOT BETWEEN 1 AND 16777216
    OR p_preview_bytes IS NULL OR p_preview_bytes NOT BETWEEN 0 AND 524288
    OR (p_preview_bytes = 0 AND p_preview_sha256 IS NOT NULL)
    OR (p_preview_bytes > 0 AND (p_preview_sha256 IS NULL OR p_preview_sha256 !~ '^[a-f0-9]{64}$'
        OR p_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')))
  THEN
    RAISE EXCEPTION 'UPLOAD_INVALID';
  END IF;

  INSERT INTO atlas_sources.owner_allotments (owner_id, allotment_bytes)
    SELECT p_owner_id, default_allotment_bytes FROM atlas_sources.storage_config WHERE singleton
    ON CONFLICT (owner_id) DO NOTHING;

  -- Every reservation for this owner uses the same lock before looking at
  -- the remaining allotment. The transaction finishes before Storage I/O.
  SELECT allotment_bytes INTO STRICT allotment
    FROM atlas_sources.owner_allotments WHERE owner_id = p_owner_id FOR UPDATE;

  SELECT * INTO prior FROM atlas_sources.uploads WHERE id = p_upload_id;
  IF FOUND THEN
    IF ROW(prior.owner_id, prior.place_id, prior.source_id, prior.filename, prior.content_type,
      prior.content_sha256, prior.original_bytes, prior.preview_bytes, prior.preview_sha256)
      IS DISTINCT FROM ROW(p_owner_id, p_place_id, p_source_id, p_filename, p_content_type,
        p_content_sha256, p_original_bytes, p_preview_bytes, p_preview_sha256)
    THEN
      RAISE EXCEPTION 'UPLOAD_CONFLICT';
    END IF;
    RETURN prior;
  END IF;

  SELECT COALESCE(SUM(original_bytes + preview_bytes), 0) INTO booked
    FROM atlas_sources.uploads WHERE owner_id = p_owner_id AND state <> 'deleted';
  IF booked + p_original_bytes + p_preview_bytes > allotment THEN
    RAISE EXCEPTION 'ALLOTMENT_EXCEEDED';
  END IF;

  INSERT INTO atlas_sources.uploads
    (id, owner_id, place_id, source_id, filename, content_type, content_sha256,
     original_bytes, preview_bytes, preview_sha256)
  VALUES
    (p_upload_id, p_owner_id, p_place_id, p_source_id, p_filename, p_content_type,
     p_content_sha256, p_original_bytes, p_preview_bytes, p_preview_sha256)
  ON CONFLICT (id) DO NOTHING RETURNING * INTO prior;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UPLOAD_CONFLICT';
  END IF;
  RETURN prior;
END;
$$;

CREATE FUNCTION atlas_sources.finish_upload(p_owner_id text, p_upload_id uuid)
RETURNS atlas_sources.uploads
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  u atlas_sources.uploads;
  objects_verified integer;
  uploaded_time timestamptz;
  receipt_id uuid;
BEGIN
  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state IN ('uploaded', 'published') THEN RETURN u; END IF;
  IF u.state <> 'reserved' THEN RAISE EXCEPTION 'UPLOAD_STATE_CONFLICT'; END IF;

  -- Read Storage metadata; never insert or delete object rows directly.
  SELECT count(*) INTO objects_verified
  FROM (VALUES
    (u.id::text || '/original', u.original_bytes, u.content_type),
    (u.id::text || '/preview', u.preview_bytes, 'image/jpeg')
  ) AS expected(path, bytes, mime)
  JOIN storage.objects o ON o.bucket_id = 'atlas-user-uploads' AND o.name = expected.path
  WHERE expected.bytes > 0 AND o.metadata->>'size' = expected.bytes::text
    AND (o.metadata->>'mimetype' IS NULL OR
      split_part(lower(o.metadata->>'mimetype'), ';', 1) = expected.mime);
  IF objects_verified <> (CASE WHEN u.preview_bytes > 0 THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'UPLOAD_OBJECTS_INCOMPLETE';
  END IF;

  uploaded_time := clock_timestamp();
  INSERT INTO atlas_sources.upload_receipts
    (upload_id, owner_id, place_id, source_id, action, time, original_bytes,
     preview_bytes, content_sha256, preview_sha256)
  VALUES (u.id, u.owner_id, u.place_id, u.source_id, 'snapshot', uploaded_time,
    u.original_bytes, u.preview_bytes, u.content_sha256, u.preview_sha256)
  RETURNING id INTO receipt_id;
  UPDATE atlas_sources.uploads SET state = 'uploaded', uploaded_at = uploaded_time,
    snapshot_receipt_id = receipt_id WHERE id = u.id RETURNING * INTO u;
  RETURN u;
END;
$$;

CREATE FUNCTION atlas_sources.valid_scores(p_scores jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE
  dial jsonb;
  dimension text;
  dimensions text[] := ARRAY['violence','sexual','language','disturbing','viewpoint','sensory'];
  allowed_scores jsonb[] := ARRAY['0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb];
BEGIN
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'object'
    OR NOT p_scores ?& dimensions OR (p_scores - dimensions) <> '{}'::jsonb
  THEN RETURN false; END IF;
  FOREACH dimension IN ARRAY dimensions LOOP
    dial := p_scores->dimension;
    IF jsonb_typeof(dial) <> 'object' OR NOT dial ?& ARRAY['amount','graphicness']
      OR (dial - ARRAY['amount','graphicness']) <> '{}'::jsonb
      OR NOT (dial->'amount' = ANY(allowed_scores)) OR NOT (dial->'graphicness' = ANY(allowed_scores))
    THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION atlas_sources.publish_upload(
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

CREATE FUNCTION atlas_sources.begin_delete(p_owner_id text, p_upload_id uuid)
RETURNS atlas_sources.uploads
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE u atlas_sources.uploads;
BEGIN
  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state IN ('deleting','deleted') THEN RETURN u; END IF;
  UPDATE atlas_sources.uploads SET state = 'deleting' WHERE id = u.id RETURNING * INTO u;
  RETURN u;
END;
$$;

CREATE FUNCTION atlas_sources.finish_delete(p_owner_id text, p_upload_id uuid)
RETURNS atlas_sources.uploads
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  u atlas_sources.uploads;
  receipt_id uuid;
  deleted_time timestamptz;
BEGIN
  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state = 'deleted' THEN RETURN u; END IF;
  IF u.state <> 'deleting' THEN RAISE EXCEPTION 'UPLOAD_STATE_CONFLICT'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id = 'atlas-user-uploads' AND name IN (u.id::text || '/original', u.id::text || '/preview'))
  THEN RAISE EXCEPTION 'UPLOAD_OBJECTS_REMAIN'; END IF;

  deleted_time := clock_timestamp();
  INSERT INTO atlas_sources.upload_receipts
    (upload_id, owner_id, place_id, source_id, action, time, original_bytes,
      preview_bytes, content_sha256, preview_sha256)
  VALUES (u.id, u.owner_id, u.place_id, u.source_id, 'deleted', deleted_time,
    u.original_bytes, u.preview_bytes, u.content_sha256, u.preview_sha256)
  RETURNING id INTO receipt_id;
  UPDATE atlas_sources.uploads SET state = 'deleted', deleted_at = deleted_time,
    delete_receipt_id = receipt_id WHERE id = u.id RETURNING * INTO u;
  RETURN u;
END;
$$;

CREATE FUNCTION atlas_sources.record_egress(p_owner_id text, p_upload_id uuid, p_variant text, p_bytes bigint)
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE
  u atlas_sources.uploads;
  expected bigint;
BEGIN
  SELECT * INTO u FROM atlas_sources.uploads WHERE id = p_upload_id AND owner_id = p_owner_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF u.state NOT IN ('uploaded', 'published') THEN RAISE EXCEPTION 'UPLOAD_STATE_CONFLICT'; END IF;
  expected := CASE p_variant WHEN 'original' THEN u.original_bytes WHEN 'preview' THEN u.preview_bytes END;
  IF expected IS NULL OR expected <= 0 OR p_bytes IS DISTINCT FROM expected
  THEN RAISE EXCEPTION 'UPLOAD_INVALID'; END IF;

  INSERT INTO atlas_sources.egress_totals AS totals (owner_id, place_id, source_id, served_bytes)
  VALUES (u.owner_id, u.place_id, u.source_id, p_bytes)
  ON CONFLICT (owner_id, place_id, source_id) DO UPDATE
    SET served_bytes = totals.served_bytes + EXCLUDED.served_bytes;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_sources FROM PUBLIC, anon, authenticated;
COMMIT;
