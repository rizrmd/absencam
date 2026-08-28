# Source this file:  . scripts/sandbox-env.sh
# Native Postgres + pgvector in this sandbox (no docker-compose).

PREFIX="${HOME}/.local/pgsql"
DEP="${HOME}/.local/pgsql-deps/root"
PGDATA="${HOME}/.local/pgdata"

export PATH="${PREFIX}/bin:${PATH}"
export LD_LIBRARY_PATH="${DEP}/usr/lib:${DEP}/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export ICU_DATA="${DEP}/usr/share/icu/74.2"
export PGDATA
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=absencam
export PGDATABASE=absencam
export DATABASE_URL="${DATABASE_URL:-postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"
export API_ADDR="${API_ADDR:-:8080}"
export APP_ENV="${APP_ENV:-development}"
