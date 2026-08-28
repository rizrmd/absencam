#!/bin/sh
# Custom-sandbox boot for absencam-rizprive.fural.space (port 3000).
# Idempotent: clone/pull, install Go + Postgres, build, then exec the API.
set -eu

export HOME="${HOME:-/home/dev}"
export PATH="${HOME}/.local/bin:${HOME}/.local/go/bin:${PATH}"
export CGO_ENABLED=0

REPO="${ABSENCAM_REPO:-${HOME}/projects/absencam}"
CLONE_URL="${ABSENCAM_CLONE_URL:-https://github.com/rizrmd/absencam.git}"
GO_VER="${GO_VERSION:-1.27.0}"
mkdir -p "${HOME}/.local" "${HOME}/projects"

echo "=== absencam boot $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

install_go() {
	if command -v go >/dev/null 2>&1; then
		echo "go $(go version)"
		return 0
	fi
	echo "installing Go ${GO_VER}"
	tmp="$(mktemp -d)"
	curl -fL --retry 3 -o "$tmp/go.tgz" "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz"
	rm -rf "${HOME}/.local/go"
	tar -C "${HOME}/.local" -xzf "$tmp/go.tgz"
	rm -rf "$tmp"
	ln -sfn "${HOME}/.local/go/bin/go" "${HOME}/.local/bin/go"
	ln -sfn "${HOME}/.local/go/bin/gofmt" "${HOME}/.local/bin/gofmt"
}

sync_repo() {
	if [ -d "$REPO/.git" ]; then
		echo "updating $REPO"
		git -C "$REPO" fetch --depth 1 origin main
		git -C "$REPO" checkout -B main FETCH_HEAD
	else
		echo "cloning $CLONE_URL → $REPO"
		rm -rf "$REPO"
		git clone --depth 1 --branch main "$CLONE_URL" "$REPO"
	fi
}

build_web() {
	# Postgres env (ICU 74 via LD_LIBRARY_PATH) must not leak into Node (ICU 76).
	unset ICU_DATA || true
	export LD_LIBRARY_PATH=""
	cd "$REPO"
	./scripts/download-models.sh
	cd "$REPO/apps/web"
	if [ -f package-lock.json ]; then
		npm ci --no-audit --no-fund
	else
		npm install --no-audit --no-fund
	fi
	# Skip tsc; vite build is enough to produce dist/ for the API to serve.
	npx vite build
}

build_api() {
	cd "$REPO/apps/api"
	go build -o "${HOME}/.local/bin/absencam-api" ./cmd/api
}

install_go
sync_repo
# Run postgres install/start in a subshell so LD_LIBRARY_PATH does not leak into npm.
(
	# shellcheck disable=SC1091
	. "$REPO/scripts/sandbox-env.sh"
	"$REPO/scripts/install-sandbox-postgres.sh"
	"$REPO/scripts/sandbox-postgres.sh" start
) || echo "postgres install/start failed (API will start degraded)"
build_web
build_api

export API_ADDR="${API_ADDR:-:3000}"
export APP_ENV="${APP_ENV:-production}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"
export WEB_DIST="${WEB_DIST:-$REPO/apps/web/dist}"
export DATABASE_URL="${DATABASE_URL:-postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable}"

echo "starting API on ${API_ADDR} web_dist=${WEB_DIST}"
exec "${HOME}/.local/bin/absencam-api"
