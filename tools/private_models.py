#!/usr/bin/env python3
"""Read-only SSH model synchronization. Python 3.10+, Git, no third-party packages.

Only Git trees and requested blobs are fetched (GitHub partial clone); there is
no checkout, credential copying, private-repository push, or browser token.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

PREFIX = "projects/huatuo/v3"
MANIFEST_PATH = PREFIX + "/model-manifest.json"
MAX_CHUNK = 48 * 1024 * 1024
MAX_MANIFEST = 32 * 1024 * 1024
MODELS = {
    "qwen3-06b": "models/Qwen3-0.6B-Q8_0.gguf",
    "qwen3-17b": "models/Qwen3-1.7B-Q8_0.gguf",
    "qwen3-4b": "models/Qwen3-4B-Q4_K_M.gguf",
}
SHA = re.compile(r"[a-f0-9]{64}\Z")


class SyncError(RuntimeError):
    pass


def digest_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def verified(path: Path, size: int, digest: str) -> bool:
    return path.is_file() and not path.is_symlink() and path.stat().st_size == size and digest_file(path) == digest


def safe_relative(value: object, prefix: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise SyncError("清單含不安全的路徑。")
    path = PurePosixPath(value)
    if path.is_absolute() or any(x in ("", ".", "..") for x in value.split("/")):
        raise SyncError("清單含跨目錄或非標準路徑：" + value)
    if not value.startswith(prefix + "/") or any(x.startswith(".") or ":" in x for x in path.parts):
        raise SyncError("清單路徑超出允許的目錄：" + value)
    return value


def validate_manifest(data: object) -> dict:
    if not isinstance(data, dict) or data.get("format") != "huatuo-private-resources-v1" or data.get("version") != 1:
        raise SyncError("私人模型清單版本不符；請先執行本套件的同步上傳腳本。")
    files = data.get("files")
    if not isinstance(files, list) or len(files) > 100000:
        raise SyncError("私人模型清單 files 格式錯誤。")
    seen = set()
    chunk_sizes = {}
    for entry in files:
        if not isinstance(entry, dict):
            raise SyncError("私人模型清單檔案格式錯誤。")
        name = safe_relative(entry.get("path"), "models")
        folded = name.casefold()
        if folded in seen:
            raise SyncError("清單含重複／大小寫衝突的檔名。")
        seen.add(folded)
        size, digest = entry.get("size"), entry.get("sha256")
        if type(size) is not int or size < 0 or size > 1024 ** 4 or not isinstance(digest, str) or not SHA.fullmatch(digest):
            raise SyncError("模型檔案大小或 SHA-256 錯誤。")
        chunks = entry.get("chunks")
        if not isinstance(chunks, list) or len(chunks) > 100000:
            raise SyncError("模型分塊清單格式錯誤。")
        total = 0
        for chunk in chunks:
            if not isinstance(chunk, dict):
                raise SyncError("模型分塊格式錯誤。")
            csize, chash = chunk.get("size"), chunk.get("sha256")
            if type(csize) is not int or not 0 < csize <= MAX_CHUNK or not isinstance(chash, str) or not SHA.fullmatch(chash):
                raise SyncError("分塊大小或 SHA-256 錯誤。")
            cpath = safe_relative(chunk.get("path"), PREFIX + "/chunks")
            if cpath != PREFIX + "/chunks/" + chash + ".part":
                raise SyncError("分塊路徑必須由 SHA-256 唯一決定。")
            if chash in chunk_sizes and chunk_sizes[chash] != csize:
                raise SyncError("相同 SHA-256 的分塊大小不能不同。")
            chunk_sizes[chash] = csize
            total += csize
        if total != size or (size and not chunks):
            raise SyncError("分塊大小加總與完整檔案不同。")
    for name in seen:
        segments = name.split("/")
        if any("/".join(segments[:i]) in seen for i in range(1, len(segments))):
            raise SyncError("清單的檔案路徑與目錄互相衝突。")
    return data


def backend_origin(value: str) -> str:
    if not isinstance(value, str) or any(ord(c) <= 32 or ord(c) == 127 for c in value):
        raise SyncError("後端網址必須是字串，且不可包含空白／控制字元。")
    origin = value.rstrip("/")
    try:
        parsed = urlsplit(origin)
        port = parsed.port
    except ValueError as error:
        raise SyncError("後端網址格式錯誤。") from error
    local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path
            or not (parsed.scheme == "https" or parsed.scheme == "http" and local)
            or port is not None and not 1 <= port <= 65535):
        raise SyncError("後端網址必須是完整 HTTPS origin，不可有帳密／子路徑；本機可用 http://127.0.0.1:8020。")
    return origin


def cloud_settings(source: Path, explicit_origin: str | None) -> dict:
    path = source / ".huatuo-cloud-settings.json"
    no_symlink_path(path, source)
    settings = {}
    if path.is_file():
        if path.stat().st_size > 65536:
            raise SyncError(".huatuo-cloud-settings.json 大小不合理。")
        settings = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(settings, dict) or settings.get("version") != 1:
            raise SyncError(".huatuo-cloud-settings.json 版本錯誤；原檔未變更。")
    if explicit_origin is not None:
        settings.update(version=1, backend_url=backend_origin(explicit_origin))
        handle, name = tempfile.mkstemp(prefix=".cloud-settings-", dir=source)
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as output:
                json.dump(settings, output, ensure_ascii=False, indent=2)
                output.write("\n")
            Path(name).replace(path)
        finally:
            Path(name).unlink(missing_ok=True)
    if settings.get("backend_url"):
        settings["backend_url"] = backend_origin(settings["backend_url"])
    return settings


def no_symlink_path(path: Path, boundary: Path) -> None:
    """Do not follow existing symlinks while writing private files."""
    if not path.is_relative_to(boundary):
        raise SyncError("寫入路徑超出目的地。")
    cursor = boundary
    if cursor.is_symlink():
        raise SyncError("目的地不可是符號連結。")
    for part in path.relative_to(boundary).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise SyncError("私人檔案路徑不可經過符號連結：" + str(cursor))


class GitRemote:
    def __init__(self, cache: Path, repo: str, branch: str, key: Path | None = None, *, test_local=False):
        if not test_local and not re.fullmatch(r"git@[A-Za-z0-9.-]+:kuonanhong/PRIVATE-MODELS(?:\.git)?", repo):
            raise SyncError("私人庫只接受 SSH：git@github.com:kuonanhong/PRIVATE-MODELS.git（可用 SSH Host alias）。")
        self.cache, self.repo, self.branch = cache, repo, branch
        self.env = os.environ.copy()
        self.env["GIT_TERMINAL_PROMPT"] = "0"
        ssh = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=20"]
        if key:
            if not key.is_file():
                raise SyncError("找不到 SSH 私鑰；請先在伺服器設定 GitHub 唯讀 Deploy Key。")
            ssh += ["-i", str(key), "-o", "IdentitiesOnly=yes"]
        self.env["GIT_SSH_COMMAND"] = " ".join(shlex.quote(x) for x in ssh)
        self.test_local = test_local
        self.commit = ""
        self.downloaded = 0

    def git(self, args, *, capture=True, check=True):
        base = ["git", "-c", "core.hooksPath=" + os.devnull,
                "-c", "protocol.file.allow=" + ("always" if self.test_local else "never"),
                "-C", str(self.cache)]
        result = subprocess.run(base + list(args), env=self.env, stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE)
        if check and result.returncode:
            detail = result.stderr.decode("utf-8", "replace").strip()[-3000:]
            raise SyncError("Git 讀取失敗。請檢查 SSH 唯讀 Deploy Key、已確認的 GitHub host key、網路與分支。\n" + detail)
        return result

    def refresh(self):
        # Work in a private bare cache; never execute repository scripts or checkout files.
        self.cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        no_symlink_path(self.cache, self.cache)
        if not (self.cache / "HEAD").exists():
            self.git(["init", "--bare", "--quiet"])
            self.git(["remote", "add", "origin", self.repo])
        origin = self.git(["remote", "get-url", "origin"]).stdout.decode().strip()
        if origin != self.repo:
            raise SyncError("快取的 origin 與指定私人庫不同；未覆寫。")
        if self.git(["check-ref-format", "--branch", self.branch], check=False).returncode:
            raise SyncError("不合法的私人庫分支。")
        self.git(["config", "remote.origin.promisor", "true"])
        self.git(["config", "remote.origin.partialclonefilter", "blob:none"])
        result = self.git(["fetch", "--quiet", "--no-tags", "--depth=1", "--filter=blob:none", "origin", self.branch])
        if not self.test_local and b"filtering not recognized" in result.stderr:
            raise SyncError("遠端未支援部分下載；停止，避免抓取其他專案權重。")
        self.commit = self.git(["rev-parse", "FETCH_HEAD"]).stdout.decode().strip()

    def manifest(self) -> dict:
        spec = self.commit + ":" + MANIFEST_PATH
        result = self.git(["cat-file", "-s", spec], check=False)
        if result.returncode:
            raise SyncError("私人庫沒有 " + MANIFEST_PATH + "。請先執行 bash huatuo-sync.sh 上傳本機模型；目前未下載或啟動 AI。")
        try:
            size = int(result.stdout.strip())
        except ValueError:
            raise SyncError("無法讀取私人模型清單大小。") from None
        if not 0 < size <= MAX_MANIFEST:
            raise SyncError("私人模型清單大小不合理。")
        raw = self.git(["show", spec]).stdout
        try:
            return validate_manifest(json.loads(raw))
        except (ValueError, UnicodeError) as error:
            raise SyncError("私人模型清單不是有效 JSON。") from error

    def blob(self, chunk: dict, destination: Path):
        spec = self.commit + ":" + chunk["path"]
        # Inspect tree metadata before fetching the blob. No remote filename is used as a command.
        row = self.git(["ls-tree", self.commit, "--", chunk["path"]]).stdout.decode().strip()
        parts = row.split(None, 3)
        if len(parts) != 4 or parts[0] != "100644" or parts[1] != "blob" or parts[3] != chunk["path"]:
            raise SyncError("遠端分塊缺失或不是一般檔案：" + chunk["path"])
        size = self.git(["cat-file", "-s", spec]).stdout.strip()
        if size != str(chunk["size"]).encode("ascii"):
            raise SyncError("遠端分塊大小與清單不同。")
        cmd = ["git", "-c", "core.hooksPath=" + os.devnull,
               "-c", "protocol.file.allow=" + ("always" if self.test_local else "never"),
               "-C", str(self.cache), "show", spec]
        with destination.open("wb") as output:
            process = subprocess.run(cmd, env=self.env, stdout=output, stderr=subprocess.PIPE)
        if process.returncode:
            raise SyncError("分塊下載中斷；重跑會保留已完成分塊。")
        self.downloaded += 1


def choose_model(manifest: dict, model: str) -> str:
    if model != "auto":
        return model
    available = {entry["path"] for entry in manifest["files"]}
    for choice in ("qwen3-4b", "qwen3-17b", "qwen3-06b"):
        if MODELS[choice] in available:
            return choice
    raise SyncError("私人庫尚無可啟動的 Qwen GGUF；請先由上傳腳本同步本機 models/。")


def selected_files(manifest: dict, model: str, tts: bool) -> list[dict]:
    model = choose_model(manifest, model)
    wanted = MODELS[model]
    if not any(f["path"] == wanted for f in manifest["files"]):
        raise SyncError("私人庫尚無選定模型 " + wanted + "；請先上傳該模型，或改用 --model。")
    chosen = []
    for entry in manifest["files"]:
        name = entry["path"]
        if name == wanted or (name.startswith(("models/kokoro/", "models/piper/")) and tts):
            chosen.append(entry)
        elif name.count("/") == 1 and Path(name).suffix.lower() in (".txt", ".md", ".json", ".license"):
            chosen.append(entry)
    return chosen


def synchronize(remote: GitRemote, source: Path, chunks_dir: Path, files: list[dict]) -> dict:
    """Per-file atomic reconstruction: failed hash never replaces an installed file."""
    chunks_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    no_symlink_path(chunks_dir, chunks_dir)
    stats = {"unchanged_files": 0, "installed_files": 0, "downloaded_chunks": 0, "cached_chunks": 0}
    before = remote.downloaded
    for entry in files:
        target = source / entry["path"]
        no_symlink_path(target, source)
        if verified(target, entry["size"], entry["sha256"]):
            stats["unchanged_files"] += 1
            continue
        print("同步 " + entry["path"], flush=True)
        parts = []
        for chunk in entry["chunks"]:
            part = chunks_dir / (chunk["sha256"] + ".part")
            no_symlink_path(part, chunks_dir)
            if verified(part, chunk["size"], chunk["sha256"]):
                stats["cached_chunks"] += 1
            else:
                # Incomplete downloads never acquire a verified content-addressed name.
                handle, name = tempfile.mkstemp(prefix="downloading-", dir=chunks_dir)
                os.close(handle)
                temporary = Path(name)
                try:
                    for attempt in range(3):
                        try:
                            remote.blob(chunk, temporary)
                            if not verified(temporary, chunk["size"], chunk["sha256"]):
                                raise SyncError("分塊 SHA-256 驗證失敗。")
                            break
                        except SyncError:
                            if attempt == 2:
                                raise
                            time.sleep(attempt + 1)
                    temporary.replace(part)
                finally:
                    temporary.unlink(missing_ok=True)
            parts.append(part)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        no_symlink_path(target, source)
        handle, name = tempfile.mkstemp(prefix="." + target.name + ".install-", dir=target.parent)
        h = hashlib.sha256()
        total = 0
        try:
            with os.fdopen(handle, "wb") as output:
                for part in parts:
                    with part.open("rb") as fragment:
                        for block in iter(lambda: fragment.read(4 * 1024 * 1024), b""):
                            output.write(block)
                            h.update(block)
                            total += len(block)
                output.flush()
                os.fsync(output.fileno())
            if total != entry["size"] or h.hexdigest() != entry["sha256"]:
                raise SyncError("完整檔 SHA-256 驗證失敗；原檔未變更。")
            Path(name).replace(target)
            stats["installed_files"] += 1
        finally:
            Path(name).unlink(missing_ok=True)
    stats["downloaded_chunks"] = remote.downloaded - before
    return stats


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="以伺服器的 SSH 唯讀 Deploy Key 同步私人模型，再執行本機／伺服器 CPU AI。GitHub Pages 本身不能執行此腳本或 Python。")
    parser.add_argument("--default-source", default=str(Path(__file__).resolve().parents[1]), help=argparse.SUPPRESS)
    parser.add_argument("--source", help="完整華佗 v2 程式資料夾；預設為腳本所在資料夾")
    parser.add_argument("--private-repo", default="git@github.com:kuonanhong/PRIVATE-MODELS.git", help="私人庫 SSH URL；支援 ~/.ssh/config 的 Host alias")
    parser.add_argument("--private-branch", default="main")
    parser.add_argument("--ssh-key", type=Path, help="伺服器既有唯讀 Deploy Key 私鑰，必須在專案外；不自動建立或上傳私鑰")
    parser.add_argument("--cache", type=Path, help="可選：專案／網頁根目錄以外的私人分塊快取")
    parser.add_argument("--model", choices=["auto", *MODELS], default="auto", help="預設 auto 選庫內可用的 4B → 1.7B → 0.6B；CPU 較慢可明確指定 0.6B")
    parser.add_argument("--tts", action="store_true", help="另同步 models/kokoro、models/piper 語音資源；仍需 setup-tts 安裝推論依賴")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--sync-only", action="store_true", help="只下載／校驗模型，不啟動服務")
    mode.add_argument("--status", action="store_true", help="只檢查本機上一份清單與模型，不連網、不下載")
    mode.add_argument("--start", "--run", dest="start", action="store_true", help="同步後啟動 AI 與學院（預設）")
    parser.add_argument("--setup-runtime", action="store_true", help="同步後執行 huatuo.sh setup-ai；搭配 --tts 另安裝神經語音依賴。需要 CMake 與 C/C++ 編譯器")
    parser.add_argument("--port", type=int, default=8020, help="學院伺服器埠（AI 模型另在 127.0.0.1:8383）")
    parser.add_argument("--site-origin", "--backend-url", dest="site_origin", help="正式同源 HTTPS 網址，例如 https://academy.example.org；不可帶子路徑。記住設定以供後續一鍵執行")
    parser.add_argument("--local", action="store_true", help="本次使用 127.0.0.1，忽略已記住的正式後端網址")
    args = parser.parse_args(argv)
    source = Path(args.source or args.default_source).expanduser().resolve()
    if not (source / "huatuo.sh").is_file() or not (source / "portable/server.py").is_file() or not (source / "public/academy/index.html").is_file():
        raise SyncError("找不到完整華佗 v2 程式；把本工具放入專案根目錄，或加 --source /完整/專案路徑。")
    if not 1024 <= args.port <= 65535:
        raise SyncError("--port 必須介於 1024–65535。")
    if args.local and args.site_origin:
        raise SyncError("--local 與 --backend-url / --site-origin 請擇一使用。")
    settings = cloud_settings(source, args.site_origin)
    # Cache outside the source avoids accidental upload and static export exposure.
    tag = hashlib.sha256((str(source) + "\0" + args.private_repo).encode()).hexdigest()[:16]
    cache = (args.cache.expanduser().absolute() if args.cache else source.parent / ".huatuo-private-cache" / tag)
    if cache.is_relative_to(source) or cache.resolve().is_relative_to(source):
        raise SyncError("私人快取必須在專案與網頁根目錄之外。")
    no_symlink_path(cache, Path(cache.anchor))
    if args.ssh_key:
        args.ssh_key = args.ssh_key.expanduser().resolve()
        if args.ssh_key.is_relative_to(source):
            raise SyncError("SSH 私鑰不可存放在專案內；請使用 ~/.ssh/ 的伺服器 Deploy Key。")
    state = cache / "last-manifest.json"
    no_symlink_path(state, cache)
    if args.status:
        if not state.is_file():
            print("尚無本機同步記錄。先用 --sync-only 取得私人模型。")
            return 1
        manifest = validate_manifest(json.loads(state.read_text(encoding="utf-8")))
        args.model = choose_model(manifest, args.model)
        files = selected_files(manifest, args.model, args.tts)
        missing = []
        for entry in files:
            no_symlink_path(source / entry["path"], source)
            ok = verified(source / entry["path"], entry["size"], entry["sha256"])
            print(("OK  " if ok else "缺少／不同  ") + entry["path"])
            if not ok:
                missing.append(entry["path"])
        return int(bool(missing))
    remote = GitRemote(cache / "git", args.private_repo, args.private_branch, args.ssh_key)
    print("經 SSH 讀取私人庫；只抓取華佗清單與需要的模型分塊。", flush=True)
    remote.refresh()
    manifest = remote.manifest()
    args.model = choose_model(manifest, args.model)
    print("本次 CPU 模型：" + args.model + "（可用 --model 明確指定）", flush=True)
    files = selected_files(manifest, args.model, args.tts)
    stats = synchronize(remote, source, cache / "chunks", files)
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    handle, state_name = tempfile.mkstemp(prefix="manifest-", dir=cache)
    with os.fdopen(handle, "w", encoding="utf-8") as output:
        json.dump(manifest, output, ensure_ascii=False, indent=2)
    Path(state_name).replace(state)
    print("完成：新增／修補 {installed_files} 檔，沿用 {unchanged_files} 檔；下載 {downloaded_chunks} 分塊，沿用 {cached_chunks} 快取分塊。".format(**stats), flush=True)
    if args.sync_only:
        return 0
    env = os.environ.copy()
    env["HT_PYTHON"] = sys.executable
    if args.setup_runtime:
        subprocess.run(["bash", str(source / "huatuo.sh"), "setup-ai"], check=True, env=env)
        if args.tts:
            subprocess.run(["bash", str(source / "huatuo.sh"), "setup-tts"], check=True, env=env)
    env["HT_GGUF"] = str(source / MODELS[args.model])
    origin = ("http://127.0.0.1:" + str(args.port)) if args.local else settings.get("backend_url")
    if origin:
        env["SITE_ORIGIN"] = origin
    print("啟動本機 AI 與同源學院；瀏覽 " + (origin or env.get("SITE_ORIGIN") or "http://127.0.0.1:" + str(args.port)) + "。正式網域請以 HTTPS 反向代理連至本機學院埠。", flush=True)
    return subprocess.call(["bash", str(source / "huatuo.sh"), "ai", "--port", str(args.port), "--host", "127.0.0.1"], env=env)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (SyncError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print("停止：" + str(error), file=sys.stderr)
        raise SystemExit(1)
