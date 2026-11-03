#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "Usage: sudo ALLOW_LEGACY_CLEANUP=1 ALLOW_NGINX_REPLACE=1 bash deploy/install-vps.sh /tmp/cowayangai-YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 2
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run as root because this script writes /var/www, /etc/nginx, and /etc/cowayangai.' >&2
  exit 2
fi
if [[ "$(systemctl is-active cowayangai.service 2>/dev/null || true)" == active && "${ALLOW_LEGACY_CLEANUP:-0}" != 1 ]]; then
  echo 'Legacy cowayangai.service is active. Re-run with ALLOW_LEGACY_CLEANUP=1 to replace it.' >&2
  exit 1
fi
for command in node npm nginx tar curl systemctl; do command -v "${command}" >/dev/null || { echo "Missing command: ${command}" >&2; exit 1; }; done
# BEGIN INSTALLER HELPERS
node_supported() {
  local version="$1" major minor patch
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || return 1
  major=${BASH_REMATCH[1]}; minor=${BASH_REMATCH[2]}; patch=${BASH_REMATCH[3]}
  (( (major == 20 && minor >= 19) || (major == 22 && minor >= 12) || major >= 23 ))
}

rollback_deploy() {
  local failed=0 path backup existed
  echo 'Deployment failed; restoring previous configuration.' >&2
  if [[ -n "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$APP_ROOT/current.rollback" && mv -Tf "$APP_ROOT/current.rollback" "$APP_ROOT/current" || failed=1
  else
    rm -f "$APP_ROOT/current" || failed=1
  fi
  if (( NGINX_CHANGED )); then
    for path in available enabled; do
      if [[ "$path" == available ]]; then backup="$NGINX_AVAILABLE"; existed="$NGINX_AVAILABLE_EXISTED"; else backup="$NGINX_ENABLED"; existed="$NGINX_ENABLED_EXISTED"; fi
      rm -f "$backup" || failed=1
      if (( existed )); then cp -a "$ROLLBACK_DIR/nginx-$path" "$backup" || failed=1; fi
    done
    if (( NGINX_RELOAD_ATTEMPTED )); then
      if nginx -t; then systemctl reload nginx || failed=1; else failed=1; fi
    fi
  fi
  if (( UNIT_CHANGED )); then
    if [[ "$BACKEND_ACTIVE_BEFORE" != active ]]; then systemctl stop cowayangai-backend.service || failed=1; fi
    if [[ "$BACKEND_ENABLED_BEFORE" != enabled ]]; then systemctl disable cowayangai-backend.service || failed=1; fi
    rm -f "$UNIT_FILE" || failed=1
    if (( UNIT_EXISTED )); then cp -a "$ROLLBACK_DIR/unit" "$UNIT_FILE" || failed=1; fi
    systemctl daemon-reload || failed=1
    if [[ "$BACKEND_ENABLED_BEFORE" == enabled ]]; then systemctl enable cowayangai-backend.service || failed=1; fi
    if [[ "$BACKEND_ACTIVE_BEFORE" == active ]]; then systemctl restart cowayangai-backend.service || failed=1; fi
  fi
  if (( LEGACY_CHANGED )); then
    if [[ "$LEGACY_ENABLED_BEFORE" == enabled ]]; then systemctl enable cowayangai.service || failed=1; fi
    if [[ "$LEGACY_ACTIVE_BEFORE" == active ]]; then systemctl restart cowayangai.service || failed=1; fi
  fi
  if (( failed )); then echo "WARNING: rollback incomplete; inspect $ROLLBACK_DIR and systemctl/nginx errors." >&2; return 1; fi
  echo "Previous configuration restored. Backup: $ROLLBACK_DIR" >&2
}
# END INSTALLER HELPERS

node_version="$(node -p 'process.versions.node')"
if ! node_supported "$node_version"; then echo "Node.js ^20.19.0 or >=22.12.0 is required (found $node_version)." >&2; exit 1; fi
NODE_BIN="$(command -v node)"

APP_ROOT="/var/www/cowayangai.site"
RELEASES="${APP_ROOT}/releases"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="${RELEASES}/${STAMP}"
mkdir -p "${RELEASES}" "${APP_ROOT}/logs" /etc/cowayangai

NGINX_AVAILABLE=/etc/nginx/sites-available/cowayangai.site
NGINX_ENABLED=/etc/nginx/sites-enabled/cowayangai.site
if [[ -e "${NGINX_AVAILABLE}" || -L "${NGINX_AVAILABLE}" || -e "${NGINX_ENABLED}" || -L "${NGINX_ENABLED}" ]]; then
  if [[ "${ALLOW_NGINX_REPLACE:-0}" != 1 ]]; then
    echo 'Existing cowayangai.site Nginx config found. Re-run with ALLOW_NGINX_REPLACE=1 after backup.' >&2
    exit 1
  fi
  BACKUP_DIR="/root/cowayangai-nginx-backup-${STAMP}"
  mkdir -m 0700 "${BACKUP_DIR}"
  if [[ -e "${NGINX_AVAILABLE}" || -L "${NGINX_AVAILABLE}" ]]; then cp -a "${NGINX_AVAILABLE}" "${BACKUP_DIR}/sites-available.conf"; fi
  if [[ -e "${NGINX_ENABLED}" || -L "${NGINX_ENABLED}" ]]; then cp -a "${NGINX_ENABLED}" "${BACKUP_DIR}/sites-enabled.conf"; fi
  echo "Backed up existing Nginx config to ${BACKUP_DIR}"
fi

for file in /etc/cowayangai/backend.env /etc/cowayangai/frontend.env /etc/cowayangai/firebase-admin.json; do
  [[ -f "${file}" ]] || { echo "Missing required secret/config: ${file}" >&2; exit 1; }
done
require_env_value() {
  local file="$1" key="$2"
  grep -Eq "^[[:space:]]*${key}=[^[:space:]]+" "${file}" || { echo "Missing value for ${key} in ${file}" >&2; exit 1; }
}
for key in GEMINI_API_KEY GEMINI_MODEL GOOGLE_APPLICATION_CREDENTIALS ALLOWED_ORIGINS; do require_env_value /etc/cowayangai/backend.env "${key}"; done
grep -Eq '^GEMINI_MODEL=gemini-3\.5-flash-lite$' /etc/cowayangai/backend.env || { echo 'GEMINI_MODEL must be gemini-3.5-flash-lite' >&2; exit 1; }
for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID; do require_env_value /etc/cowayangai/frontend.env "${key}"; done

mkdir -p "${RELEASE}"
tar -xzf "${ARCHIVE}" -C "${RELEASE}"
[[ -d "${RELEASE}/backend" && -d "${RELEASE}/frontend" ]] || { echo 'Archive does not contain backend/frontend.' >&2; exit 1; }
cp /etc/cowayangai/frontend.env "${RELEASE}/frontend/.env.production"
chmod 600 /etc/cowayangai/backend.env /etc/cowayangai/frontend.env /etc/cowayangai/firebase-admin.json

if [[ -f "${APP_ROOT}/current/backend/package-lock.json" ]]; then
  echo "Previous release: ${APP_ROOT}/current"
fi

(
  cd "${RELEASE}/backend"
  npm ci --omit=dev
)
(
  cd "${RELEASE}/frontend"
  npm ci
  npm run build
)

id cowayangai >/dev/null 2>&1 || useradd --system --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin cowayangai
chown -R cowayangai:cowayangai "${RELEASE}" "${APP_ROOT}/logs"
chown root:cowayangai /etc/cowayangai
chmod 750 /etc/cowayangai
chown root:cowayangai /etc/cowayangai/backend.env /etc/cowayangai/firebase-admin.json
chmod 640 /etc/cowayangai/backend.env /etc/cowayangai/firebase-admin.json

# Snapshot mutable state before switching the release, preserving symlinks.
PREVIOUS=""
if [[ -L "${APP_ROOT}/current" ]]; then PREVIOUS="$(readlink "${APP_ROOT}/current")"; fi
if [[ -e "${APP_ROOT}/current" && ! -L "${APP_ROOT}/current" ]]; then
  echo 'Refusing to replace current: it is not a symlink.' >&2; exit 1
fi
ROLLBACK_DIR="$(mktemp -d /root/cowayangai-rollback-XXXXXXXX)"
UNIT_FILE=/etc/systemd/system/cowayangai-backend.service
NGINX_AVAILABLE_EXISTED=0; NGINX_ENABLED_EXISTED=0; UNIT_EXISTED=0
if [[ -e "$NGINX_AVAILABLE" || -L "$NGINX_AVAILABLE" ]]; then cp -a "$NGINX_AVAILABLE" "$ROLLBACK_DIR/nginx-available"; NGINX_AVAILABLE_EXISTED=1; fi
if [[ -e "$NGINX_ENABLED" || -L "$NGINX_ENABLED" ]]; then cp -a "$NGINX_ENABLED" "$ROLLBACK_DIR/nginx-enabled"; NGINX_ENABLED_EXISTED=1; fi
if [[ -e "$UNIT_FILE" || -L "$UNIT_FILE" ]]; then cp -a "$UNIT_FILE" "$ROLLBACK_DIR/unit"; UNIT_EXISTED=1; fi
BACKEND_ACTIVE_BEFORE="$(systemctl is-active cowayangai-backend.service 2>/dev/null || true)"
BACKEND_ENABLED_BEFORE="$(systemctl is-enabled cowayangai-backend.service 2>/dev/null || true)"
LEGACY_ACTIVE_BEFORE="$(systemctl is-active cowayangai.service 2>/dev/null || true)"
LEGACY_ENABLED_BEFORE="$(systemctl is-enabled cowayangai.service 2>/dev/null || true)"
NGINX_CHANGED=0; NGINX_RELOAD_ATTEMPTED=0; UNIT_CHANGED=0; LEGACY_CHANGED=0
rollback_on_exit() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then set +e; rollback_deploy; fi
  exit "$status"
}
trap rollback_on_exit EXIT
ln -sfn "${RELEASE}" "${APP_ROOT}/current.next"
mv -Tf "${APP_ROOT}/current.next" "${APP_ROOT}/current"

NGINX_TEMPLATE=cowayangai.site.conf
if [[ -f /etc/letsencrypt/live/cowayangai.site/fullchain.pem && -f /etc/letsencrypt/live/cowayangai.site/privkey.pem && -f /etc/letsencrypt/options-ssl-nginx.conf && -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
  NGINX_TEMPLATE=cowayangai.site.https.conf
fi
NGINX_CHANGED=1
# Remove links first so install cannot overwrite an external symlink target.
rm -f "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
install -m 0644 "${APP_ROOT}/current/deploy/nginx/${NGINX_TEMPLATE}" "${NGINX_AVAILABLE}"
ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
nginx -t
NGINX_RELOAD_ATTEMPTED=1
systemctl reload nginx

LEGACY="$(systemctl is-active cowayangai.service 2>/dev/null || true)"
if [[ "${LEGACY}" == active && "${ALLOW_LEGACY_CLEANUP:-0}" != 1 ]]; then
  echo 'Legacy cowayangai.service is active. Re-run with ALLOW_LEGACY_CLEANUP=1 to replace it.' >&2; exit 1
fi
if [[ "${ALLOW_LEGACY_CLEANUP:-0}" == 1 && "$LEGACY" == active ]]; then
  LEGACY_CHANGED=1
  systemctl disable --now cowayangai.service
fi
UNIT_CHANGED=1
rm -f "$UNIT_FILE"
sed "s|@NODE_BIN@|${NODE_BIN}|g" "${APP_ROOT}/current/deploy/cowayangai-backend.service" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"
systemctl daemon-reload
systemctl enable cowayangai-backend.service
systemctl restart cowayangai-backend.service

for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3010/health >/dev/null; then
    echo "Deployed ${RELEASE}"
    echo 'After verifying HTTP, enable HTTPS: certbot --nginx -d cowayangai.site'
    exit 0
  fi
  sleep 1
done

echo 'Backend health check failed; inspect journalctl -u cowayangai-backend -n 100.' >&2
exit 1
