#!/usr/bin/env bash
# =====================================================================================
#  update-and-upload.sh — 華佗醫藥生醫學院 一鍵更新與上傳
#
#  執行時會：
#    1. （可選）重建課程資料、重建離線套件、重建本地教材索引
#    2. 驗證資料一致性、掃描不得外流的機密（.env、資料庫、金鑰）
#    3. 計算每個檔案的 SHA-256，與上次上傳的狀態比對，只傳「本地更新與新增」的檔案
#    4. 上傳三類內容（可各自選擇）：
#         code       程式與公開網站（public/、portable/、tools/、*.sh、docs/…）
#         documents  新增的教材文件 local-documents/（AI 師傅引用的資料）
#         models     模型／權重 models/*.gguf（續傳、校驗，排除未完成的 .part）
#       目的地可同時指定多個：
#         --ssh  user@host:/srv/huatuo        rsync over SSH（支援續傳、頻寬限制）
#         --remote  gdrive:HuaTuoAcademy       rclone remote（S3／Google Drive／OneDrive…）
#         --repo  https://github.com/O/R.git  Git 推送程式碼（公開原始碼快照，不含教材與模型）
#         --pages                              另外把純靜態網站推到 gh-pages 分支（GitHub Pages）
#    5. （可選）在遠端重建教材索引並重啟服務：--reindex-remote --restart
#
#  範例：
#    bash update-and-upload.sh --ssh deploy@academy.example.org:/srv/huatuo --restart
#    bash update-and-upload.sh --ssh deploy@host:/srv/huatuo --only documents --reindex-remote
#    bash update-and-upload.sh --remote gdrive:HuaTuoBackup --only models
#    bash update-and-upload.sh --repo git@github.com:me/huatuo.git --pages --message "v1.0.1"
#    bash update-and-upload.sh --ssh deploy@host:/srv/huatuo --dry-run
#
#  安全原則：永不上傳 .env、*.sqlite3、server-secret.txt、*.pem/*.key；教材與模型不進 Git；
#  模型只傳校驗完成的 .gguf；每次上傳寫入 logs/ 與 UPLOAD_MANIFEST.json（檔案雜湊清單）。
#  AI 師傅（生成式 AI 回覆學徒問題）在遠端由 run-ai-llamacpp.sh / run-ai-ollama.sh / run-ai-cloud.sh 啟動。
# =====================================================================================
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$TASK_ROOT"

SSH_TARGET=''; RCLONE_REMOTE=''; REPO_URL=''; BRANCH='main'; MESSAGE=''
ONLY='all'; DRY_RUN=0; DO_PAGES=0; DO_RESTART=0; DO_REINDEX_REMOTE=0
REBUILD=0; DO_INDEX=0; BUILD_OFFLINE=0; MIRROR=0; BWLIMIT=''; SSH_PORT=''; FORCE_ALL=0
DOCUMENTS_DIR="$TASK_ROOT/local-documents"; MODELS_DIR="$TASK_ROOT/models"
STATE_FILE="$TASK_ROOT/.upload-state.json"; LOG_DIR="$TASK_ROOT/logs"
REMOTE_SERVICE="${HT_REMOTE_SERVICE:-huatuo}"

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,2\}//'; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh) SSH_TARGET="$2"; shift 2;;
    --ssh-port) SSH_PORT="$2"; shift 2;;
    --remote) RCLONE_REMOTE="$2"; shift 2;;
    --repo) REPO_URL="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --message) MESSAGE="$2"; shift 2;;
    --only) ONLY="$2"; shift 2;;
    --documents) DOCUMENTS_DIR="$2"; shift 2;;
    --models) MODELS_DIR="$2"; shift 2;;
    --bwlimit) BWLIMIT="$2"; shift 2;;
    --pages) DO_PAGES=1; shift;;
    --restart) DO_RESTART=1; shift;;
    --reindex-remote) DO_REINDEX_REMOTE=1; shift;;
    --rebuild-curriculum) REBUILD=1; shift;;
    --index-documents) DO_INDEX=1; shift;;
    --build-offline) BUILD_OFFLINE=1; shift;;
    --mirror) MIRROR=1; shift;;
    --force) FORCE_ALL=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "未知選項：$1" >&2; usage; exit 2;;
  esac
