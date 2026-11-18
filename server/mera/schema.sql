CREATE TABLE IF NOT EXISTS mera_organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE CHECK(slug=lower(slug)),branding JSONB NOT NULL DEFAULT '{}',onboarding JSONB NOT NULL DEFAULT '{}',policy JSONB NOT NULL,subscription JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mera_branches(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES mera_organizations(id),name TEXT NOT NULL,timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',currency TEXT NOT NULL DEFAULT 'NGN',cutoff INTEGER NOT NULL DEFAULT 0 CHECK(cutoff>=0 AND cutoff<1440),settings JSONB NOT NULL DEFAULT '{}',menu_version INTEGER NOT NULL DEFAULT 0,published_menu JSONB NOT NULL DEFAULT '[]',UNIQUE(organization_id,id));
CREATE TABLE IF NOT EXISTS mera_memberships(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),organization_id TEXT NOT NULL REFERENCES mera_organizations(id),role TEXT NOT NULL,permissions JSONB NOT NULL,branch_ids JSONB NOT NULL DEFAULT '[]',organization_wide BOOLEAN NOT NULL DEFAULT false,active BOOLEAN NOT NULL DEFAULT true,UNIQUE(user_id,organization_id));
CREATE TABLE IF NOT EXISTS mera_records(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,branch_id TEXT NOT NULL,kind TEXT NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(organization_id,branch_id) REFERENCES mera_branches(organization_id,id));
CREATE INDEX IF NOT EXISTS mera_record_scope ON mera_records(organization_id,branch_id,kind,created_at);
CREATE TABLE IF NOT EXISTS mera_guests(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,organization_id TEXT NOT NULL REFERENCES mera_organizations(id),display_name TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS mera_invitations(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES mera_organizations(id),token_hash TEXT UNIQUE NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,permissions JSONB NOT NULL,branch_ids JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL,revoked BOOLEAN NOT NULL DEFAULT false,accepted BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS mera_platform_members(user_id TEXT PRIMARY KEY REFERENCES users(id),active BOOLEAN NOT NULL DEFAULT true,strong_auth_verified BOOLEAN NOT NULL DEFAULT false);
CREATE OR REPLACE FUNCTION mera_record_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.data->>'historicalReadOnly'='true' THEN
  RAISE EXCEPTION 'Imported historical records are read-only';
 END IF;
 IF TG_OP <> 'INSERT' AND OLD.kind IN ('ledger','audit','provider_event','financial_request_resolution','writeoff','minimum_spend_waiver','deposit_hold','deposit_refund','deposit_forfeiture') THEN
  RAISE EXCEPTION 'Mera ledger and audit records are append-only';
 END IF;
 IF TG_OP <> 'DELETE' AND NEW.kind='ledger' THEN
  IF NEW.data->'postings' IS NULL OR jsonb_typeof(NEW.data->'postings') <> 'array' OR jsonb_array_length(NEW.data->'postings') < 2 THEN
   RAISE EXCEPTION 'Ledger requires balanced postings';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.data->'postings') p WHERE jsonb_typeof(p->'debit') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'credit') IS DISTINCT FROM 'number' OR (p->>'debit')::numeric<0 OR (p->>'credit')::numeric<0 OR (p->>'debit')::numeric<>trunc((p->>'debit')::numeric) OR (p->>'credit')::numeric<>trunc((p->>'credit')::numeric)) OR (SELECT sum((p->>'debit')::numeric-(p->>'credit')::numeric) FROM jsonb_array_elements(NEW.data->'postings') p) <> 0 THEN
   RAISE EXCEPTION 'Ledger entries must balance in integer minor units';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mera_record_immutable ON mera_records;
CREATE TRIGGER mera_record_immutable BEFORE INSERT OR UPDATE OR DELETE ON mera_records FOR EACH ROW EXECUTE FUNCTION mera_record_immutability();

CREATE INDEX IF NOT EXISTS mera_record_requests ON mera_records(organization_id,branch_id,kind,(data->>'requestKey')) WHERE data ? 'requestKey';
CREATE INDEX IF NOT EXISTS mera_held_orders ON mera_records(organization_id,branch_id,(data->>'holdExpiresAt')) WHERE kind='order' AND data->>'stockHeld'='true';
CREATE INDEX IF NOT EXISTS mera_bill_charges ON mera_records USING GIN ((data->'charges')) WHERE kind='bill';

CREATE UNIQUE INDEX IF NOT EXISTS mera_paid_document_keys ON mera_records(organization_id,branch_id,(data->>'documentKey')) WHERE kind='print_job' AND data->>'automaticPaid'='true';
