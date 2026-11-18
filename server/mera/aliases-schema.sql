CREATE TABLE IF NOT EXISTS mera_slug_claims (
 slug TEXT PRIMARY KEY CHECK(slug=lower(slug) AND length(slug) BETWEEN 3 AND 50 AND slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
 organization_id TEXT NOT NULL REFERENCES mera_organizations(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mera_slug_claim_organization ON mera_slug_claims(organization_id);
INSERT INTO mera_slug_claims(slug,organization_id)
 SELECT slug,id FROM mera_organizations
 ON CONFLICT(slug) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM mera_organizations o JOIN mera_slug_claims c ON c.slug=o.slug WHERE c.organization_id<>o.id) THEN
  RAISE EXCEPTION 'Canonical organization slug conflicts with a preserved slug claim';
 END IF;
END $$;