done
[[ "$ONLY" =~ ^(all|code|documents|models)$ ]] || { echo '--only 必須是 all / code / documents / models' >&2; exit 2; }
[[ -n "$SSH_TARGET" || -n "$RCLONE_REMOTE" || -n "$REPO_URL" ]] || { echo '請至少指定一個目的地：--ssh user@host:/path、--remote remote:path 或 --repo URL' >&2; usage; exit 2; }
if [[ -n "$SSH_TARGET" ]]; then
  [[ "$SSH_TARGET" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/.+$ ]] || { echo '--ssh 格式：user@host:/absolute/path' >&2; exit 2; }
  command -v rsync >/dev/null || { echo '需要 rsync（macOS 內建；Linux: apt install rsync；Windows 請用 Git Bash + rsync 或 WSL）。' >&2; exit 1; }
  command -v ssh >/dev/null || { echo '需要 ssh。' >&2; exit 1; }
fi
if [[ -n "$RCLONE_REMOTE" ]]; then
  [[ "$RCLONE_REMOTE" == *:* && "$RCLONE_REMOTE" != -* ]] || { echo '--remote 格式：remote:path（先執行 rclone config）' >&2; exit 2; }
  command -v rclone >/dev/null || { echo '需要 rclone：https://rclone.org/install/' >&2; exit 1; }
