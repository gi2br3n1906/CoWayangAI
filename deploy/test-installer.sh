#!/usr/bin/env bash
set -euo pipefail

# Exercise installer helpers in an isolated directory; no root, network or secrets.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS="$(sed -n '/^# BEGIN INSTALLER HELPERS$/,/^# END INSTALLER HELPERS$/p' "${SCRIPT_DIR}/install-vps.sh")"
[[ -n "$HELPERS" ]] || { echo 'Installer helpers missing' >&2; exit 1; }
eval "$HELPERS"

for version in 20.19.0 20.20.1 22.12.0 22.13.0 23.0.0; do
  node_supported "$version" || { echo "Rejected $version" >&2; exit 1; }
done
for version in 18.20.0 20.18.9 21.9.0 22.11.9 19.0.0 nonsense; do
  if node_supported "$version"; then echo "Accepted $version" >&2; exit 1; fi
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
APP_ROOT="$tmp/app"; NGINX_AVAILABLE="$tmp/available"; NGINX_ENABLED="$tmp/enabled"
UNIT_FILE="$tmp/unit"; ROLLBACK_DIR="$tmp/backup"; mkdir -p "$APP_ROOT" "$ROLLBACK_DIR" "$tmp/old" "$tmp/new"
PREVIOUS="$tmp/old"; ln -s "$tmp/new" "$APP_ROOT/current"
printf 'old nginx\n' > "$ROLLBACK_DIR/nginx-available"
ln -s "$NGINX_AVAILABLE" "$ROLLBACK_DIR/nginx-enabled"
printf 'new nginx\n' > "$NGINX_AVAILABLE"; ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
printf 'old unit\n' > "$ROLLBACK_DIR/unit"
printf 'new unit\n' > "$UNIT_FILE"
NGINX_AVAILABLE_EXISTED=1; NGINX_ENABLED_EXISTED=1; UNIT_EXISTED=1
NGINX_CHANGED=1; NGINX_RELOAD_ATTEMPTED=1; UNIT_CHANGED=1; BACKEND_ENABLED_BEFORE=enabled; BACKEND_ACTIVE_BEFORE=active; LEGACY_ACTIVE_BEFORE=inactive; LEGACY_ENABLED_BEFORE=disabled; LEGACY_CHANGED=0
systemctl() { printf '%s\n' "$*" >> "$tmp/systemctl.log"; }
nginx() { return 0; }
rollback_deploy
[[ "$(readlink "$APP_ROOT/current")" == "$PREVIOUS" ]]
[[ "$(cat "$NGINX_AVAILABLE")" == 'old nginx' ]]
[[ "$(readlink "$NGINX_ENABLED")" == "$NGINX_AVAILABLE" ]]
[[ "$(cat "$UNIT_FILE")" == 'old unit' ]]
grep -qx 'restart cowayangai-backend.service' "$tmp/systemctl.log"
grep -qx 'reload nginx' "$tmp/systemctl.log"
echo 'Installer helper tests passed.'
