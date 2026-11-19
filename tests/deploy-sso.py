import base64
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_sso', Path(__file__).resolve().parents[1]/'deploy/deploy-sso.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)


def static(root, label):
    (root/'assets').mkdir(parents=True)
    (root/'assets'/f'{label}.js').write_text(label)
    (root/'index.html').write_text(f'<script type="module" src="/assets/{label}.js"></script>')


class DeployTests(unittest.TestCase):
    def test_reuses_rentbook_node_before_downloading_anything(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'qrmenu'
            node=Path(directory)/'chothue/.nvm/versions/node/v22.16.0/bin/node'
            node.parent.mkdir(parents=True);node.touch()
            expected=({'PATH':str(node.parent)},str(node.parent/'npm'))
            with patch.object(d.shutil,'which',return_value=None), patch.object(d,'node_runtime',side_effect=lambda candidate:expected if candidate==node else None), patch.object(d,'download_node') as download:
                self.assertEqual(d.find_node(source,True),expected)
                download.assert_not_called()

    def test_node_version_requirement_and_npm_are_checked_with_same_path(self):
        node=Path('/test-node/bin/node')
        for version in ['v20.19.0','v22.8.0','broken-version']:
            with self.subTest(version=version),patch.object(d.subprocess,'check_output',return_value=version),patch.object(d.shutil,'which') as which:
                self.assertIsNone(d.node_runtime(node));which.assert_not_called()
        with patch.object(d.subprocess,'check_output',side_effect=['v22.9.0','10.9.0']) as run,patch.object(d.shutil,'which',return_value='/test-node/bin/npm'):
            env,npm=d.node_runtime(node)
            self.assertEqual(npm,'/test-node/bin/npm')
            self.assertEqual(env['PATH'].split(d.os.pathsep)[0],str(node.parent))
            self.assertEqual(run.call_args.kwargs['env']['PATH'],env['PATH'])

    def test_unusable_npm_is_not_treated_as_a_working_runtime(self):
        with patch.object(d.shutil,'which',return_value='/test-node/bin/npm'),patch.object(d.subprocess,'check_output',side_effect=['v24.11.0',d.subprocess.CalledProcessError(1,['npm','--version'])]):
            self.assertIsNone(d.node_runtime(Path('/test-node/bin/node')))

    def test_missing_runtime_download_requires_explicit_option(self):
        with tempfile.TemporaryDirectory() as directory:
            downloaded=Path(directory)/'downloaded/bin/node'
            expected=({'PATH':str(downloaded.parent)},str(downloaded.parent/'npm'))
            with patch.object(d.shutil,'which',return_value=None),patch.object(d,'node_runtime',side_effect=lambda candidate:expected if candidate==downloaded else None),patch.object(d,'download_node',return_value=downloaded) as download:
                with self.assertRaises(d.DeployError):d.find_node(Path(directory)/'qrmenu')
                download.assert_not_called()
                self.assertEqual(d.find_node(Path(directory)/'qrmenu',True),expected)
                download.assert_called_once()

    def test_bad_node_checksum_stops_before_extracting_or_running(self):
        filename='node-v24.11.0-linux-x64.tar.xz'
        manifest=(hashlib.sha256(b'expected archive').hexdigest()+'  '+filename+'\n').encode()
        with tempfile.TemporaryDirectory() as directory,patch.object(d.platform,'machine',return_value='x86_64'),patch.object(d.platform,'system',return_value='Linux'),patch.object(d,'urlopen',side_effect=[io.BytesIO(manifest),io.BytesIO(b'tampered archive')]),patch.object(d.subprocess,'run') as extract:
            cache=Path(directory)/'cache'
            with self.assertRaisesRegex(d.DeployError,'SHA-256'):d.download_node(cache)
            extract.assert_not_called()
            self.assertEqual(list(cache.iterdir()),[])

    def test_verified_node_download_runs_from_private_cache(self):
        name='node-v24.11.0-linux-x64';buffer=io.BytesIO()
        with tarfile.open(fileobj=buffer,mode='w:xz') as archive:
            for program,version in [('node','v24.11.0'),('npm','10.9.0')]:
                body=f'#!/bin/sh\nprintf "{version}\\n"\n'.encode()
                info=tarfile.TarInfo(name+'/bin/'+program);info.size=len(body);info.mode=0o755
                archive.addfile(info,io.BytesIO(body))
        content=buffer.getvalue()
        manifest=(hashlib.sha256(content).hexdigest()+'  '+name+'.tar.xz\n').encode()
        with tempfile.TemporaryDirectory() as directory,patch.object(d.platform,'machine',return_value='x86_64'),patch.object(d.platform,'system',return_value='Linux'),patch.object(d,'urlopen',side_effect=[io.BytesIO(manifest),io.BytesIO(content)]):
            cache=Path(directory)/'cache';node=d.download_node(cache)
            self.assertEqual(node,cache/name/'bin/node')
            env,npm=d.node_runtime(node)
            self.assertEqual(Path(npm),node.parent/'npm')
            self.assertEqual(env['PATH'].split(d.os.pathsep)[0],str(node.parent))
            self.assertEqual(list(cache.iterdir()),[cache/name])

    def test_resolves_only_qrmenu_and_keeps_other_hosts_separate(self):
        config = '''# configuration file /etc/nginx/nginx.conf:
        events {} http {
          server {listen 80; server_name menu.filezuno.net; return 301 https://$host$request_uri;}
          server {listen 443 ssl; server_name menu.filezuno.net; root "/var/www/qrmenu";
            location / {try_files $uri $uri/ /index.html;}
            location ~ /\\. { deny all; }
          }
          server {server_name filezuno.net; root /var/www/filezuno;}
          server {server_name other.example.com; root /var/www/other;}
        }'''
        self.assertEqual(d.detect_root(config),Path('/var/www/qrmenu'))
    def test_refuses_ambiguous_shared_dynamic_and_missing_roots(self):
        configs = [
            'server {server_name menu.filezuno.net; root /a;} server {server_name menu.filezuno.net; root /b;}',
            'server {server_name menu.filezuno.net; root /a;} server {server_name filezuno.net; root /a;}',
            'server {server_name menu.filezuno.net filezuno.net; root /a;}',
            'server {server_name menu.filezuno.net; root $base/dist;}',
            'server {server_name other.net; root /a;}',
            'server {server_name menu.filezuno.net; root /a;',
        ]
        for config in configs:
            with self.subTest(config=config), self.assertRaises(d.DeployError): d.detect_root(config)
    def test_existing_public_config_is_not_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'.env.local'
            claims=base64.urlsafe_b64encode(json.dumps({'role':'anon','ref':'abcdefghijklmnopqrst'}).encode()).decode().rstrip('=')
            text=f'VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nVITE_SUPABASE_ANON_KEY=header.{claims}.signature\nPRIVATE_OTHER=preserve\n'
            path.write_text(text)
            values=d.build_settings(path)
            self.assertEqual(values['VITE_FILEZUNO_SSO'],'1')
            self.assertNotIn('PRIVATE_OTHER',values)
            self.assertEqual(path.read_text(),text)
    def test_privileged_or_wrong_project_key_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'.env.local'
            for key in ['sb_secret_'+'x'*40, 'invalid', 'sb_publishable_short']:
                path.write_text(f'VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nVITE_SUPABASE_ANON_KEY={key}\n')
                with self.assertRaises(d.DeployError):d.build_settings(path)
            claims=base64.urlsafe_b64encode(json.dumps({'role':'anon','ref':'differentprojectref'}).encode()).decode().rstrip('=')
            path.write_text('VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nVITE_SUPABASE_ANON_KEY=header.'+claims+'.signature')
            with self.assertRaises(d.DeployError):d.build_settings(path)
    def test_publish_retains_old_assets_and_verifies_new_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';backup=base/'backup'
            static(old,'old'); static(new,'new')
            d.deploy(new,old,backup,lambda root:d.check_served(root,lambda url:(root/('index.html' if url=='/' else url.lstrip('/'))).read_bytes()))
            self.assertEqual((old/'index.html').read_bytes(),(new/'index.html').read_bytes())
            self.assertTrue((old/'assets/old.js').exists())
            self.assertTrue((old/'assets/new.js').exists())
            self.assertIn('old.js',(backup/'index.html').read_text())
            self.assertEqual((old/'assets/new.js').stat().st_mode&0o777,0o644)
    def test_failed_health_check_restores_old_html_and_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';backup=base/'backup'
            static(old,'old');static(new,'new')
            before=(old/'index.html').read_bytes()
            def fail(_):raise d.DeployError('health failed')
            with self.assertRaises(d.DeployError):d.deploy(new,old,backup,fail)
            self.assertEqual((old/'index.html').read_bytes(),before)
            self.assertEqual((old/'assets/old.js').read_text(),'old')
    def test_health_requires_actual_js_not_spa_fallback_html(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);static(root,'actual')
            with self.assertRaises(d.DeployError):d.check_served(root,lambda url:(root/'index.html').read_bytes())
    def test_symlink_targets_rejected_without_writing_outside_root(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';outside=base/'outside'
            static(new,'new');outside.mkdir();old.mkdir();(old/'assets').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(d.DeployError):d.publish(new,old)
            self.assertEqual(list(outside.iterdir()),[])

if __name__=='__main__':unittest.main(verbosity=2)
