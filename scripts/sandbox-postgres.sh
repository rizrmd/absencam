#!/bin/sh
# Start / stop the sandbox-local PostgreSQL 18 + pgvector (no docker).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/sandbox-env.sh"

PREFIX="${HOME}/.local/pgsql"
PGDATA="${HOME}/.local/pgdata"
LOG="$PGDATA/postgres.log"

usage() {
  echo "usage: $0 start|stop|status|psql" >&2
  exit 2
}

cmd="${1:-}"
[ -n "$cmd" ] || usage

if [ ! -x "$PREFIX/bin/pg_ctl" ]; then
  echo "postgres binaries missing at $PREFIX (install them under \$HOME/.local/pgsql)" >&2
  exit 1
fi

case "$cmd" in
  start)
    if "$PREFIX/bin/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
      echo "postgres already running"
    else
      if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "cluster missing at $PGDATA; re-run the sandbox postgres bootstrap" >&2
        exit 1
      fi
      "$PREFIX/bin/pg_ctl" -D "$PGDATA" -l "$LOG" -o "-k /tmp" start
    fi
    "$PREFIX/bin/pg_isready" -h 127.0.0.1 -p 5432 -U absencam
    if ! "$PREFIX/bin/psql" -h /tmp -U absencam -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = 'absencam'" | grep -qx 1; then
      "$PREFIX/bin/createdb" -h /tmp -U absencam absencam
    fi
    ;;
  stop)
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" stop -m fast || true
    ;;
  status)
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" status
    "$PREFIX/bin/pg_isready" -h 127.0.0.1 -p 5432 -U absencam || true
    ;;
  psql)
    shift
    exec "$PREFIX/bin/psql" -h 127.0.0.1 -U absencam -d absencam "$@"
    ;;
  *)
    usage
    ;;
esac
