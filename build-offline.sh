#!/usr/bin/env bash
# 打包「雙擊即用」的離線版 ZIP（不含伺服器資料庫、教材與模型）。輸出 dist/HuaTuo_Medical_Academy_offline.zip
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
OUT="${1:-$TASK_ROOT/dist}"
mkdir -p "$OUT"
python3 - "$TASK_ROOT" "$OUT" <<'PY'
import sys, zipfile, json
from pathlib import Path
root, out = Path(sys.argv[1]), Path(sys.argv[2])
release = json.loads((root / "public/academy/data/release.json").read_text(encoding="utf-8"))
target = out / f"HuaTuo_Medical_Academy_offline_v{release['version']}.zip"
skip_suffix = (".sqlite3", ".pem", ".key", ".pyc", ".part")
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(root / "index.html", "HuaTuo_Medical_Academy/index.html")
    z.write(root / "README.md", "HuaTuo_Medical_Academy/README.md")
    for p in sorted((root / "public").rglob("*")):
        if p.is_file() and not p.name.startswith(".env") and p.suffix not in skip_suffix:
            z.write(p, "HuaTuo_Medical_Academy/" + p.relative_to(root).as_posix())
print("離線套件：", target, f"{target.stat().st_size/1e6:.1f} MB")
PY
