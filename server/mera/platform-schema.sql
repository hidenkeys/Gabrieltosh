CREATE TABLE IF NOT EXISTS mera_platform_factors(user_id TEXT PRIMARY KEY REFERENCES users(id),secret_cipher TEXT NOT NULL,last_counter BIGINT NOT NULL DEFAULT -1,failed_attempts INTEGER NOT NULL DEFAULT 0,blocked_until TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS mera_platform_stepups(session_hash TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS mera_platform_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,organization_id TEXT REFERENCES mera_organizations(id),details JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE OR REPLACE FUNCTION mera_platform_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Platform audit is append-only'; END; $$;
DROP TRIGGER IF EXISTS mera_platform_audit_immutable ON mera_platform_audit;
CREATE TRIGGER mera_platform_audit_immutable BEFORE UPDATE OR DELETE ON mera_platform_audit FOR EACH ROW EXECUTE FUNCTION mera_platform_audit_immutable();
