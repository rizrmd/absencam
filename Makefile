.PHONY: help db-up db-down db-logs api web test test-api build tidy fmt

API_DIR := apps/api
WEB_DIR := apps/web
export CGO_ENABLED := 0

help:
	@echo "Absencam monorepo"
	@echo "  make db-up      Start PostgreSQL via docker compose"
	@echo "  make db-down    Stop PostgreSQL"
	@echo "  make api        Run the Go API on :8080"
	@echo "  make web        Run the Vite dev server on :5173"
	@echo "  make test       Run API tests"
	@echo "  make build      Build API binary and web production bundle"
	@echo "  make tidy       go mod tidy"
	@echo "  make fmt        gofmt + (optional) frontend lint"

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

api:
	cd $(API_DIR) && go run ./cmd/api

web:
	cd $(WEB_DIR) && npm run dev

test: test-api

test-api:
	cd $(API_DIR) && go test ./...

build:
	cd $(API_DIR) && CGO_ENABLED=0 go build -o bin/api ./cmd/api
	cd $(WEB_DIR) && npm run build

tidy:
	cd $(API_DIR) && go mod tidy

fmt:
	cd $(API_DIR) && gofmt -w .
	cd $(WEB_DIR) && npm run lint
