-- Absencam bootstrap schema. Domain tables land here as features land.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_meta (key, value)
VALUES ('app', 'absencam'), ('schema', 'v1')
ON CONFLICT (key) DO NOTHING;
