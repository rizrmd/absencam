#!/bin/sh
# Install PostgreSQL 18 + pgvector under $HOME (no docker, no root).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/sandbox-env.sh"

PREFIX="${HOME}/.local/pgsql"
DEP="${HOME}/.local/pgsql-deps/root"
APKDIR="${HOME}/.local/pgsql-deps/apk"
PGDATA="${HOME}/.local/pgdata"
PG_VER="18.6.0"
PG_TARGET="x86_64-unknown-linux-musl"
PG_URL="https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VER}/postgresql-${PG_VER}-${PG_TARGET}.tar.gz"
# Pin Alpine 3.21 so ICU stays at libicu*.so.74 (theseus musl postgres is linked to 74).
# Current Alpine 3.23 ships ICU 76, which will not load.
ALPINE_MAIN="https://dl-cdn.alpinelinux.org/alpine/v3.21/main/x86_64"
ALPINE_COMMUNITY="https://dl-cdn.alpinelinux.org/alpine/v3.23/community/x86_64"

mkdir -p "${HOME}/.local/bin" "$PREFIX" "$APKDIR" "$DEP"

download() {
	url="$1"
	out="$2"
	if [ -f "$out" ] && [ "$(wc -c < "$out")" -gt 1000 ]; then
		return 0
	fi
	curl -fL --retry 3 --retry-delay 2 -o "$out" "$url"
}

extract_apk() {
	apk="$1"
	tar -xzf "$apk" -C "$DEP"
}

if [ ! -x "$PREFIX/bin/postgres" ]; then
	echo "downloading PostgreSQL ${PG_VER} (${PG_TARGET})"
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	archive="$tmp/postgresql.tar.gz"
	download "$PG_URL" "$archive"
	tar -xzf "$archive" -C "$tmp"
	found="$(find "$tmp" -type f -name postgres | head -n 1)"
	if [ -z "$found" ]; then
		echo "postgres binary missing from archive" >&2
		exit 1
	fi
	src="$(CDPATH= cd -- "$(dirname -- "$found")/.." && pwd)"
	mkdir -p "$PREFIX"
	cp -a "$src"/. "$PREFIX"/
	rm -rf "$tmp"
	trap - EXIT
fi

# ICU / Kerberos shared libs (theseus musl postgres is dynamically linked).
for apk in \
	icu-data-full-74.2-r1.apk \
	icu-libs-74.2-r1.apk \
	libcom_err-1.47.1-r1.apk \
	keyutils-libs-1.6.3-r4.apk \
	libverto-0.3.2-r2.apk \
	krb5-libs-1.21.3-r0.apk
do
	download "${ALPINE_MAIN}/${apk}" "${APKDIR}/${apk}"
	extract_apk "${APKDIR}/${apk}"
done

if [ ! -f "$PREFIX/lib/vector.so" ]; then
	echo "installing pgvector 0.8.1"
	tmp="$(mktemp -d)"
	apk="${APKDIR}/postgresql-pgvector-0.8.1-r0.apk"
	download "${ALPINE_COMMUNITY}/postgresql-pgvector-0.8.1-r0.apk" "$apk"
	tar -xzf "$apk" -C "$tmp"
	so="$(find "$tmp" -name vector.so | head -n 1)"
	ext="$(find "$tmp" -name vector.control | head -n 1)"
	if [ -z "$so" ] || [ -z "$ext" ]; then
		echo "pgvector files missing from apk" >&2
		exit 1
	fi
	mkdir -p "$PREFIX/lib" "$PREFIX/share/extension"
	cp "$so" "$PREFIX/lib/vector.so"
	cp "$(dirname -- "$ext")"/* "$PREFIX/share/extension/"
	rm -rf "$tmp"
fi

# Re-export after extract: sandbox-env.sh only sets this when usr/lib already exists.
export LD_LIBRARY_PATH="${DEP}/usr/lib:${DEP}/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export ICU_DATA="${DEP}/usr/share/icu/74.2"

ln -sfn "$PREFIX/bin/pg_ctl" "${HOME}/.local/bin/pg_ctl"
ln -sfn "$PREFIX/bin/postgres" "${HOME}/.local/bin/postgres"
ln -sfn "$PREFIX/bin/psql" "${HOME}/.local/bin/psql-local"
ln -sfn "$PREFIX/bin/initdb" "${HOME}/.local/bin/initdb"
ln -sfn "$PREFIX/bin/pg_isready" "${HOME}/.local/bin/pg_isready"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
	echo "initializing cluster at $PGDATA"
	rm -rf "$PGDATA"
	mkdir -p "$PGDATA"
	if ! "$PREFIX/bin/postgres" --version >/dev/null; then
		echo "postgres cannot load (check LD_LIBRARY_PATH=$LD_LIBRARY_PATH)" >&2
		ldd "$PREFIX/bin/postgres" >&2 || true
		exit 1
	fi
	pwfile="$(mktemp)"
	echo absencam > "$pwfile"
	"$PREFIX/bin/initdb" \
		-D "$PGDATA" \
		--username=absencam \
		--pwfile="$pwfile" \
		--auth-local=trust \
		--auth-host=scram-sha-256 \
		--encoding=UTF8 \
		--locale=C
	rm -f "$pwfile"
	cat >> "$PGDATA/postgresql.conf" <<'CONF'

# absencam sandbox
listen_addresses = '127.0.0.1'
port = 5432
unix_socket_directories = '/tmp'
shared_buffers = 128MB
max_connections = 40
CONF
	cat > "$PGDATA/pg_hba.conf" <<'HBA'
local   all             all                                     trust
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
HBA
fi

echo "postgres prefix ready at $PREFIX"
