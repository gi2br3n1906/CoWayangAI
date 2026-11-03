#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://cowayangai.site}"
STREAM_KEY="${2:-}"

printf 'Health: '
curl --fail --silent --show-error "${BASE_URL}/health"
printf '\nFrontend: '
curl --fail --silent --show-error -o /dev/null -w '%{http_code}\n' "${BASE_URL}/"

if [[ -n "${STREAM_KEY}" ]]; then
  printf 'Public latest: '
  curl --fail --silent --show-error "${BASE_URL}/api/foh-stream/${STREAM_KEY}/latest"
  printf '\nPublic SSE headers:\n'
  headers="$(mktemp)"
  trap 'rm -f "$headers"' EXIT
  status=0
  curl --fail --silent --max-time 2 -D "$headers" -o /dev/null "${BASE_URL}/api/foh-stream/${STREAM_KEY}/sse" || status=$?
  sed -n '1,12p' "$headers"
  if [[ "$status" != 0 && "$status" != 28 ]] || ! grep -Eqi '^HTTP/[0-9.]+ 200([[:space:]]|$)' "$headers" || ! grep -Eqi '^content-type:[[:space:]]*text/event-stream([;[:space:]]|$)' "$headers"; then
    echo 'SSE smoke failed: expected HTTP 200 and text/event-stream.' >&2
    exit 1
  fi
  rm -f "$headers"
  trap - EXIT
fi

printf 'systemd:\n'
systemctl status cowayangai-backend --no-pager -l
