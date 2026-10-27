#!/usr/bin/env python3
"""Incremental publisher: free web previews and private, resumable model resources.

No existing local Git working tree is modified. Only exact known legacy files or
unchanged files previously managed by this tool may be deleted. Public content
always passes through the full source package's free-preview exporter.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

KIT = Path(__file__).resolve().parents[1]
PUBLIC_REPO = 'git@github.com:kuonanhong/Hua-Tuo-Medical-Biomedical-Academy.git'
PRIVATE_REPO = 'git@github.com:kuonanhong/PRIVATE-MODELS.git'
PUBLIC_MANIFEST = '.huatuo-managed-public.json'
PRIVATE_PREFIX = 'projects/huatuo/v3'
PRIVATE_MANIFEST = PRIVATE_PREFIX + '/model-manifest.json'
MAX_CHUNK = 48 * 1024 * 1024
CHUNK_SIZE = 40 * 1024 * 1024
MODEL_FORMAT = 'huatuo-private-resources-v1'
SSH_ENV = dict(os.environ, GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=no -o ControlPath=none -o ControlPersist=no -o ClearAllForwardings=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3', GIT_TERMINAL_PROMPT='0')


def safe_path(value):
    p = PurePosixPath(value)
    if not value or p.is_absolute() or '\\' in value or any(x in ('', '.', '..') for x in value.split('/')) or '\x00' in value:
        raise ValueError('Unsafe repository path: ' + repr(value))
    return value


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode()


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def check_repo(value, allow_local=False):
    if re.fullmatch(r'git@github\.com:[A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*(?:\.git)?', value):
        return value
    if re.fullmatch(r'https://github\.com/[A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*(?:\.git)?', value):
        return value
    if allow_local and Path(value).is_absolute() and Path(value).is_dir():
        return value
    raise ValueError('Use git@github.com:OWNER/REPO.git or https://github.com/OWNER/REPO.git (no token in URLs).')


def read_repo(repo, complete_objects=False):
    # This exception is only for the known PUBLIC academy, never PRIVATE-MODELS.
    if complete_objects and repo == PUBLIC_REPO:
        return 'https://github.com/kuonanhong/Hua-Tuo-Medical-Biomedical-Academy.git'
    return repo


def cache_key(repo, branch, complete_objects=False):
    if not complete_objects:
        # Preserve resumable private model caches from v3.7.
        return hashlib.sha256((repo+'\0'+branch).encode()).hexdigest()[:16]
    identity = '\0'.join(('public-full-v371', read_repo(repo, True), repo, branch))
    return 'public-full-v371-' + hashlib.sha256(identity.encode()).hexdigest()[:16]


class Remote:
    """Bare, cached Git index: preserve every unmodified foreign tree entry."""
    def __init__(self, repo, branch, cache, allow_local=False, complete_objects=False):
        self.repo = check_repo(repo, allow_local)
        self.fetch_repo = read_repo(self.repo, complete_objects)
        self.complete_objects = complete_objects
        self.branch = branch
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.run(['check-ref-format', '--branch', branch])
        if not (self.cache / 'HEAD').exists():
            self.run(['init', '--bare', '-q', str(self.cache)])
        old = self.run(['config', '--get', 'remote.origin.url'], check=False).stdout.strip()
        if old and old != self.fetch_repo:
            raise ValueError('Cache belongs to a different remote; use a different --cache directory.')
        if not old:
            self.run(['remote', 'add', 'origin', self.fetch_repo])
        old_push = self.run(['config', '--get', 'remote.origin.pushurl'], check=False).stdout.strip()
        if old_push and old_push != self.repo:
            raise ValueError('Cache has a different push destination; use a different --cache directory.')
        self.run(['config', 'remote.origin.pushurl', self.repo])
        if complete_objects:
            promisor = self.run(['config', '--get', 'remote.origin.promisor'], check=False).stdout.strip()
            if promisor.lower() == 'true' or any((self.cache/'objects'/'pack').glob('*.promisor')):
                raise ValueError('Public cache is incomplete. Select a fresh --cache directory; existing cache was preserved.')
        refs = self.run(['ls-remote', '--heads', 'origin', branch]).stdout.strip()
        self.head = None
        if refs:
            fetch_mode = ['--no-filter', '--no-tags'] if complete_objects else ['--filter=blob:none']
            self.run(['fetch', '--quiet', '--depth=1'] + fetch_mode + ['origin', 'refs/heads/' + branch])
            self.head = self.run(['rev-parse', 'FETCH_HEAD']).stdout.strip()
        else:
            # A failed ls-remote is an error; it is never interpreted as empty.
            all_refs = self.run(['ls-remote', 'origin']).stdout.strip()
            if all_refs:
                raise ValueError(f'Remote has other branches but no {branch!r}; choose --branch explicitly.')
        self.refresh_tree()

    def run(self, args, check=True, data=None, text=True, extra_env=None):
        env = SSH_ENV.copy()
        env.update({'GIT_AUTHOR_NAME':'Hua Tuo Sync','GIT_AUTHOR_EMAIL':'huatuo-sync@users.noreply.github.com','GIT_COMMITTER_NAME':'Hua Tuo Sync','GIT_COMMITTER_EMAIL':'huatuo-sync@users.noreply.github.com'})
        if extra_env:
            env.update(extra_env)
        # Scope HTTP compatibility to this process; never rewrite global Git config.
        result = subprocess.run(['git', '-c', 'http.version=HTTP/1.1', '--git-dir=' + str(self.cache)] + args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=text, env=env)
        if check and result.returncode:
            error = result.stderr if text else result.stderr.decode(errors='replace')
            raise RuntimeError('git ' + args[0] + ' failed for ' + self.fetch_repo + ': ' + error.strip())
        return result

    def refresh_tree(self):
        self.tree = {}
        if self.head:
            raw = self.run(['ls-tree', '-r', '-z', self.head], text=False).stdout
            for record in raw.split(b'\0'):
                if not record:
                    continue
                metadata, name = record.split(b'\t', 1)
                mode, kind, oid = metadata.decode().split()
                path = name.decode('utf-8')
                safe_path(path)
                self.tree[path] = (mode, oid)

    def read(self, path):
        if path not in self.tree:
            return None
        mode, oid = self.tree[path]
        if mode not in ('100644','100755'):
            raise ValueError('Symlink/submodule cannot be managed: ' + path)
        return self.run(['cat-file', 'blob', oid], text=False).stdout

    def digest(self, path):
        content = self.read(path)
        return sha_bytes(content) if content is not None else None

    def blob(self, data, write=False):
        args = ['hash-object'] + (['-w'] if write else []) + ['--stdin']
        return self.run(args, data=data, text=False).stdout.decode().strip()

    def blob_file(self, path, write=False):
        args = ['hash-object'] + (['-w'] if write else []) + [str(path)]
        return self.run(args).stdout.strip()

    def push(self, commit):
        # Never --force: a concurrent remote change fails safely.
        for attempt in range(3):
            result = self.run(['push', '--porcelain', 'origin', commit + ':refs/heads/' + self.branch], check=False)
            if result.returncode == 0:
                return
            detail = (result.stdout + '\n' + result.stderr).strip()
            if 'fetch first' in detail.lower() or 'non-fast-forward' in detail.lower():
                raise RuntimeError('Remote changed concurrently: ' + self.repo + '. Run again; no force push was attempted.\n' + detail)
            if 'rejected' in detail.lower():
                raise RuntimeError('Push rejected by ' + self.repo + '; no force push was attempted.\n' + detail)
            if attempt < 2:
                time.sleep(1 + attempt * 2)
        protocol = 'HTTPS' if self.repo.startswith('https://') else 'SSH' if self.repo.startswith('git@') else 'local Git'
        raise RuntimeError(protocol + ' push failed for ' + self.repo + '. Run the same command again to resume.\n' + detail)

    def commit(self, updates, deletions, message):
        if not updates and not deletions:
            return False
        index = self.cache / 'huatuo-index'
        index.unlink(missing_ok=True)
        env = {'GIT_INDEX_FILE': str(index)}
        self.run(['read-tree', self.head or '--empty'], extra_env=env)
        records = []
        for path, (data_or_path, mode) in sorted(updates.items()):
            safe_path(path)
            oid = self.blob_file(data_or_path, True) if isinstance(data_or_path, Path) else self.blob(data_or_path, True)
            records.append((mode + ' ' + oid + '\t' + path).encode() + b'\0')
        for path in sorted(deletions):
            safe_path(path)
            records.append(('0 ' + '0' * 40 + '\t' + path).encode() + b'\0')
        self.run(['update-index', '-z', '--index-info'], data=b''.join(records), text=False, extra_env=env)
        tree = self.run(['write-tree'], extra_env=env).stdout.strip()
        if self.head and tree == self.run(['rev-parse', self.head + '^{tree}']).stdout.strip():
            return False
        args = ['commit-tree', tree] + (['-p', self.head] if self.head else [])
        commit = self.run(args, data=message + '\n').stdout.strip()
        self.run(['update-ref', 'refs/heads/huatuo-sync-pending', commit])
        self.push(commit)
        self.head = commit
        self.run(['update-ref', 'refs/heads/huatuo-sync-pending', commit])
        self.refresh_tree()
        return True


def read_manifest(remote, path, expected):
    raw = remote.read(path)
    if raw is None:
        return None
    data = json.loads(raw)
    if data.get('format') != expected:
        raise ValueError('Unrecognized managed manifest: ' + path)
    return data


def source_root(value):
    root = Path(value).expanduser().resolve() if value else KIT
    academy = root / 'public' / 'academy'
    for path in (root/'public', academy):
        if path.is_symlink():
            raise ValueError('Public source symlink is not allowed: ' + str(path))
    if academy.is_dir():
        for path in academy.rglob('*'):
            if path.is_symlink():
                raise ValueError('Public source symlink is not allowed: ' + str(path))
    if not (root / 'public' / 'academy' / 'index.html').is_file():
        raise ValueError('Cannot find full source public/academy/index.html. Use --source "/path/to/HuaTuo_Medical_Academy_v2".')
    return root


def ensure_public_safe(snapshot):
    forbidden = {'.env', 'owner-bootstrap.json', 'owner-seed.json', 'owner-setup.json', 'members.json'}
    blocked_suffixes = ('.gguf','.onnx','.pth','.pt','.safetensors','.sqlite','.sqlite3','.pem','.key','.part','.huatuo-owner','.htowner')
    for path in snapshot.rglob('*'):
        if path.is_symlink():
            raise ValueError('Public export contains a symlink: ' + str(path))
        if not path.is_file():
            continue
        rel = path.relative_to(snapshot).as_posix()
        if path.name.lower() in forbidden or path.name.lower().endswith(blocked_suffixes) or any(p.lower() in {'models','private','data-private','runtime'} for p in path.relative_to(snapshot).parts):
            raise ValueError('Private/resource file in public export: ' + rel)
        if path.suffix.lower() in {'.js','.json','.html','.txt'}:
            content = path.read_text(encoding='utf-8')
            if re.search(r'(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)', content):
                raise ValueError('Credential-like content in public export: ' + rel)
            # Renaming an encrypted owner pack to JSON must not make it public.
            # Runtime JavaScript may legitimately reference these format names.
            if content.lstrip().startswith('{'):
                try:
                    obj = json.loads(content)
                except json.JSONDecodeError:
                    obj = None
                if isinstance(obj, dict) and (obj.get('format') in {'huatuo-owner-learning-v1', 'huatuo-owner-curriculum-v1'} or {'passwordHash', 'passwordSalt'}.issubset(obj)):
                    raise ValueError('Private owner learning data in public export: ' + rel)
    for path in (snapshot / 'data' / 'procedures').glob('*.json') if (snapshot / 'data' / 'procedures').is_dir() else []:
        if path.stem == 'index':
            continue
        doc = json.loads(path.read_text(encoding='utf-8'))
        for number, procedure in enumerate(doc.get('procedures', [])):
            if number >= 4 and procedure.get('stages'):
                raise ValueError('Member procedure payload in public export: ' + path.name)
    # Paid stage payloads must be removed in BOTH JSON and JS by exporter.
    for path in (snapshot / 'data' / 'courses').glob('*.json'):
        for course in json.loads(path.read_text(encoding='utf-8')):
            for number, stage in enumerate(course.get('stages', [])):
                if number and not stage.get('free') and (stage.get('steps') or not stage.get('locked')):
                    raise ValueError('Member lesson payload in public export: ' + path.name)


def backend_url(value):
    if not value:
        return ''
    if not isinstance(value, str) or any(ord(c) <= 32 or ord(c) == 127 for c in value):
        raise ValueError('Backend URL must not contain spaces or control characters.')
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError('Invalid backend URL or port.') from exc
    local = parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1','localhost','::1'}
    if (parsed.scheme != 'https' and not local) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/') or (port is not None and not 1 <= port <= 65535):
        raise ValueError('--backend-url must be an HTTPS origin without account/password/path/query; local http://127.0.0.1:PORT is also supported.')
    return value.rstrip('/')


def private_visibility(repo, override=False, allow_local=False):
    if allow_local and Path(repo).is_absolute():
        return {'method':'local-test-fixture','private':True}
    match = re.fullmatch(r'(?:git@github\.com:|https://github\.com/)([^/]+)/(.+?)(?:\.git)?', repo)
    if not match:
        raise ValueError('Cannot inspect private repository visibility.')
    url = 'https://api.github.com/repos/' + match[1] + '/' + match[2]
    request = Request(url, headers={'User-Agent':'HuaTuo-Cloud-Sync/3','Accept':'application/vnd.github+json'})
    try:
        with urlopen(request, timeout=20) as response:
            info = json.load(response)
        if not info.get('private'):
            raise ValueError('Refusing model upload: GitHub reports the model repository is PUBLIC. Set repository visibility to private first.')
        return {'method':'github-rest','private':True}
    except HTTPError as exc:
        if exc.code == 404:
            # Called only AFTER successful authenticated Git ls-remote/fetch.
            return {'method':'unauthenticated-rest-404-and-authenticated-git-success','private':True}
        message = 'GitHub REST visibility check failed with HTTP ' + str(exc.code)
    except (URLError, TimeoutError, OSError) as exc:
        message = 'Cannot verify model repository visibility: ' + str(exc)
    if override:
        print('已使用您指定的 --private-visibility-confirmed；請確定 PRIVATE-MODELS 設定為 Private。')
        return {'method':'explicit-user-visibility-confirmation','private':True,'note':message}
    raise RuntimeError(message + '. Retry later, or verify repository Settings → General → Visibility is Private and add --private-visibility-confirmed.')


def pages_workflow(branch):
    """Deploy the already-sanitized website without copying private/source files."""
    return ('''name: Publish verified free academy to GitHub Pages
on:
  push:
    branches: [BRANCH]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: huatuo-pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - uses: actions/configure-pages@v5
      - name: Stage only verified free website files
        run: python tools/stage_pages.py --out "$RUNNER_TEMP/huatuo-pages-artifact"
      - uses: actions/upload-pages-artifact@v4
        with:
          path: ${{ runner.temp }}/huatuo-pages-artifact
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
'''.replace('BRANCH', json.dumps(branch)) ).encode('utf-8')


def public_plan(remote, source, snapshot, configured_backend=''):
    exporter = source / 'tools' / 'export_static.py'
    if not exporter.is_file():
        raise ValueError('Full source tools/export_static.py is required for safe free previews.')
    subprocess.run([sys.executable, str(exporter), '--out', str(snapshot)], check=True, stdout=subprocess.DEVNULL)
    if configured_backend:
        bridge = KIT / 'public' / 'huatuo-backend-link.js'
        if not bridge.is_file():
            raise ValueError('Missing kit public/huatuo-backend-link.js')
        shutil.copy2(bridge, snapshot / bridge.name)
        index = snapshot / 'index.html'
        text = index.read_text(encoding='utf-8')
        injection = '<script>window.HT_BACKEND_URL=' + json.dumps(configured_backend).replace('<','\\u003c') + ';</script>\n<script defer src="huatuo-backend-link.js"></script>\n'
        text = text.replace('</head>', injection + '</head>') if '</head>' in text else injection + text
        index.write_text(text,encoding='utf-8')
    ensure_public_safe(snapshot)
    baseline_path = KIT / 'tools' / 'legacy-v1-baseline.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))['files'] if baseline_path.exists() else {}
    # v3.6 push_site.py dropped these unchanged cloud helpers from its managed
    # manifest. Only exact audited cloud hashes recorded with their source commit
    # may be adopted; arbitrary remote edits still conflict instead of being lost.
    previous_tools = KIT / 'tools' / 'legacy-v36-baseline.json'
    if previous_tools.is_file():
        for path, digest in json.loads(previous_tools.read_text(encoding='utf-8'))['files'].items():
            baseline.setdefault(safe_path(path), digest)
    old = read_manifest(remote, PUBLIC_MANIFEST, 'huatuo-managed-public-v1') or {'files': {}}
    desired = {}
    # The user's existing repository has the original raw-source layout.
    # A fresh repository uses this same layout so its URL stays stable.
    prefix = '' if ('index.html' in remote.tree and 'public/academy/index.html' not in remote.tree and any(p.startswith('data/courses/') for p in remote.tree)) else 'public/academy/'
    for path in sorted(snapshot.rglob('*')):
        if path.is_file():
            desired[prefix + path.relative_to(snapshot).as_posix()] = (path, '100644')
    site_files = set(desired)
    if prefix:
        # Keep an arbitrary user-authored landing page; replace only a known baseline redirect.
        if 'index.html' not in remote.tree or 'index.html' in old['files'] or remote.digest('index.html') == baseline.get('index.html'):
            desired['index.html'] = (b'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=public/academy/"><title>Hua Tuo Medical Academy</title><script>location.replace(new URL("public/academy/"+location.search+location.hash,location.href).href);</script><a href="public/academy/">Enter Hua Tuo Medical Academy</a></html>\n', '100644')
            site_files.add('index.html')
    desired['.nojekyll'] = (b'', '100644')
    site_files.add('.nojekyll')
    staging_helper = KIT / 'tools' / 'stage_pages.py'
    if not staging_helper.is_file():
        raise ValueError('Missing kit tools/stage_pages.py; extract the complete consolidated package.')
    desired['tools/stage_pages.py'] = (staging_helper, '100644')
    desired['.github/workflows/pages.yml'] = (pages_workflow(remote.branch), '100644')
    public_readme = KIT / 'PUBLIC_README.md'
    if public_readme.exists():
        desired['README.md'] = (public_readme, '100644')
    license_file = source / 'LICENSES.md'
    if license_file.exists():
        desired['LICENSES.md'] = (license_file, '100644')
    for name in ('huatuo-sync.sh', 'huatuo-private-ai.sh', 'tools/python-runtime.sh', 'tools/sync_github.py', 'tools/private_models.py', 'tools/legacy-v1-baseline.json', 'tools/legacy-v36-baseline.json'):
        path = KIT / name
        if path.is_file():
            desired[name] = (path, '100755' if name.endswith('.sh') else '100644')
    # Documentation from this kit is public-safe; the original owner/setup files never enter desired.
    for name in ('CLOUD_TOOLS_README_ZH.md',):
        path = KIT / name
        if path.is_file():
            desired[name] = (path, '100644')
    retained_scene_assets = []
    # A source update archive can omit photos fetched by the owner's older upload
    # script. Missing bytes are not evidence that these licensed images are
    # obsolete scripts. Retain exact previously managed scene images in Git, but
    # do not include them in the new Pages artifact unless present in the export.
    # This narrow rule leaves normal obsolete-source/script pruning intact.
    for path, expected in old['files'].items():
        if path in desired or path not in remote.tree:
            continue
        if re.fullmatch(r'(?:public/academy/)?assets/scenes/[^/]+\.(?:jpg|jpeg|png|webp)', path, flags=re.IGNORECASE) and remote.digest(path) == expected:
            desired[path] = (remote.read(path), remote.tree[path][0])
            retained_scene_assets.append({'path':path,'reason':'previously managed scene photo omitted from local package; retained in Git, excluded from current Pages artifact','sha256':expected})
    updates, deletions, changes, preserved, conflicts, hashes = {}, [], [], [], [], {}
    for path, (content, mode) in desired.items():
        data = content.read_bytes() if isinstance(content, Path) else content
        digest = sha_bytes(data)
        hashes[path] = digest
        old_hash = remote.digest(path)
        if old_hash == digest:
            continue
        previous = old['files'].get(path) or baseline.get(path)
        if old_hash is not None and old_hash != previous:
            conflicts.append({'path':path,'reason':'remote file differs from the last managed version and v1 baseline','remote_sha256':old_hash,'local_sha256':digest})
            continue
        updates[path] = (content, mode)
        changes.append({'path':path,'action':'add' if old_hash is None else 'update','old_sha256':old_hash,'sha256':digest})
    for path, expected in dict(baseline, **old['files']).items():
        safe_path(path)
        if path in desired or path == PUBLIC_MANIFEST or path not in remote.tree:
            continue
        actual = remote.digest(path)
        if actual == expected:
            deletions.append(path)
            changes.append({'path':path,'action':'delete','old_sha256':actual,'reason':'unchanged legacy/previously managed file no longer needed by the free website'})
        else:
            preserved.append({'path':path,'reason':'remote customization preserved','sha256':actual})
    manifest = {'format':'huatuo-managed-public-v1','version':1,'layout':prefix or './','files':hashes,'site_files':sorted(site_files)}
    raw = json_bytes(manifest)
    if remote.read(PUBLIC_MANIFEST) != raw:
        updates[PUBLIC_MANIFEST] = (raw, '100644')
    report = {'repo':remote.repo,'branch':remote.branch,'base_commit':remote.head,'layout':prefix or './','changes':changes,'preserved_custom_files':preserved,'retained_scene_assets':retained_scene_assets,'conflicts':conflicts}
    return report, updates, deletions


def model_resources(source):
    root = source / 'models'
    if root.is_symlink():
        raise ValueError('Model resource root symlink is not allowed: ' + str(root))
    if not root.is_dir():
        return []
    files = []
    for path in sorted(root.rglob('*')):
        rel = path.relative_to(source)
        if any(x.startswith('.') or x in {'__pycache__','cache','runtime','node_modules','parts','model-parts','__MACOSX'} for x in rel.parts):
            continue
        if path.is_symlink():
            raise ValueError('Model symlinks must be replaced with real files: ' + rel.as_posix())
        if path.is_file() and not path.name.endswith(('.part','.tmp','.download','.pyc')):
            if path.name.lower().endswith(('.huatuo-owner','.htowner')) or path.name.lower() in {'owner-bootstrap.json','owner-seed.json','owner-setup.json','members.json'}:
                raise ValueError('Owner learning/account data is not a model resource: ' + rel.as_posix())
            files.append(path)
    return files


def validate_local_models(source, files):
    """Reject unfinished weights and metadata-only folders before any upload."""
    complete_gguf = False
    known_path = source / 'tools' / 'model-manifest.json'
    known = {}
    if known_path.is_file():
        known = {item['file']:item for item in json.loads(known_path.read_text(encoding='utf-8')).get('models',[]) if item.get('file')}
    local = {item['path']:item for item in files}
    for item in files:
        if item['path'].lower().endswith('.gguf'):
            path = source/item['path']
            with path.open('rb') as stream:
                header = stream.read(24)
            if len(header) < 24 or header[:4] != b'GGUF' or int.from_bytes(header[4:8],'little') not in (2,3):
                raise ValueError('Incomplete or invalid GGUF model: ' + item['path'])
            expected = known.get(path.name)
            if expected and (item['size'] != expected.get('bytes') or item['sha256'] != expected.get('sha256')):
                raise ValueError('Official model size/SHA-256 mismatch; restore the complete file before uploading: ' + item['path'])
            complete_gguf = True
    kokoro_files = [name for name in local if name.startswith('models/kokoro/')]
    complete_kokoro = False
    if kokoro_files:
        inventory_path = source/'models'/'kokoro'/'model-manifest.json'
        if not inventory_path.is_file():
            raise ValueError('Kokoro resources need the complete models/kokoro/model-manifest.json and all listed files.')
        inventory = json.loads(inventory_path.read_text(encoding='utf-8')).get('files',[])
        required = set()
        for entry in inventory:
            relative = safe_path(entry['path'])
            name = 'models/kokoro/' + relative
            actual = local.get(name)
            if not actual or actual['size'] != entry.get('bytes') or actual['sha256'] != entry.get('sha256'):
                raise ValueError('Incomplete or changed Kokoro resource; restore the complete voice package: ' + name)
            required.add(name)
        core = ('/model.int8.onnx','/voices.bin','/tokens.txt')
        complete_kokoro = all(any(name.endswith(ending) and local[name]['size'] > 0 for name in required) for ending in core)
        if not complete_kokoro:
            raise ValueError('Kokoro inventory is missing its model/voices/tokens core assets.')
    if not (complete_gguf or complete_kokoro):
        raise ValueError('models/ contains metadata only. Restore a complete GGUF model or complete Kokoro voice package before syncing models; use --public-only for website-only updates.')


def retained_resource(remote, entry, chunks):
    path = safe_path(entry['path'])
    if not path.startswith('models/') or not isinstance(entry.get('size'),int) or entry['size'] < 0 or not re.fullmatch(r'[a-f0-9]{64}',entry.get('sha256','')):
        raise ValueError('Invalid existing private model manifest file: ' + path)
    total = 0
    for part in entry.get('chunks',[]):
        name = safe_path(part['path'])
        if name != PRIVATE_PREFIX + '/chunks/' + part.get('sha256','') + '.part' or not re.fullmatch(re.escape(PRIVATE_PREFIX)+r'/chunks/[a-f0-9]{64}\.part',name) or not re.fullmatch(r'[a-f0-9]{64}',part.get('sha256','')) or not isinstance(part.get('size'),int) or not 1 <= part['size'] <= MAX_CHUNK:
            raise ValueError('Invalid existing private model chunk metadata: ' + name)
        existing = remote.tree.get(name)
        if not existing or existing[0] != '100644':
            raise ValueError('A retained remote model has a missing/invalid chunk; repair it before syncing: ' + name)
        chunks.setdefault(name, {'source':None,'offset':0,'size':part['size'],'sha256':part['sha256'],'oid':existing[1],'retained':True})
        total += part['size']
    if total != entry['size']:
        raise ValueError('Existing private model chunk sizes do not match: ' + path)
    return entry


def model_plan(remote, source, chunk_bytes):
    old = read_manifest(remote, PRIVATE_MANIFEST, MODEL_FORMAT)
    files, chunks = [], {}
    # Stream hashes. No whole model is loaded into RAM or duplicated on disk.
    for path in model_resources(source):
        parts, whole, total = [], hashlib.sha256(), 0
        with path.open('rb') as stream:
            offset = 0
            while True:
                data = stream.read(chunk_bytes)
                if not data:
                    break
                digest = sha_bytes(data)
                repo_path = PRIVATE_PREFIX + '/chunks/' + digest + '.part'
                oid = remote.blob(data)
                part = {'path':repo_path,'size':len(data),'sha256':digest}
                parts.append(part)
                chunks.setdefault(repo_path, {'source':path,'offset':offset,'size':len(data),'sha256':digest,'oid':oid})
                whole.update(data)
                total += len(data)
                offset += len(data)
        files.append({'path':path.relative_to(source).as_posix(),'size':total,'sha256':whole.hexdigest(),'chunks':parts})
    if not files:
        raise ValueError('No completed model/resource files found under models/. Restore/download your weights first, or use --public-only.')
    validate_local_models(source, files)
    local_count = len(files)
    local_paths = {item['path'] for item in files}
    retained = []
    for entry in (old or {}).get('files',[]):
        if entry['path'] not in local_paths:
            retained.append(retained_resource(remote, entry, chunks))
    files = sorted(files + retained, key=lambda entry:entry['path'])
    manifest = {'format':MODEL_FORMAT,'version':1,'chunk_size':chunk_bytes,'created_at':now(),'files':files}
    if old and old.get('files') == files and old.get('chunk_size') == chunk_bytes:
        manifest = old
    missing = []
    for repo_path, part in chunks.items():
        entry = remote.tree.get(repo_path)
        if entry and entry[0] not in ('100644','100755'):
            raise ValueError('Model chunk path is a symlink/submodule: ' + repo_path)
        if not entry or entry[1] != part['oid']:
            missing.append(repo_path)
    old_chunk_hashes = {p['path']:p['sha256'] for f in (old or {}).get('files',[]) for p in f.get('chunks',[])}
    old_chunk_hashes.update({p['path']:p['sha256'] for p in (old or {}).get('retired_chunks',[])})
    old_chunk_paths = set(old_chunk_hashes)
    prune, preserved = [], []
    for path in sorted(old_chunk_paths - set(chunks)):
        safe_path(path)
        if not re.fullmatch(re.escape(PRIVATE_PREFIX) + r'/chunks/[a-f0-9]{64}\.part', path) or path not in remote.tree:
            continue
        if remote.digest(path) == old_chunk_hashes[path]:
            prune.append(path)
        else:
            preserved.append(path)
    if manifest is not old and prune:
        # Keep a cleanup journal in the final manifest: interrupted post-manifest
        # pruning can be resumed without scanning or deleting unknown old chunks.
        manifest['retired_chunks'] = [{'path':p,'sha256':old_chunk_hashes[p]} for p in prune]
    changes = [{'path':p,'action':'upload','bytes':chunks[p]['size']} for p in missing]
    report = {'repo':remote.repo,'branch':remote.branch,'base_commit':remote.head,'resource_files':len(files),'local_resource_files':local_count,'retained_remote_files':len(retained),'total_resource_bytes':sum(f['size'] for f in files),'upload_bytes':sum(chunks[p]['size'] for p in missing),'upload_chunks':len(missing),'reuse_chunks':len(chunks)-len(missing),'changes':changes,'obsolete_chunks_after_manifest':prune,'preserved_modified_old_chunks':preserved,'manifest_changed':remote.read(PRIVATE_MANIFEST) != json_bytes(manifest)}
    return report, manifest, chunks, missing, prune


def upload_models(remote, plan, temp):
    report, manifest, chunks, missing, prune = plan
    batch, batch_bytes, batch_paths = {}, 0, []
    folder = temp / 'pending-chunks'
    folder.mkdir(exist_ok=True)
    def flush():
        nonlocal batch, batch_bytes, batch_paths
        if not batch:
            return
        print(f'私人模型上傳批次: {len(batch)} 塊，共 {batch_bytes/1048576:.1f} MiB', flush=True)
        remote.commit(batch, [], 'Add verified Hua Tuo private resource chunks')
        for file in batch_paths:
            file.unlink(missing_ok=True)
        batch, batch_bytes, batch_paths = {}, 0, []
    for repo_path in missing:
        part = chunks[repo_path]
        if batch and batch_bytes + part['size'] > MAX_CHUNK:
            flush()
        with open(part['source'], 'rb') as stream:
            stream.seek(part['offset'])
            data = stream.read(part['size'])
        if len(data) != part['size'] or sha_bytes(data) != part['sha256']:
            raise RuntimeError('Local model changed while syncing; run again: ' + str(part['source']))
        local = folder / (part['sha256'] + '.part')
        local.write_bytes(data)
        batch[repo_path] = (local,'100644')
        batch_bytes += len(data)
        batch_paths.append(local)
    flush()
    # The complete resource manifest is always published LAST, after all chunks.
    for repo_path, part in chunks.items():
        if remote.tree.get(repo_path, (None,None))[1] != part['oid']:
            raise RuntimeError('Model chunk missing before manifest publication: ' + repo_path)
    if remote.read(PRIVATE_MANIFEST) != json_bytes(manifest):
        remote.commit({PRIVATE_MANIFEST:(json_bytes(manifest),'100644')}, [], 'Publish verified Hua Tuo private model manifest')
    if prune:
        # Remove only chunks referenced by the previous managed manifest. Other projects/custom files stay.
        remote.commit({}, prune, 'Remove obsolete managed Hua Tuo model chunks')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', help='Full local HuaTuo source directory; defaults to the folder containing this script kit')
    p.add_argument('--public-repo', default=PUBLIC_REPO)
    p.add_argument('--private-repo', default=PRIVATE_REPO)
    p.add_argument('--branch', default='main')
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--public-only', action='store_true')
    modes.add_argument('--models-only', action='store_true')
    p.add_argument('--backend-url', help='HTTPS origin of your private backend; saved locally for later runs')
    p.add_argument('--private-visibility-confirmed', action='store_true', help='Use only after personally verifying model repo is Private, if GitHub REST is unavailable')
    p.add_argument('--dry-run', action='store_true', help='Compare remote branches and write JSON report; no commit/push/delete')
    p.add_argument('--cache', default=str(Path.home()/'.cache'/'huatuo-cloud-v3'))
    p.add_argument('--report', help='Path to JSON comparison (default SOURCE/cloud-sync-report.json)')
    p.add_argument('--chunk-mib', type=int, default=40, help='Private file chunk size; 1–48 MiB (default 40)')
    p.add_argument('--allow-local-remotes', action='store_true', help=argparse.SUPPRESS)
    p.add_argument('--test-chunk-bytes', type=int, help=argparse.SUPPRESS)
    a = p.parse_args(argv)
    if sys.version_info < (3,10):
        raise RuntimeError('Python 3.10 or newer is required.')
    source = source_root(a.source)
    settings_path = source / '.huatuo-cloud-settings.json'
    if settings_path.is_symlink():
        raise ValueError('Cloud settings symlink is not allowed.')
    settings = json.loads(settings_path.read_text(encoding='utf-8')) if settings_path.is_file() else {'version':1}
    configured_backend = backend_url(a.backend_url if a.backend_url is not None else settings.get('backend_url',''))
    if a.backend_url is not None and not a.dry_run:
        settings['backend_url'] = configured_backend
        settings_path.write_bytes(json_bytes(settings))
    if not 1 <= a.chunk_mib <= 48:
        p.error('--chunk-mib must be between 1 and 48')
    chunk_bytes = a.test_chunk_bytes if a.allow_local_remotes and a.test_chunk_bytes else a.chunk_mib * 1024 * 1024
    if chunk_bytes < 1 or chunk_bytes > MAX_CHUNK:
        p.error('Invalid chunk size')
    cache = Path(a.cache).expanduser().resolve()
    # Avoid credentials in the report/remote config by validating before creating any cache.
    check_repo(a.public_repo, a.allow_local_remotes)
    check_repo(a.private_repo, a.allow_local_remotes)
    def connect(repo, complete_objects=False):
        key = cache_key(repo, a.branch, complete_objects)
        return Remote(repo, a.branch, cache/key, a.allow_local_remotes, complete_objects=complete_objects)
    report = {'format':'huatuo-cloud-comparison-v1','generated_at':now(),'dry_run':a.dry_run,'source':str(source)}
    with tempfile.TemporaryDirectory(prefix='huatuo-sync-') as tmpdir:
        temp = Path(tmpdir)
        public = private = None
        public_data = private_data = None
        if not a.models_only:
            print('公開網站：完整抓取目前版本（沿用已修正的獨立快取），比對時不逐檔補抓。', flush=True)
            print('讀取：' + read_repo(a.public_repo, True) + '\n推送：' + a.public_repo, flush=True)
            public = connect(a.public_repo, complete_objects=True)
            public_data = public_plan(public, source, temp/'free-site', configured_backend)
            report['public'] = public_data[0]
        if not a.public_only:
            private = connect(a.private_repo)
            privacy = private_visibility(a.private_repo, a.private_visibility_confirmed, a.allow_local_remotes)
            private_data = model_plan(private, source, chunk_bytes)
            private_data[0]['visibility_check'] = privacy
            report['private_models'] = private_data[0]
        report_path = Path(a.report).expanduser().resolve() if a.report else source/'cloud-sync-report.json'
        if report_path.is_symlink():
            raise ValueError('Report destination symlink is not allowed.')
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_bytes(json_bytes(report))
        print('比較報告: ' + str(report_path))
        if public_data:
            summary = public_data[0]
            print(f'公開網站: {len(summary["changes"])} 個新增/更新/刪除，保留 {len(summary["preserved_custom_files"])} 個自行修改檔，衝突 {len(summary["conflicts"])} 個。')
            if summary.get('retained_scene_assets'):
                print(f'另保留 {len(summary["retained_scene_assets"])} 張本機未附的既有場景照片於 Git；未列入本次 Pages 畫面。')
            if summary['preserved_custom_files']:
                print('保留的舊來源檔請依 JSON 清單檢查是否仍適合公開；本程式不會刪除自行修改檔。')
        if private_data:
            summary = private_data[0]
            print(f'私人模型: {summary["resource_files"]} 個資源（保留雲端 {summary["retained_remote_files"]} 個本機未附資源），待傳 {summary["upload_chunks"]} 塊，共 {summary["upload_bytes"]/1048576:.1f} MiB；重用 {summary["reuse_chunks"]} 塊。')
        if public_data and public_data[0]['conflicts']:
            raise RuntimeError('Found customized remote files at managed website paths. No upload performed. Resolve conflicts listed in the JSON report before retrying.')
        if a.dry_run:
            print('僅比較完成，未 commit / push / 刪除雲端檔案。')
            return 0
        # Models first: a public site update never advertises an incomplete model release.
        if private:
            upload_models(private, private_data, temp)
        if public:
            public.commit(public_data[1], public_data[2], 'Update Hua Tuo free website; prune unchanged legacy scripts')
        report['completed_at'] = now()
        report['result'] = 'success'
        report_path.write_bytes(json_bytes(report))
        print('完成。只上傳差異檔與缺少分塊；可重複執行同一命令。')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Exception, KeyboardInterrupt) as exc:
        sys.exit(str(exc) or 'Interrupted. Run the same command again to resume.')
