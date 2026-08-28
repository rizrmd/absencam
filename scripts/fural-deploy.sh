#!/bin/sh
# fural-agent repos ship (auto) → custom sandbox "absencam"
# (https://absencam-rizprive.fural.space/ on :3000).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BOOT="$ROOT/scripts/sandbox-boot.sh"

if ! command -v fural-agent >/dev/null 2>&1; then
	echo "fural-agent not on PATH; cannot deploy to custom sandbox" >&2
	exit 1
fi

SID="$(fural-agent sandboxes list | python3 -c '
import json,sys
rows=json.load(sys.stdin)
for row in rows:
    if row.get("slug")=="absencam" or row.get("name")=="absencam":
        print(row["id"])
        break
else:
    sys.exit("custom sandbox absencam not found")
')"

echo "deploying to custom sandbox $SID"
fural-agent sandboxes update "$SID" --boot-script-file "$BOOT"
# Stop a previous boot (the API is the boot process) so the new script can bind :3000.
fural-agent sandboxes stop "$SID" --name boot >/dev/null 2>&1 || true
fural-agent sandboxes on "$SID" >/dev/null
fural-agent sandboxes boot "$SID"

echo "boot started; public URL https://absencam-rizprive.fural.space/"
echo "watch: fural-agent sandboxes logs $SID --name boot --lines 80"
