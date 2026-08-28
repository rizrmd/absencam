# Absencam

Monorepo for Absencam: a Go API with PostgreSQL, and a Vite + React frontend.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Go 1.27, stdlib `net/http`, `pgx` |
| Database | PostgreSQL 17 |
| Frontend | Vite 8, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand |

## Layout

```
apps/api    Go HTTP API
apps/web    Vite + React SPA
```

See [AGENTS.md](./AGENTS.md) for conventions and how to extend this repo.

## Quick start (sandbox, no docker-compose)

Postgres + pgvector run natively under `$HOME/.local` (see `scripts/sandbox-postgres.sh`).

```bash
cp .env.example .env
make db-up          # PostgreSQL 18 + pgvector on :5432
make models         # SFace ONNX into apps/web/public/models
make api            # API on :8080
make web            # frontend on :3000 (proxies /api)
```

Public sandbox: [https://absencam-rizprive.fural.space/](https://absencam-rizprive.fural.space/) (custom sandbox boot on `:3000`). Deploy with `make deploy` / `scripts/fural-deploy.sh`.

Health check: `GET http://localhost:8080/api/health`  
Readiness (Postgres): `GET http://localhost:8080/api/ready`

Face APIs:

- `POST /api/v1/faces/enroll` — `{ code, full_name, embeddings: number[][] }`
- `POST /api/v1/faces/scan` — `{ embedding: number[] }`
- `GET /api/v1/people`
- `DELETE /api/v1/people/{id}` — hapus orang + embedding (attendance events jadi `person_id` null)

Embeddings are computed **in the browser** (MediaPipe detect + OpenCV SFace 128-d). The Go API never runs a face model (no GPU, `CGO_ENABLED=0`). PostgreSQL stores `vector(128)` with an HNSW cosine index.

## Scripts

| Command | What it does |
| --- | --- |
| `make db-up` | Start Postgres via Docker Compose |
| `make api` | `go run ./cmd/api` |
| `make web` | `npm run dev` in `apps/web` |
| `make test` | Go tests |
| `make build` | API binary + web production bundle |
