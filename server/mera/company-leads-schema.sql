CREATE TABLE IF NOT EXISTS mera_company_leads (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('consultancy','travel_interest')),
 reference TEXT UNIQUE NOT NULL,
 request_key TEXT UNIQUE NOT NULL,
 payload_hash TEXT NOT NULL,
 data JSONB NOT NULL,
 acknowledgement JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','discovery','proposal','closed')),
 assigned_handler_id TEXT REFERENCES users(id),
 follow_up JSONB NOT NULL DEFAULT '{"stage":"none","dueAt":null,"summary":""}',
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mera_company_leads_inbox ON mera_company_leads(kind,status,created_at DESC);
CREATE TABLE IF NOT EXISTS mera_company_documents (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL REFERENCES mera_company_leads(id),
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 bytes BYTEA NOT NULL,
 sha256 TEXT NOT NULL,
 byte_length INTEGER NOT NULL CHECK(byte_length>0 AND byte_length<=524288),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mera_company_documents_lead ON mera_company_documents(lead_id);
CREATE TABLE IF NOT EXISTS mera_company_lead_changes (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL REFERENCES mera_company_leads(id),
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 data JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(lead_id,request_key)
);
