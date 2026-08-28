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

## Quick start

```bash
cp .env.example .env
make db-up          # PostgreSQL on :5432
make api            # API on :8080
make web            # frontend on :5173 (proxies /api)
```

Health check: `GET http://localhost:8080/api/health`  
Readiness (Postgres): `GET http://localhost:8080/api/ready`

## Scripts

| Command | What it does |
| --- | --- |
| `make db-up` | Start Postgres via Docker Compose |
| `make api` | `go run ./cmd/api` |
| `make web` | `npm run dev` in `apps/web` |
| `make test` | Go tests |
| `make build` | API binary + web production bundle |
