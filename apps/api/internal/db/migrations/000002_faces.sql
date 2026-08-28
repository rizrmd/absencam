-- Face enroll + scan. Embeddings are L2-normalized; cosine via pgvector HNSW.
-- Default model is OpenCV SFace (128-d, Apache-2.0). Swap model_id + dim together.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT people_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    embedding vector(128) NOT NULL,
    model_id TEXT NOT NULL,
    quality REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_embeddings_person_idx
    ON face_embeddings (person_id);

CREATE INDEX IF NOT EXISTS face_embeddings_model_idx
    ON face_embeddings (model_id);

CREATE INDEX IF NOT EXISTS face_embeddings_hnsw
    ON face_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS attendance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES people (id) ON DELETE SET NULL,
    matched BOOLEAN NOT NULL,
    similarity REAL,
    model_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_events_created_idx
    ON attendance_events (created_at DESC);
