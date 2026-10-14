#!/usr/bin/env python3
"""Explicit, resumable GGUF downloader with pinned SHA-256 (Python 3.10+, standard library).

  python3 tools/download_ai_model.py                      # list models, download nothing
  python3 tools/download_ai_model.py --model qwen3-17b --download
  python3 tools/download_ai_model.py --verify             # re-check every file in models/
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "tools/model-manifest.json").read_text(encoding="utf-8"))
MODELS = MANIFEST["models"]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def download(model, destination):
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / model["file"]
    part = destination / (model["file"] + ".part")
    if target.is_symlink() or part.is_symlink():
        raise ValueError("Refusing symbolic-link model output")
    if target.exists():
        if target.stat().st_size == model["bytes"] and digest(target) == model["sha256"]:
            print("Verified existing model:", target)
            return target
        raise ValueError("Existing model does not match the manifest. Rename it before downloading; it was not overwritten.")
    offset = part.stat().st_size if part.exists() else 0
    if offset > model["bytes"]:
        raise ValueError("Partial file too large. Remove only that .part file and retry.")
    if offset < model["bytes"]:
        url = f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{model['file']}"
        headers = {"User-Agent": "HuaTuo-model-downloader/1"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        with urlopen(Request(url, headers=headers), timeout=90) as response:
            if not response.url.startswith("https://"):
                raise ValueError("Refusing insecure download redirect")
            if offset and response.status != 206:
                offset = 0
            if response.status == 206 and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                raise ValueError("Unexpected resume range")
            with part.open("ab" if offset else "wb") as f:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    offset += len(chunk)
                    if offset > model["bytes"]:
                        raise ValueError("Download exceeds pinned size")
                    f.write(chunk)
                    print(f"\r{offset:,} / {model['bytes']:,} bytes ({100 * offset / model['bytes']:.1f}%)", end="", flush=True)
        print()
    if part.stat().st_size != model["bytes"] or digest(part) != model["sha256"]:
        raise ValueError("Checksum mismatch. Model was NOT installed. Remove the .part file and retry.")
    os.replace(part, target)
    print("SHA-256 verified:", target)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", choices=[m["id"] for m in MODELS])
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--verify", action="store_true", help="verify files already in the models directory")
    parser.add_argument("--directory", type=Path, default=ROOT / "models")
    args = parser.parse_args()
    if args.verify:
        for m in MODELS:
            if m["kind"] != "gguf":
                continue
            target = args.directory / m["file"]
            if target.is_file():
                ok = target.stat().st_size == m["bytes"] and digest(target) == m["sha256"]
                print(f"{m['id']:12} {'OK ' if ok else 'BAD'} {target}")
        return
    if not args.download:
        for m in MODELS:
            print(f"{m['id']:12} {m['bytes'] / 1e6:8.0f} MB  {m['kind']:6} {m['license']:14} {m['sourceUrl']}")
        print("\nNothing downloaded. To consent: bash install-ai-models.sh --model qwen3-17b --download")
        print("Ollama models: bash run-ai-ollama.sh --download")
        return
    if not args.model:
        parser.error("--download needs --model")
    model = next(m for m in MODELS if m["id"] == args.model)
    if model["kind"] != "gguf":
        parser.error(f"{model['id']} is pulled by Ollama: HT_OLLAMA_MODEL={model['ollama']} bash run-ai-ollama.sh --download")
    download(model, args.directory.expanduser().resolve())


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nCancelled; resume by running the same command.")
    except Exception as error:
        sys.exit(str(error))
