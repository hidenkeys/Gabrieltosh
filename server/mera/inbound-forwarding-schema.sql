CREATE TABLE IF NOT EXISTS mera_inbound_forwards (
  inbox_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_email_id TEXT,
  last_http_status INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(inbox_id,email_id)
);
