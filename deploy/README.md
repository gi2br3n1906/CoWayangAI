# CoWayangAI FOH-only VPS deployment

This bundle deploys only the browser FOH translator to `cowayangai.site`:

- Node backend + Socket.IO on `127.0.0.1:3010` under systemd `cowayangai-backend.service`
- Firebase Admin Auth verification and Firestore persistence
- Gemini `gemini-3.5-flash-lite`
- Frontend static build served by Nginx
- No `backend-ai`, YOLO, ASR Python process, or unresolved `asrllmserve` gitlink

## Before the morning deploy

1. Ensure the VPS has Ubuntu packages `nginx`, `curl`, `tar`, `systemd`, npm, and Node.js satisfying `^20.19.0 || >=22.12.0` (20.19+ within 20.x, or 22.12+ including later majors; 21.x is not supported). Verify with `node -p 'process.versions.node'`.
2. Ensure DNS `cowayangai.site` points to the VPS. Do not run Certbot until the HTTP site responds.
3. In Firebase Console:
   - Enable Email/Password or the selected providers.
   - Add `cowayangai.site` to Authentication → Settings → Authorized domains.
   - Create Firestore in production mode.
   - Apply `deploy/firestore.rules`.
   - Create a server service account with Firebase Authentication token verification and Firestore access; download its JSON directly to `/etc/cowayangai/firebase-admin.json`.
4. Fill these files on the VPS, never in Git:

```bash
sudo install -d -m 0750 /etc/cowayangai
sudo cp deploy/backend.production.env.example /etc/cowayangai/backend.env
sudo cp deploy/frontend.production.env.example /etc/cowayangai/frontend.env
sudo chmod 600 /etc/cowayangai/backend.env /etc/cowayangai/frontend.env
sudoedit /etc/cowayangai/backend.env
sudoedit /etc/cowayangai/frontend.env
```

`backend.env` must contain a real `GEMINI_API_KEY`, the Firebase credential path, and `ALLOWED_ORIGINS=https://cowayangai.site`. `frontend.env` must contain the Firebase Web App values. Never paste either file into chat or commit them.

## Build and upload

From the repository root on the development machine:

```bash
bash deploy/build-release.sh
scp releases/cowayangai-YYYYMMDDTHHMMSSZ.tar.gz YOUR_VPS_USER@cowayangai.site:/tmp/
scp deploy/install-vps.sh YOUR_VPS_USER@cowayangai.site:/tmp/
```

## Install on VPS

Run the exact archive path printed by the build step:

```bash
sudo ALLOW_LEGACY_CLEANUP=1 ALLOW_NGINX_REPLACE=1 bash /tmp/install-vps.sh /tmp/cowayangai-YYYYMMDDTHHMMSSZ.tar.gz
```

The installer validates the Node version and required configuration before changing the service. `ALLOW_NGINX_REPLACE=1` permits replacing an existing site config and creates a root-only backup first; `ALLOW_LEGACY_CLEANUP=1` permits stopping the active legacy service. After switching releases, failure triggers a best-effort rollback of the release symlink, Nginx files and service unit/state; it reloads Nginx when needed and restarts a previously active backend. Read any rollback warning and inspect the printed `/root/cowayangai-rollback-*` backup and system logs if recovery fails. Rollback does not undo npm installs, release directories, or permissions changed earlier. It does not run PM2 or a Python service.

Then enable HTTPS:

```bash
sudo certbot --nginx -d cowayangai.site
```

On later installs the installer automatically selects the checked-in HTTPS template when the certificate and Certbot TLS option files exist; otherwise it selects HTTP. Inspect `sudo nginx -t` and the active site after installation.

Verify:

```bash
sudo bash /var/www/cowayangai.site/current/deploy/smoke-vps.sh https://cowayangai.site
# Optional: include a public stream key to check latest and SSE headers.
sudo bash /var/www/cowayangai.site/current/deploy/smoke-vps.sh https://cowayangai.site YOUR_STREAM_KEY
sudo systemctl status cowayangai-backend --no-pager
sudo journalctl -u cowayangai-backend -n 100 --no-pager
```

## Morning FOH test

1. Open `https://cowayangai.site/foh-admin` signed out. It must redirect to login.
2. Login with the operator Firebase account.
3. Create a stable key such as `tmii-nov4`.
4. Copy the three generated public output links into OBS/browser sources.
5. Click **Mulai tangkap audio** and grant microphone permission.
6. Speak a short known Javanese phrase; verify Jawa, Indonesia, and English outputs.
7. Refresh `/foh-admin`: the stream key/links must reappear and the upload token must be silently rotated. Click audio capture again; the browser cannot keep microphone capture across refresh.
8. Open one output link in a private/incognito window without login; it must remain read-only/public.
9. Click **Akhiri sesi**, verify the old upload token stops working, then resume the same stream key and verify the public links did not change.
10. Verify another Firebase account cannot list, resume, upload to, or end the first account's stream.

Never call the provider from the automated test suite. The first real Gemini request is the explicit production smoke test above.

## Installer regression checks

On Linux, from the repository root, run:

```bash
python3 deploy/test-install-integration.py
bash deploy/test-installer.sh
bash deploy/test-smoke.sh
for script in deploy/*.sh; do bash -n "$script"; done
```

These use temporary fixtures and mocked system commands, not a live Nginx/systemd deployment or real secrets. The SSE check accepts curl's expected timeout only when HTTP 200 and `text/event-stream` headers were received.
