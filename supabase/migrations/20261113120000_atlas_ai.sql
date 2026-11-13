-- Stage A only. Silver applies after Nic names this commit.
-- Collision aborts the transaction; no IF NOT EXISTS or existing-resource edits.
BEGIN;
CREATE SCHEMA atlas_ai;
REVOKE ALL ON SCHEMA atlas_ai FROM PUBLIC, anon, authenticated;

CREATE TABLE atlas_ai.runtime_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  public_origin text NOT NULL CHECK (public_origin = 'https://zateslofl.github.io'),
  public_day_calls integer NOT NULL DEFAULT 100 CHECK (public_day_calls BETWEEN 0 AND 100),
  public_day_microusd bigint NOT NULL DEFAULT 1000000 CHECK (public_day_microusd BETWEEN 0 AND 1000000),
  all_jobs_day_microusd bigint NOT NULL DEFAULT 10000000 CHECK (all_jobs_day_microusd BETWEEN 0 AND 10000000),
  provider_month_microusd bigint NOT NULL DEFAULT 20000000 CHECK (provider_month_microusd BETWEEN 0 AND 20000000),
  new_holders_per_day integer NOT NULL DEFAULT 100 CHECK (new_holders_per_day BETWEEN 0 AND 100),
  expires_at timestamptz NOT NULL
);
CREATE TABLE atlas_ai.routing_config (
  route_key text PRIMARY KEY CHECK (route_key IN ('builder','guide','background','heavy','builder_challenger')),
  provider text NOT NULL CHECK (provider IN ('anthropic','openai')),
  model_id text,
  enabled boolean NOT NULL DEFAULT false,
  input_token_cap integer NOT NULL CHECK (input_token_cap BETWEEN 1 AND 12000),
  output_token_cap integer NOT NULL CHECK (output_token_cap BETWEEN 1 AND 4096),
  input_microusd_per_million bigint CHECK (input_microusd_per_million >= 0),
  output_microusd_per_million bigint CHECK (output_microusd_per_million >= 0),
  cache_read_microusd_per_million bigint CHECK (cache_read_microusd_per_million >= 0),
  cache_write_microusd_per_million bigint CHECK (cache_write_microusd_per_million >= 0),
  pricing_source_url text,
  -- Reviewed API/token-bound contract. NULL is deliberately non-executable.
  billing_contract jsonb CHECK (billing_contract IS NULL OR jsonb_typeof(billing_contract) = 'object'),
  model_verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  CHECK (NOT enabled OR (model_id IS NOT NULL AND model_verified_at IS NOT NULL
    AND input_microusd_per_million IS NOT NULL AND output_microusd_per_million IS NOT NULL
    AND pricing_source_url IS NOT NULL AND billing_contract IS NOT NULL))
);
-- Anonymous quota handles, NOT Atlas accounts, members or backing credentials.
CREATE TABLE atlas_ai.holder_leases (
  id uuid PRIMARY KEY,
  token_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
  backing_ref jsonb CHECK (backing_ref IS NULL),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
);
-- The only permission object: holder + scope + bounded capabilities/Places + expiry.
CREATE TABLE atlas_ai.grants (
  id uuid PRIMARY KEY,
  holder_id uuid NOT NULL REFERENCES atlas_ai.holder_leases(id),
  scope text NOT NULL CHECK (scope IN ('look','enter','suggest','edit')),
  jobs text[] NOT NULL CHECK (jobs <@ ARRAY['builder','guide','background','heavy','model-check']::text[] AND cardinality(jobs) > 0),
  agent_ids text[] NOT NULL CHECK (cardinality(agent_ids) BETWEEN 1 AND 4),
  place_ids text[] NOT NULL CHECK (cardinality(place_ids) BETWEEN 1 AND 4),
  schema_ids text[] NOT NULL CHECK (cardinality(schema_ids) BETWEEN 1 AND 4),
  max_calls integer NOT NULL CHECK (max_calls BETWEEN 1 AND 40),
  max_microusd bigint NOT NULL CHECK (max_microusd BETWEEN 0 AND 10000000),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  -- Metadata grants have their own capability and cannot carry generation scope.
  CONSTRAINT model_check_only CHECK (
    (scope='look' AND jobs=ARRAY['model-check']::text[]
      AND agent_ids=ARRAY['operator-model-check']::text[] AND place_ids=ARRAY['ai-proxy']::text[]
      AND schema_ids=ARRAY['atlas-model-check-v1']::text[] AND max_calls=4 AND max_microusd=0)
    OR (max_microusd>=1 AND NOT (jobs && ARRAY['model-check']::text[])
      AND NOT (agent_ids && ARRAY['operator-model-check']::text[])
      AND NOT (schema_ids && ARRAY['atlas-model-check-v1']::text[]))
  )
);
CREATE TABLE atlas_ai.session_leases (
  id uuid PRIMARY KEY,
  holder_id uuid NOT NULL REFERENCES atlas_ai.holder_leases(id),
  grant_id uuid NOT NULL REFERENCES atlas_ai.grants(id),
  token_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes')
);
CREATE TABLE atlas_ai.quota_windows (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  calls_used integer NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  spent_microusd bigint NOT NULL DEFAULT 0 CHECK (spent_microusd >= 0),
  PRIMARY KEY (bucket,window_start),
  CHECK (expires_at > window_start)
);
CREATE TABLE atlas_ai.call_leases (
  id uuid PRIMARY KEY,
  request_key bytea NOT NULL UNIQUE CHECK (octet_length(request_key) = 32),
  session_id uuid NOT NULL REFERENCES atlas_ai.session_leases(id),
  grant_id uuid NOT NULL REFERENCES atlas_ai.grants(id),
  route_key text NOT NULL,
  -- Immutable accounting snapshot, never request content.
  accounting jsonb NOT NULL CHECK (jsonb_typeof(accounting) = 'object'),
  quota_reservations jsonb NOT NULL CHECK (jsonb_typeof(quota_reservations) = 'array'),
  state text NOT NULL CHECK (state IN ('reserved','dispatched','completed','uncertain')),
  reserved_microusd bigint NOT NULL CHECK (reserved_microusd >= 0),
  settled_microusd bigint CHECK (settled_microusd >= 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
-- Permanent minimal Receipts. No body, prompts, outputs, credentials, IP or identity columns.
-- "tokens" below means provider usage COUNTS, never credentials/session tokens.
CREATE TABLE atlas_ai.call_receipts (
  id uuid PRIMARY KEY,
  time timestamptz NOT NULL,
  job text NOT NULL CHECK (job IN ('builder','guide','background','heavy')),
  model text,
  agent text NOT NULL CHECK (agent IN ('docent-silver','gus-benchmark')),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cache_read_tokens integer CHECK (cache_read_tokens >= 0),
  cache_write_tokens integer CHECK (cache_write_tokens >= 0),
  reasoning_tokens integer CHECK (reasoning_tokens >= 0),
  -- File 14 adds cost to the minimal Receipt; this is measured or conservative.
  cost_microusd bigint NOT NULL CHECK (cost_microusd >= 0),
  cost_basis text NOT NULL CHECK (cost_basis IN ('measured','reserved','not-dispatched')),
  validation_passed boolean NOT NULL,
  result text NOT NULL CHECK (result IN ('accepted','rejected')),
  CHECK (validation_passed = (result = 'accepted'))
);
CREATE TABLE atlas_ai.grant_receipts (
  id uuid PRIMARY KEY,
  time timestamptz NOT NULL,
  grant_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('issued','revoked','renewed')),
  scope text NOT NULL CHECK (scope IN ('look','enter','suggest','edit')),
  jobs text[] NOT NULL,
  place_ids text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  authority text NOT NULL CHECK (authority IN ('approved-public-docent-policy','owner-approved-benchmark','operator-model-check'))
);
-- Receipt references deliberately have no FK to expiring records.
CREATE INDEX holder_expiry ON atlas_ai.holder_leases(expires_at);
CREATE INDEX session_expiry ON atlas_ai.session_leases(expires_at);
CREATE INDEX session_holder ON atlas_ai.session_leases(holder_id);
CREATE INDEX grant_holder ON atlas_ai.grants(holder_id,expires_at);
CREATE INDEX call_expiry ON atlas_ai.call_leases(expires_at);
CREATE INDEX call_active_session ON atlas_ai.call_leases(session_id,state);
CREATE INDEX call_session_time ON atlas_ai.call_leases(session_id,created_at);
CREATE INDEX quota_expiry ON atlas_ai.quota_windows(expires_at);
CREATE INDEX receipt_time ON atlas_ai.call_receipts(time);
ALTER TABLE atlas_ai.runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.routing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.holder_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.session_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.quota_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.call_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.call_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_ai.grant_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA atlas_ai FROM PUBLIC, anon, authenticated;
-- No client RLS policies, RPCs, triggers, cron jobs, extensions or new DB roles.
-- The Edge Function alone uses Supabase's server-only database connection.
-- It performs checked, parameterized SQL transactions, not public table CRUD.
-- Receipt insertion is append-only in that code; DB administrators remain trusted.
INSERT INTO atlas_ai.runtime_config(id,public_origin,expires_at)
VALUES(true,'https://zateslofl.github.io',now()+interval '30 days');
-- Requested display names are documented in the plan; executable model IDs stay NULL.
INSERT INTO atlas_ai.routing_config(route_key,provider,input_token_cap,output_token_cap,expires_at) VALUES
('builder','anthropic',12000,4096,now()+interval '30 days'),
('guide','anthropic',6000,512,now()+interval '30 days'),
('background','anthropic',6000,1024,now()+interval '30 days'),
('heavy','anthropic',12000,4096,now()+interval '30 days'),
('builder_challenger','openai',12000,4096,now()+interval '30 days');
COMMIT;
