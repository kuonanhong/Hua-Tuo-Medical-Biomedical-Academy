#!/usr/bin/env python3
"""Stage only hash-verified free website files for the GitHub Pages artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath


MANIFEST = '.huatuo-managed-public.json'
BLOCKED_PARTS = {'private', 'models', 'portable', 'tools', 'runtime', 'logs', '.git', '.github', 'node_modules', '__pycache__'}
BLOCKED_SUFFIXES = ('.py', '.sh', '.bat', '.command', '.gguf', '.onnx', '.pth', '.safetensors', '.sqlite', '.sqlite3', '.pem', '.key', '.part')


def safe_site_path(value):
    if not isinstance(value, str):
        raise ValueError('Website path must be text.')
    parts = value.split('/')
    if not value or PurePosixPath(value).is_absolute() or '\\' in value or '\x00' in value or any(p in ('', '.', '..') for p in parts):
        raise ValueError('Unsafe website path: ' + repr(value))
    if any(p in BLOCKED_PARTS or (p.startswith('.') and p not in {'.nojekyll', '.huatuo-static-export'}) for p in parts) or value.lower().endswith(BLOCKED_SUFFIXES):
        raise ValueError('Non-website/private path cannot enter the Pages artifact: ' + value)
    return value


def stage(repository, output):
    repository = Path(repository).resolve()
    requested_output = Path(output).absolute()
    if requested_output.is_symlink():
        raise ValueError('Artifact destination cannot be a symlink.')
    output = requested_output.resolve()
    if output == repository or output in repository.parents or repository in output.parents:
        raise ValueError('Choose an artifact directory outside the repository.')
    if output.exists():
        raise ValueError('Artifact destination already exists; choose a new directory.')
    manifest_path = repository / MANIFEST
    if manifest_path.is_symlink():
        raise ValueError('Managed manifest cannot be a symlink.')
    doc = json.loads(manifest_path.read_text(encoding='utf-8'))
    if doc.get('format') != 'huatuo-managed-public-v1' or not isinstance(doc.get('files'), dict):
        raise ValueError('Unrecognized managed website manifest.')
    names = doc.get('site_files')
    if not isinstance(names, list) or not names or len(names) != len(set(names)):
        raise ValueError('Managed manifest needs a unique, nonempty site_files list.')
    entries = []
    for name in names:
        safe_site_path(name)
        expected = doc['files'].get(name)
        if not isinstance(expected, str) or not re.fullmatch('[a-f0-9]{64}', expected):
            raise ValueError('Missing SHA-256 for website file: ' + name)
        source = repository
        for part in name.split('/'):
            source = source / part
            if source.is_symlink():
                raise ValueError('Website symlink cannot enter the artifact: ' + name)
        if not source.is_file():
            raise ValueError('Missing website file: ' + name)
        entries.append((name, source, expected))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='huatuo-pages-', dir=output.parent))
    try:
        for name, source, expected in entries:
            target = temporary / name
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with source.open('rb') as reader, target.open('wb') as writer:
                for block in iter(lambda: reader.read(1024 * 1024), b''):
                    digest.update(block)
                    writer.write(block)
            if digest.hexdigest() != expected:
                raise ValueError('Website SHA-256 mismatch: ' + name)
        temporary.replace(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, default=Path.cwd())
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = stage(args.repository, args.out)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        parser.exit(1, str(exc) + '\n')
    print('Verified free website staged:', result)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
