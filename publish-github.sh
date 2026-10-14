#!/usr/bin/env bash
# 把程式碼推送到 GitHub（不含 .env、資料庫、教材 local-documents/、模型 models/）。
# bash publish-github.sh --repo https://github.com/OWNER/REPO.git [--branch main] [--message "..."] [--pages] [--dry-run]
# --pages 另外把 deploy-static.sh 的輸出推到 gh-pages 分支，GitHub Pages 設定選 gh-pages 即可上線。
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_URL=''; BRANCH='main'; MESSAGE=''; DRY_RUN=0; PAGES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_URL="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --message) MESSAGE="$2"; shift 2;;
    --pages) PAGES=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) sed -n '2,5p' "$0"; exit 0;;
    *) echo "未知選項：$1" >&2; exit 2;;
  esac
done
[[ -n "$REPO_URL" ]] || { echo '需要 --repo' >&2; exit 2; }
command -v git >/dev/null || { echo '需要 Git' >&2; exit 1; }
cd "$TASK_ROOT"
if [[ ! -d .git ]]; then git init -q -b "$BRANCH" 2>/dev/null || { git init -q; git checkout -q -b "$BRANCH"; }; fi
cat > .gitignore <<'GI'
.env
.env.*
!.env.example
portable/data/
local-documents/*
!local-documents/README.md
models/*
!models/README.md
logs/
github-pages/
dist/
__pycache__/
*.pyc
*.sqlite3*
*.pem
*.key
.upload-state.json
.upload-pending.json
UPLOAD_MANIFEST.json
.DS_Store
.pytest_cache/
GI
if git ls-files --error-unmatch .env >/dev/null 2>&1 || git ls-files | grep -Eq '\.sqlite3|server-secret|local-documents/.+|models/.+\.gguf'; then
  echo 'Git 追蹤了機密或大型私有檔案；請先 git rm --cached 並檢查歷史。未推送。' >&2; exit 1
fi
git add -A
if ! git diff --cached --quiet; then
  [[ -n "$MESSAGE" ]] || MESSAGE="Update Hua Tuo Medical Academy $(date +%Y-%m-%d\ %H:%M)"
  if [[ "$DRY_RUN" == 1 ]]; then echo "(dry-run) 將提交：$MESSAGE"; git diff --cached --stat | tail -3; else git commit -q -m "$MESSAGE"; fi
else
  echo '沒有程式變更需要提交。'
fi
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
if [[ "$DRY_RUN" == 1 ]]; then echo "(dry-run) 將推送 $BRANCH 到 $REPO_URL"; exit 0; fi
git push -u origin "$BRANCH"
echo "已推送 $BRANCH → $REPO_URL"
if [[ "$PAGES" == 1 ]]; then
  bash "$TASK_ROOT/deploy-static.sh" --out "$TASK_ROOT/github-pages"
  TMP="$(mktemp -d)"
  git -C "$TMP" init -q -b gh-pages 2>/dev/null || { git -C "$TMP" init -q; git -C "$TMP" checkout -q -b gh-pages; }
  cp -R "$TASK_ROOT/github-pages/." "$TMP/"
  git -C "$TMP" add -A && git -C "$TMP" commit -q -m "Static site $(date +%Y-%m-%d)" && git -C "$TMP" push -f "$REPO_URL" gh-pages
  rm -rf "$TMP"
  echo '已推送 gh-pages 分支；在 GitHub → Settings → Pages 選擇 gh-pages 分支即可公開。'
fi
