# Absencam — agent notes

This file is the working contract for humans and coding agents in this repo.

## What this is

Absencam is a **monorepo**:

- **Backend:** Go HTTP API + PostgreSQL
- **Frontend:** latest Vite + React + TypeScript + shadcn/ui + Zustand

The product is attendance / absence capture. Keep the scaffold thin until a feature is requested. Do not invent extra apps, packages, or frameworks.

## Tech stack (do not replace unless asked)

| Area | Choice | Notes |
| --- | --- | --- |
| Language (API) | Go 1.27 | Module: `github.com/rizrmd/absencam/apps/api` |
| HTTP | stdlib `net/http` ServeMux | Go 1.22+ method+path patterns (`GET /api/health`) |
| Postgres driver | `jackc/pgx/v5` (`pgxpool`) | Pure Go, `CGO_ENABLED=0` |
| Migrations | SQL files embedded in `internal/db` | Applied on API boot |
| Frontend | Vite 8 + React 19 + TypeScript | App lives in `apps/web` |
| UI | Tailwind CSS v4 + shadcn/ui (`base-nova`, Base UI, Geist) | Components copied into `src/components/ui` |
| Client state | Zustand | No Redux. Server cache can be added later if needed. |
| Local Postgres | Native in the sandbox (`scripts/sandbox-postgres.sh`, PostgreSQL 18 + pgvector) | User/password/db: `absencam`. Do **not** use docker-compose for this app. |

Do **not** switch to Next.js, Python, FastAPI, Vue, Chi/Gin/Echo, Prisma, or Redux unless the human asks.

## Layout

```
.
├── AGENTS.md                 # this file
├── README.md
├── Makefile
├── scripts/                  # sandbox Postgres + model download
├── .env.example
├── apps/
│   ├── api/                  # Go module
│   │   ├── cmd/api/          # process entrypoint only
│   │   ├── internal/
│   │   │   ├── config/       # env-based config
│   │   │   ├── db/           # pool, ping, migrations
│   │   │   │   └── migrations/
│   │   │   └── httpserver/   # HTTP handlers + CORS
│   │   └── go.mod
│   └── web/                  # Vite SPA
│       ├── src/
│       │   ├── components/ui # shadcn primitives
│       │   ├── lib/          # cn() and shared helpers
│       │   ├── stores/       # Zustand stores
│       │   └── App.tsx
│       └── components.json
```

No extra top-level packages until there is a real shared need.

## Commands

Run from the **repo root**.

```bash
cp .env.example .env
make db-up          # native Postgres + pgvector on :5432
make models         # SFace ONNX into apps/web/public/models
make api            # go run ./cmd/api  → :8080
make web            # vite dev          → :3000 (proxies /api)
make test           # go test ./...
make build          # CGO_ENABLED=0 go build + vite build
make tidy           # go mod tidy
```

Frontend-only:

```bash
cd apps/web
npm install
npm run dev
npm run build
npm run lint        # oxlint
```

API-only:

```bash
cd apps/api
go test ./...
go run ./cmd/api
```

## Environment

Copy `.env.example` to `.env`. The API reads process env (not a `.env` parser). Export or use your shell / compose.

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_ADDR` | `:8080` | Listen address |
| `DATABASE_URL` | `postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable` | pgx DSN |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowlist (`*` allowed) |
| `APP_ENV` | `development` | Logged and returned from `/api/v1/info` |
| `VITE_API_BASE_URL` | empty | Leave empty in dev so the Vite proxy is used |

The API **starts even if Postgres is down**. `GET /api/health` is liveness. `GET /api/ready` pings the database and returns 503 when it is unavailable.

## API conventions

- JSON only. `Content-Type: application/json`.
- Routes live under `/api`. Current:
  - `GET /api/health` — process up
  - `GET /api/ready` — Postgres ping
  - `GET /api/v1/info` — name, version, env
- Version new resource APIs as `/api/v1/...`.
- Handlers stay small. Put SQL and domain logic in `internal/` packages, not `cmd/api`.
- `cmd/api/main.go` wires config, db, HTTP, and graceful shutdown. Do not put business logic there.
- Use `log/slog` JSON logs.
- Add table-driven tests next to the package (`handlers_test.go` is the pattern).
- New SQL goes in `internal/db/migrations/NNNNNN_name.sql` (zero-padded, sortable). Never edit an already-applied migration; add a new file.
- Keep `CGO_ENABLED=0` (the Makefile exports it). Do not add CGO dependencies. The sandbox often has no working gcc; pgx is pure Go.

## Frontend conventions

- Path alias `@/` → `apps/web/src/`.
- shadcn is initialized with `--template vite --base base --preset nova`. Add more with `npx shadcn@latest add <name>` from `apps/web`. Do not hand-roll duplicates of primitives that shadcn already ships.
- Zustand stores live in `src/stores/`. One concern per store. Do not stuff server cache into React context.
- Vite proxies `/api` to `http://127.0.0.1:8080` in development.
- Styling is Tailwind utility classes + shadcn tokens. Avoid a second CSS system.
- Keep `App.tsx` as a composition root. Extract feature UI into `src/components/` or `src/features/` when it grows.

## How to add a feature

1. Schema first: new migration in `apps/api/internal/db/migrations/`.
2. API: handler + tests in `internal/httpserver` (or a new internal package if it is more than HTTP).
3. Frontend: Zustand store (if client state) + shadcn UI.
4. `make test` and `npm run build` in `apps/web` before calling the work done.

## Do not

- Do not introduce a second frontend or backend.
- Do not commit `.env`, `node_modules`, or `apps/api/bin/`.
- Do not rewrite git identity; commits are authored as the human org member.
- Do not add Coolify / fastdeploy / host inject deploy paths.
- Do not expand scope past the asked feature.

## Verification (minimum)

Before finishing implementation work:

```bash
cd apps/api && go test ./... && CGO_ENABLED=0 go build -o /tmp/absencam-api ./cmd/api
cd apps/web && npm run build
```
