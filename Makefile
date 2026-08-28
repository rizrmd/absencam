.PHONY: help db-up db-down db-logs api web test test-api build tidy fmt models deploy

API_DIR := apps/api
WEB_DIR := apps/web
export CGO_ENABLED := 0

help:
	@echo "Absencam monorepo"
	@echo "  make db-up      Start sandbox-local PostgreSQL + pgvector"
	@echo "  make db-down    Stop PostgreSQL"
	@echo "  make api        Run the Go API on :8080"
	@echo "  make web        Run the Vite dev server on :3000"
	@echo "  make models     Download SFace ONNX into apps/web/public/models"
	@echo "  make test       Run API tests"
	@echo "  make build      Build API binary and web production bundle"
	@echo "  make tidy       go mod tidy"
	@echo "  make fmt        gofmt + (optional) frontend lint"
	@echo "  make deploy     Push-ready: scripts/fural-deploy.sh → custom sandbox :3000"

db-up:
	./scripts/sandbox-postgres.sh start

db-down:
	./scripts/sandbox-postgres.sh stop

db-logs:
	tail -f $(HOME)/.local/pgdata/postgres.log

models:
	./scripts/download-models.sh

api:
	. ./scripts/sandbox-env.sh && cd $(API_DIR) && go run ./cmd/api

web:
	cd $(WEB_DIR) && npm run dev

test: test-api

test-api:
	. ./scripts/sandbox-env.sh && cd $(API_DIR) && go test ./...

build:
	cd $(API_DIR) && CGO_ENABLED=0 go build -o bin/api ./cmd/api
	cd $(WEB_DIR) && npm run build

tidy:
	cd $(API_DIR) && go mod tidy

fmt:
	cd $(API_DIR) && gofmt -w .
	cd $(WEB_DIR) && npm run lint

deploy:
	./scripts/fural-deploy.sh
