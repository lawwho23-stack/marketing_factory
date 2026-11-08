CREATE SCHEMA IF NOT EXISTS marketing_factory;
CREATE TABLE IF NOT EXISTS marketing_factory.workers (
 id text PRIMARY KEY, name text NOT NULL, mode text NOT NULL, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS marketing_factory.campaigns (
 id uuid PRIMARY KEY, name text NOT NULL, audience text NOT NULL, goal text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.tasks (
 id uuid PRIMARY KEY, worker_id text NOT NULL REFERENCES marketing_factory.workers(id), campaign_id uuid REFERENCES marketing_factory.campaigns(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','queued','running','waiting_review','completed','failed','cancelled')),
 source text NOT NULL DEFAULT 'manual', current_run_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.task_runs (
 id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES marketing_factory.tasks(id), producer_id text NOT NULL,
 status text NOT NULL DEFAULT 'started', origin text NOT NULL DEFAULT 'local_codex', sequence bigint NOT NULL DEFAULT -1,
 engine_run_id text UNIQUE, engine_updated_at timestamptz, heartbeat_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS marketing_factory.worker_events (
 id bigserial PRIMARY KEY, event_id uuid NOT NULL UNIQUE, task_id uuid NOT NULL REFERENCES marketing_factory.tasks(id), run_id uuid NOT NULL REFERENCES marketing_factory.task_runs(id),
 producer_id text NOT NULL, sequence bigint NOT NULL, event_type text NOT NULL, step_id text, message text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,producer_id,sequence)
);
CREATE TABLE IF NOT EXISTS marketing_factory.artifacts (
 id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES marketing_factory.tasks(id), run_id uuid REFERENCES marketing_factory.task_runs(id),
 title text NOT NULL, type text NOT NULL, sha256 text NOT NULL, bytes bigint NOT NULL DEFAULT 0,
 storage_key text, drive_file_id text, drive_url text, content_json jsonb, review_status text NOT NULL DEFAULT 'needs_review',
 review_note text, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,sha256,type,run_id)
);
CREATE TABLE IF NOT EXISTS marketing_factory.leads (
 id uuid PRIMARY KEY, name text NOT NULL, company text NOT NULL DEFAULT '', contact text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'Manual',
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','qualified','proposal','won','lost')),
 next_follow_up date, notes text NOT NULL DEFAULT '', campaign_id uuid REFERENCES marketing_factory.campaigns(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.crm_activities (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES marketing_factory.leads(id), kind text NOT NULL, notes text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.finance_transactions (
 id uuid PRIMARY KEY, type text NOT NULL CHECK(type IN ('income','expense')), amount numeric(18,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), category text NOT NULL, transaction_date date NOT NULL, note text NOT NULL DEFAULT '',
 campaign_id uuid REFERENCES marketing_factory.campaigns(id), lead_id uuid REFERENCES marketing_factory.leads(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.delivery_jobs (
 id uuid PRIMARY KEY, artifact_id uuid NOT NULL UNIQUE REFERENCES marketing_factory.artifacts(id), status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, lease_owner uuid, next_attempt_at timestamptz NOT NULL DEFAULT now(), upload_url text, drive_file_id text,
 uploaded_bytes bigint NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.integrations (
 id text PRIMARY KEY, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.owner_sessions (
 id uuid PRIMARY KEY, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_factory.login_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS factory_tasks_status ON marketing_factory.tasks(status,updated_at);
CREATE INDEX IF NOT EXISTS factory_events_run ON marketing_factory.worker_events(run_id,id);
CREATE INDEX IF NOT EXISTS factory_follow_up ON marketing_factory.leads(next_follow_up);
CREATE INDEX IF NOT EXISTS factory_delivery_pending ON marketing_factory.delivery_jobs(status,next_attempt_at);
ALTER TABLE marketing_factory.task_runs ADD COLUMN IF NOT EXISTS adapter_error text;
INSERT INTO marketing_factory.workers(id,name,mode) VALUES
 ('script_writer','Script Writer','local_codex'),('video_editor','Video Editor','local_codex'),('crm','Lead Tracker','manual'),('finance','Finance','manual') ON CONFLICT(id) DO NOTHING;

ALTER TABLE marketing_factory.artifacts DROP CONSTRAINT IF EXISTS artifacts_task_id_sha256_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS factory_artifact_run_content ON marketing_factory.artifacts(task_id,sha256,type,run_id) NULLS NOT DISTINCT;
