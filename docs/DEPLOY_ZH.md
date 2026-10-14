# 部署指南（docs/DEPLOY_ZH.md）

## A. 離線版（USB／郵寄／教室）
`bash build-offline.sh` → `dist/HuaTuo_Medical_Academy_offline_v1.0.0.zip`。解壓後雙擊 `index.html`；手機可用檔案 App 開啟，或放到任何靜態主機。

## B. 純靜態網站（GitHub Pages／Cloudflare Pages／Netlify）
```bash
bash deploy-static.sh                     # 產生 github-pages/（已設定 siteMode:'static'、.nojekyll）
bash publish-github.sh --repo https://github.com/OWNER/REPO.git --pages
```
或把倉庫推到 GitHub 後啟用 `.github/workflows/pages.yml`（push 到 main 自動發布）。靜態版：全部課程、模擬器、本機學習檔案、PWA 離線快取；**沒有**驗證帳號、付款與 AI（會顯示價格與轉帳資訊）。

## C. 完整伺服器（一台 Linux／macOS／Windows 主機）
1. 安裝 Python 3.10+（不需 pip 套件；PDF 教材索引才需 `pip install -r requirements-documents.txt`）。
2. `cp .env.example .env`，至少填：`SITE_ORIGIN=https://你的網域`、SMTP（寄驗證碼）、`SMS_PROVIDER`（twilio／mitake／webhook）、`BILLING_MODE`。
3. HTTPS 反向代理：`examples/nginx.conf`（Let's Encrypt）；伺服器本身只監聽 `127.0.0.1:8020`。
4. 以 systemd 常駐：`sudo cp examples/huatuo.service /etc/systemd/system/ && sudo systemctl enable --now huatuo`（`--user` 模式也可，`update-and-upload.sh --restart` 會自動嘗試兩者）。
5. 金流 Webhook：Stripe → `https://你的網域/api/billing/stripe/webhook`；綠界 ReturnURL 由程式帶入 `…/api/billing/ecpay/notify`。
6. AI：主機上執行 `run-ai-llamacpp.sh`／`run-ai-ollama.sh`（本機模型）或在 `.env` 填雲端金鑰後以 `run-commerce.sh` 啟動。
7. 備份：`portable/data/`（SQLite、server-secret.txt、knowledge.json、rates.json）請定期備份；`.env` 與 `portable/data/` 絕不進 Git。

## D. 站長日常
| 工作 | 指令 |
|---|---|
| 推送程式更新 | `bash update-and-upload.sh --ssh deploy@host:/srv/huatuo --only code --restart` |
| 新增教材 | 放入 `local-documents/` → `bash update-and-upload.sh --ssh … --only documents --reindex-remote` |
| 更新模型權重 | `bash install-ai-models.sh --model … --download` → `bash update-and-upload.sh --ssh … --only models` |
| 新增課程 | 編輯 `tools/curriculum/*.py` → `bash rebuild-curriculum.sh` → `bash update-and-upload.sh --ssh … --only code` |
| 確認轉帳 | `python3 -m portable.commerce_admin confirm-transfer HT… --reason "…"` |
| 雲端備份 | `bash update-and-upload.sh --remote gdrive:HuaTuoBackup` |

## E. Windows 伺服器
以 `run-local.bat` 或 `py -3 portable\server.py --port 8020` 啟動；HTTPS 可用 Caddy（`reverse_proxy 127.0.0.1:8020`）；上傳腳本請在 Git Bash 或 WSL 執行（需 rsync）。

## F. 安全摘要
* 密碼 PBKDF2-SHA256 600,000 回合；Session Cookie HttpOnly、SameSite=Lax、HTTPS 時 Secure。
* 所有寫入 API 檢查 `Origin`／`Host` 與 `application/json`；金流回呼另以簽章驗證。
* 速率限制：登入 12 次／15 分鐘／帳號、註冊 10 次／15 分鐘／IP、AI 60 次／小時／帳號、結帳 20 次／小時。
* 回應標頭：`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`、HSTS（HTTPS 時）。
* 靜態檔只從 `public/academy/` 提供，阻擋路徑穿越與隱藏檔。
