#!/usr/bin/env python3
"""Isolated failure-injection tests for the real installer (Linux, no root)."""
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

INSTALLER = Path(__file__).with_name('install-vps.sh').read_text()

class InstallerRollbackTest(unittest.TestCase):
    def run_case(self, mode):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            app, etc, nginx, systemd, backup, bin_dir = [root / p for p in ('app', 'etc', 'nginx', 'systemd', 'backup', 'bin')]
            for p in (app / 'releases', etc, nginx / 'sites-available', nginx / 'sites-enabled', systemd, backup, bin_dir): p.mkdir(parents=True)
            old = app / 'releases' / 'old'; old.mkdir()
            (app / 'current').symlink_to(old)
            available = nginx / 'sites-available' / 'cowayangai.site'; available.write_text('old nginx\n')
            enabled = nginx / 'sites-enabled' / 'cowayangai.site'; enabled.symlink_to(available)
            unit = systemd / 'cowayangai-backend.service'; unit.write_text('old unit\n')
            (etc / 'backend.env').write_text('GEMINI_API_KEY=fake\nGEMINI_MODEL=gemini-3.5-flash-lite\nGOOGLE_APPLICATION_CREDENTIALS=fake\nALLOWED_ORIGINS=fake\n')
            (etc / 'frontend.env').write_text(''.join(k+'=fake\n' for k in ('VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID')))
            (etc / 'firebase-admin.json').write_text('{}')
            source = root / 'source'
            for p in ('backend', 'frontend', 'deploy/nginx'): (source / p).mkdir(parents=True)
            (source / 'deploy/nginx/cowayangai.site.conf').write_text('new nginx\n')
            (source / 'deploy/cowayangai-backend.service').write_text('new @NODE_BIN@\n')
            archive = root / 'release.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                for name in ('backend', 'frontend', 'deploy'): tar.add(source / name, arcname=name)
            script = INSTALLER.replace('[[ "${EUID}" -ne 0 ]]', 'false').replace('/var/www/cowayangai.site', str(app)).replace('/etc/cowayangai', str(etc)).replace('/etc/nginx', str(nginx)).replace('/etc/systemd/system', str(systemd)).replace('/root/cowayangai-', str(backup / 'cowayangai-')).replace('/etc/letsencrypt', str(root / 'no-cert'))
            script_path = root / 'install.sh'; script_path.write_text(script)
            stub = '''#!/usr/bin/env bash
name=${0##*/}
case "$name" in
 node) echo 22.12.0;;
 npm|chown|chmod) exit 0;;
 id) exit 0;;
 nginx) if [[ "$MODE" == nginx && ! -e "$STATE/nginx-failed" ]]; then touch "$STATE/nginx-failed"; exit 1; fi;;
 curl) exit 0;;
 systemctl)
  printf '%s\\n' "$*" >> "$STATE/calls"
  case "$1:$2" in
   is-active:cowayangai.service) echo inactive; exit 3;;
   is-active:cowayangai-backend.service) echo active;;
   is-enabled:cowayangai-backend.service) echo enabled;;
   is-enabled:cowayangai.service) echo disabled; exit 1;;
   restart:cowayangai-backend.service) if [[ "$MODE" == restart && ! -e "$STATE/restart-failed" ]]; then touch "$STATE/restart-failed"; exit 1; fi;;
  esac;;
esac
'''
            for name in ('node','npm','chown','chmod','id','nginx','curl','systemctl'):
                p = bin_dir / name; p.write_text(stub); p.chmod(0o755)
            env = os.environ.copy(); env.update(PATH=str(bin_dir)+':'+env['PATH'], MODE=mode, STATE=d, ALLOW_NGINX_REPLACE='1')
            result = subprocess.run(['bash', str(script_path), str(archive)], env=env, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / f'{mode}-failed').exists(), result.stdout + result.stderr)
            self.assertIn('Deployment failed; restoring previous configuration.', result.stderr)
            self.assertIn('Previous configuration restored.', result.stderr)
            self.assertEqual((app / 'current').resolve(), old)
            self.assertEqual(available.read_text(), 'old nginx\n')
            self.assertTrue(enabled.is_symlink()); self.assertEqual(enabled.resolve(), available)
            self.assertEqual(unit.read_text(), 'old unit\n')
            calls = (root / 'calls').read_text()
            if mode == 'restart':
                self.assertEqual(calls.count('restart cowayangai-backend.service\n'), 2, calls)
                self.assertEqual(calls.count('reload nginx\n'), 2, calls)
            else: self.assertNotIn('reload nginx\n', calls)
    def test_nginx_validation_failure(self): self.run_case('nginx')
    def test_restart_failure(self): self.run_case('restart')

if __name__ == '__main__': unittest.main(verbosity=2)