fi
if [[ -n "$REPO_URL" ]]; then
  [[ "$REPO_URL" =~ ^https://github\.com/[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*(\.git)?$ || "$REPO_URL" =~ ^git@github\.com:[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*(\.git)?$ ]] || { echo '需要不含帳密的 GitHub HTTPS 或 SSH 倉庫網址。' >&2; exit 2; }
  command -v git >/dev/null || { echo '需要 Git。' >&2; exit 1; }
  git check-ref-format --branch "$BRANCH" >/dev/null || { echo 'Git 分支名稱無效。' >&2; exit 2; }
fi
PY=''
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(sys.version_info<(3,10))' 2>/dev/null; then PY="$candidate"; break; fi
done
[[ -n "$PY" ]] || { echo '需要 Python 3.10+（Conda：conda create -n huatuo python=3.12）。' >&2; exit 1; }

mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/upload-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
echo "== 華佗醫藥生醫學院 update-and-upload  $STAMP  (only=$ONLY dry-run=$DRY_RUN)"

# ---------------------------------------------------------------- 1. local build steps
if [[ "$REBUILD" == 1 ]]; then echo '-- 重建課程資料'; bash "$TASK_ROOT/rebuild-curriculum.sh"; fi
if [[ "$DO_INDEX" == 1 ]]; then
  [[ -d "$DOCUMENTS_DIR" ]] || { echo "找不到教材資料夾 $DOCUMENTS_DIR" >&2; exit 1; }
  echo '-- 重建本地教材索引'; bash "$TASK_ROOT/index-documents.sh" --source "$DOCUMENTS_DIR"
fi
if [[ "$BUILD_OFFLINE" == 1 ]]; then echo '-- 重建離線套件'; bash "$TASK_ROOT/build-offline.sh"; fi

# ---------------------------------------------------------------- 2. validation + secret scan
echo '-- 驗證課程資料'
"$PY" "$TASK_ROOT/tools/check_offline.py"
echo '-- 掃描公開目錄是否含機密'
"$PY" - "$TASK_ROOT" <<'PY'
import re, sys
from pathlib import Path
root = Path(sys.argv[1])
bad = []
for folder in ("public", "portable", "tools", "docs", "examples"):
    for p in (root / folder).rglob("*"):
        if p.is_relative_to(root / "portable" / "data"):
            continue  # runtime data is never uploaded (rsync/rclone exclude portable/data/)
        if p.is_file() and (p.name.startswith(".env") or p.suffix in (".sqlite3", ".pem", ".key") or p.name == "server-secret.txt"):
            bad.append(str(p.relative_to(root)))
patterns = re.compile(r"(sk_live_[A-Za-z0-9]{12,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)")
for p in list((root / "public").rglob("*.js")) + list((root / "public").rglob("*.html")) + list(root.glob("*.sh")):
    try:
        if patterns.search(p.read_text(encoding="utf-8", errors="ignore")):
            bad.append(str(p.relative_to(root)) + " (looks like a live secret)")
    except OSError:
        pass
if bad:
    sys.exit("偵測到不得上傳的機密檔案／內容：\n  " + "\n  ".join(bad))
print("   沒有機密檔案外流。")
PY
if [[ -d "$MODELS_DIR" && -L "$MODELS_DIR" ]]; then echo 'models/ 不能是符號連結。' >&2; exit 1; fi

# ---------------------------------------------------------------- 3. change detection + manifest
echo '-- 計算檔案雜湊並比對上次上傳狀態'
"$PY" - "$TASK_ROOT" "$STATE_FILE" "$DOCUMENTS_DIR" "$MODELS_DIR" "$ONLY" "$FORCE_ALL" <<'PY'
import hashlib, json, os, sys, time
from pathlib import Path
root, state_path, docs, models, only, force = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5], sys.argv[6] == "1"
EXCLUDE_DIRS = {".git", "__pycache__", "node_modules", "logs", "github-pages", "dist", ".pytest_cache", "local-documents", "models", "portable/data"}
EXCLUDE_NAMES = {".env", ".upload-state.json", ".DS_Store", "UPLOAD_MANIFEST.json"}
def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()
def walk(base, group):
    out = {}
    if not base.is_dir():
        return out
    for p in sorted(base.rglob("*")):
        if not p.is_file() or p.is_symlink():
            continue
        rel = p.relative_to(root if group == "code" else base).as_posix()
        parts = p.relative_to(root).parts if group == "code" else p.relative_to(base).parts
        if group == "code" and any("/".join(parts[:i + 1]) in EXCLUDE_DIRS or parts[i] in EXCLUDE_DIRS for i in range(len(parts))):
            continue
        if p.name in EXCLUDE_NAMES or p.name.startswith(".env") or p.suffix in (".sqlite3", ".sqlite3-wal", ".sqlite3-shm", ".pem", ".key", ".pyc", ".part", ".tmp", ".crdownload"):
            continue
        if group == "models" and p.suffix.lower() not in (".gguf", ".bin", ".safetensors", ".json", ".md", ".txt"):
            continue
        out[rel] = {"sha256": sha(p), "bytes": p.stat().st_size}
    return out
groups = {}
if only in ("all", "code"):
    groups["code"] = walk(root, "code")
if only in ("all", "documents"):
    groups["documents"] = walk(docs, "documents")
if only in ("all", "models"):
    groups["models"] = walk(models, "models")
previous = {}
if state_path.is_file() and not force:
    try:
        previous = json.loads(state_path.read_text(encoding="utf-8")).get("groups", {})
    except ValueError:
        previous = {}
summary = {}
for g, files in groups.items():
    old = previous.get(g, {})
    changed = [k for k, v in files.items() if old.get(k, {}).get("sha256") != v["sha256"]]
    removed = [k for k in old if k not in files]
    summary[g] = {"files": len(files), "changed": len(changed), "removed": len(removed), "bytes": sum(v["bytes"] for v in files.values()), "changedBytes": sum(files[k]["bytes"] for k in changed)}
    print(f"   {g:10} {len(files):6} 檔  更新/新增 {len(changed):5}  移除 {len(removed):4}  待傳 {summary[g]['changedBytes']/1e6:,.1f} MB")
manifest = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "groups": groups, "summary": summary}
(root / "UPLOAD_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
(root / ".upload-pending.json").write_text(json.dumps({"groups": groups}, ensure_ascii=False), encoding="utf-8")
PY

RSYNC_COMMON=(-az --partial --append-verify --human-readable --info=progress2 --exclude '.env*' --exclude '*.sqlite3*' --exclude 'server-secret.txt' --exclude '*.pem' --exclude '*.key' --exclude '.git/' --exclude '__pycache__/' --exclude 'logs/' --exclude '.upload-state.json' --exclude '.upload-pending.json' --exclude '*.part' --exclude '*.tmp' --exclude 'node_modules/' --exclude 'github-pages/' --exclude 'dist/' --exclude 'portable/data/')
[[ -n "$BWLIMIT" ]] && RSYNC_COMMON+=(--bwlimit="$BWLIMIT")
[[ "$MIRROR" == 1 ]] && RSYNC_COMMON+=(--delete)
[[ "$DRY_RUN" == 1 ]] && RSYNC_COMMON+=(--dry-run)
SSH_CMD='ssh'
[[ -n "$SSH_PORT" ]] && SSH_CMD="ssh -p $SSH_PORT"
RCLONE_COMMON=(--progress --retries 8 --low-level-retries 20 --transfers 2 --checkers 4 --exclude '.env*' --exclude '*.sqlite3*' --exclude 'server-secret.txt' --exclude '*.pem' --exclude '*.key' --exclude '.git/**' --exclude '__pycache__/**' --exclude 'logs/**' --exclude '*.part' --exclude '*.tmp' --exclude 'portable/data/**')
[[ "$DRY_RUN" == 1 ]] && RCLONE_COMMON+=(--dry-run)

# ---------------------------------------------------------------- 4a. rsync over SSH
if [[ -n "$SSH_TARGET" ]]; then
  HOST="${SSH_TARGET%%:*}"; RPATH="${SSH_TARGET#*:}"
  echo "-- 上傳到 $HOST:$RPATH（rsync over SSH）"
  if [[ "$DRY_RUN" == 0 ]]; then $SSH_CMD -n "$HOST" "mkdir -p '$RPATH/local-documents' '$RPATH/models' '$RPATH/portable/data'"; fi
  if [[ "$ONLY" == all || "$ONLY" == code ]]; then
    rsync "${RSYNC_COMMON[@]}" --exclude 'local-documents/' --exclude 'models/' -e "$SSH_CMD" "$TASK_ROOT/" "$HOST:$RPATH/"
  fi
  if [[ ( "$ONLY" == all || "$ONLY" == documents ) && -d "$DOCUMENTS_DIR" ]]; then
    rsync "${RSYNC_COMMON[@]}" -e "$SSH_CMD" "$DOCUMENTS_DIR/" "$HOST:$RPATH/local-documents/"
  fi
  if [[ ( "$ONLY" == all || "$ONLY" == models ) && -d "$MODELS_DIR" ]]; then
    # 權重檔很大：續傳 + 以 SHA-256 清單校驗
    rsync "${RSYNC_COMMON[@]}" --include '*/' --include '*.gguf' --include '*.safetensors' --include '*.bin' --include '*.json' --include '*.md' --include '*.txt' --exclude '*' -e "$SSH_CMD" "$MODELS_DIR/" "$HOST:$RPATH/models/"
    if [[ "$DRY_RUN" == 0 ]]; then
      echo '   校驗遠端模型雜湊'
      "$PY" - "$TASK_ROOT/.upload-pending.json" <<'PY' | $SSH_CMD "$HOST" "cd '$RPATH/models' && sha256sum -c --quiet - && echo '   模型校驗通過' || { echo '模型校驗失敗，請重新執行以續傳' >&2; exit 1; }"
import json, sys
groups = json.load(open(sys.argv[1]))["groups"]
for name, meta in groups.get("models", {}).items():
    if name.endswith((".gguf", ".safetensors", ".bin")):
        print(f"{meta['sha256']}  {name}")
PY
    fi
  fi
  if [[ "$DRY_RUN" == 0 && "$DO_REINDEX_REMOTE" == 1 ]]; then
    echo '-- 遠端重建教材索引'
    $SSH_CMD -n "$HOST" "cd '$RPATH' && bash index-documents.sh"
  fi
  if [[ "$DRY_RUN" == 0 && "$DO_RESTART" == 1 ]]; then
    echo "-- 遠端重啟服務 ($REMOTE_SERVICE)"
    $SSH_CMD -n "$HOST" "if systemctl --user is-enabled '$REMOTE_SERVICE' >/dev/null 2>&1; then systemctl --user restart '$REMOTE_SERVICE'; elif sudo -n systemctl is-enabled '$REMOTE_SERVICE' >/dev/null 2>&1; then sudo -n systemctl restart '$REMOTE_SERVICE'; else echo '找不到 systemd 服務 $REMOTE_SERVICE；請手動重啟 run-local.sh（範例見 examples/huatuo.service）'; fi"
  fi
fi

# ---------------------------------------------------------------- 4b. rclone remote
if [[ -n "$RCLONE_REMOTE" ]]; then
  echo "-- 備份到 $RCLONE_REMOTE（rclone copy，不刪除目的地檔案）"
  if [[ "$ONLY" == all || "$ONLY" == code ]]; then
    rclone copy "$TASK_ROOT" "$RCLONE_REMOTE/code" "${RCLONE_COMMON[@]}" --exclude 'local-documents/**' --exclude 'models/**'
  fi
  if [[ ( "$ONLY" == all || "$ONLY" == documents ) && -d "$DOCUMENTS_DIR" ]]; then
    rclone copy "$DOCUMENTS_DIR" "$RCLONE_REMOTE/local-documents" "${RCLONE_COMMON[@]}"
  fi
  if [[ ( "$ONLY" == all || "$ONLY" == models ) && -d "$MODELS_DIR" ]]; then
    rclone copy "$MODELS_DIR" "$RCLONE_REMOTE/models" "${RCLONE_COMMON[@]}" --include '*.gguf' --include '*.safetensors' --include '*.bin' --include '*.json' --include '*.md' --include '*.txt'
  fi
  [[ "$DRY_RUN" == 1 ]] || rclone copyto "$TASK_ROOT/UPLOAD_MANIFEST.json" "$RCLONE_REMOTE/UPLOAD_MANIFEST.json" >/dev/null
fi

# ---------------------------------------------------------------- 4c. git push (code only)
if [[ -n "$REPO_URL" && ( "$ONLY" == all || "$ONLY" == code ) ]]; then
  echo "-- 推送程式碼到 $REPO_URL ($BRANCH)"
  if [[ "$DRY_RUN" == 1 ]]; then
    bash "$TASK_ROOT/publish-github.sh" --repo "$REPO_URL" --branch "$BRANCH" --dry-run
  else
    ARGS=(--repo "$REPO_URL" --branch "$BRANCH")
    [[ -n "$MESSAGE" ]] && ARGS+=(--message "$MESSAGE")
    [[ "$DO_PAGES" == 1 ]] && ARGS+=(--pages)
    bash "$TASK_ROOT/publish-github.sh" "${ARGS[@]}"
  fi
fi

# ---------------------------------------------------------------- 5. record state
if [[ "$DRY_RUN" == 0 ]]; then
  mv -f "$TASK_ROOT/.upload-pending.json" "$STATE_FILE"
  echo "== 完成。上傳清單：UPLOAD_MANIFEST.json；紀錄：$LOG"
else
  rm -f "$TASK_ROOT/.upload-pending.json"
  echo "== 試跑完成（未上傳）。紀錄：$LOG"
fi
