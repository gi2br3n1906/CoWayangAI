#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat > "$tmp/bin/curl" <<'STUB'
#!/usr/bin/env bash
if [[ "$*" == *'/sse'* ]]; then
  while (($#)); do
    if [[ "$1" == -D ]]; then shift; printf 'HTTP/1.1 %s\r\nContent-Type: %s\r\n\r\n' "${HTTP_STATUS:-200 OK}" "${CONTENT_TYPE:-text/event-stream}" > "$1"; fi
    shift
done
  exit 28
fi
printf 'ok'
STUB
printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/bin/systemctl"
chmod +x "$tmp/bin/"*
PATH="$tmp/bin:$PATH" bash "$DIR/smoke-vps.sh" http://example.test stream >/dev/null
if PATH="$tmp/bin:$PATH" CONTENT_TYPE=text/html bash "$DIR/smoke-vps.sh" http://example.test stream >/dev/null 2>&1; then echo 'Accepted wrong content type' >&2; exit 1; fi
if PATH="$tmp/bin:$PATH" HTTP_STATUS='503 Unavailable' bash "$DIR/smoke-vps.sh" http://example.test stream >/dev/null 2>&1; then echo 'Accepted bad status' >&2; exit 1; fi
echo 'SSE timeout smoke test passed.'
