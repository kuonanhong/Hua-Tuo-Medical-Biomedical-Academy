# 華佗醫藥生醫學院 · Hua Tuo Medical & Biomedical Academy

以《馬蓋先工程學院 v11》的「跟師傅逐步學」架構為藍本，重新建構的**醫學、外科、中醫針灸推拿、生醫基因與創新**完整網站程式。
雙擊即可離線使用；加上 Python 3.10 即有驗證會員、學習進度、學習通行證付費與生成式 AI 師傅。

| 項目 | 內容 |
|---|---|
| 專業主題 | **2,420 門**逐步課程、69 個科別、5 個學院（西醫外科／西醫內科與基礎／中醫／生醫基因與 AI／諾貝爾與研究技術），17,180 個步驟，每步含目標、操作、觀察、失敗模式、驗收與測驗 |
| 西醫 | 神經外科（DBS、開顱、脊椎…）、心臟內科／外科（PCI、TAVI、CABG、瓣膜…）、骨科與關節重建（TKA、THA、ACL…）、一般外科、急診、麻醉、婦產、眼耳鼻喉、泌尿、整形、腫瘤、影像、檢驗、護理、藥理、公共衛生、基礎醫學 |
| 中醫 | 基礎理論、經典與名醫（《黃帝內經》《傷寒論》《金匱要略》《溫病條辨》《針灸甲乙經》…，參考「子子中醫」等公開講解）、四診、針灸技術、灸罐刮痧、推拿、泰式按摩、氣功導引、內科／婦兒皮傷五官病症、食療；**361 正經穴＋35 奇穴、255 味中藥、176 首方劑** |
| 生醫與創新 | AlphaGo→AlphaZero→AlphaFold 學理拆解（含可操作的 MCTS 示範）、基因體學、基因編輯與細胞治療、免疫治療與疫苗、生醫工程、神經科技與腦機介面、再生醫學、臨床研究方法 |
| 諾貝爾 | 生理學或醫學獎 1901–2026 共 117 項、生醫相關化學獎 35 項、56 項研究技術逐一拆解（含 2026 年光遺傳學與不對稱自催化） |
| 兩個級別 | **基本級**（跟師傅學，每一步驗收）與**實習級**（虛擬病人：中醫望聞問切、脈診訓練器、舌象、穴位定位；西醫量血壓、測血糖、生命徵象、心電圖、檢驗、SOAP） |
| 收費 | 每門課**第一節免費**，其餘章節與實習級由學習通行證解鎖：NT$299／30 天、NT$2,490／365 天；依觀看者語系自動換算幣別（即時匯率）；信用卡（Stripe 3-D Secure／綠界）或郵局轉帳，款項結算到站長郵局帳戶（700／0101034／0187821） |
| 會員 | 註冊必填**帳號、密碼、信箱、手機**四項，信箱驗證碼＋簡訊驗證碼 |
| 介面 | 36 種介面語言（跟隨瀏覽器語系）、深色／淺色、版面、字體、主色、語音（男女聲、音高、語速、風格）、首頁 2,420 個**各不相同**的原創離線 SVG 圖示輪播 |
| 跨平台 | 手機、平板、筆電、桌機（PWA 可加入主畫面）；Windows／macOS／Linux 伺服器 |

---

## 1. 快速開始

### 1.1 離線閱讀（不需安裝）
解壓縮後雙擊最外層 `index.html`。全部課程、中醫圖庫、諾貝爾與 AI 頁、實習模擬器皆可離線使用；帳號為「本機學習檔案」，進度存在瀏覽器。

### 1.2 本機伺服器（驗證帳號、付款、AI 師傅）
```bash
bash run-local.sh            # macOS / Linux   → http://127.0.0.1:8020
run-local.bat                # Windows（雙擊）
```
只需 Python 3.10+，不需安裝任何套件。本機未設定 SMTP／簡訊時為 **dev 驗證模式**：驗證碼直接顯示在畫面與終端機，可完整測試註冊流程。
預設 `BILLING_MODE=transfer`：每門課第一節免費、其餘鎖定，學員可用郵局轉帳；站長自用或展示可在 `.env` 設 `BILLING_MODE=disabled` 全部開放。

### 1.3 正式部署（HTTPS、收費、AI）
```bash
cp .env.example .env         # 填入 SITE_ORIGIN、SMTP／SMS、金流、AI 金鑰
bash run-commerce.sh         # 檢查設定後啟動；放在 nginx HTTPS 反向代理之後（examples/nginx.conf、examples/huatuo.service）
```
詳見 `docs/DEPLOY_ZH.md`、`docs/COMMERCE_ZH.md`、`docs/AI_ROUTES_ZH.md`。

### 1.4 測試
```bash
python3 tests/run_tests.py   # 22 項：帳號四欄位與雙驗證碼、進度、轉帳開通、ECPay 簽章、Stripe 簽章、AI 路線、課程資料一致性
```
（已安裝 pytest 時自動改用 `pytest tests/`。）

---

## 2. 專案結構
```
index.html                      離線入口（轉到 public/academy/）
public/academy/                 前端（純靜態，可部署到 GitHub Pages）
  index.html style.css          外殼與設計系統（深色／緊湊／RTL／列印）
  bootstrap.js config.js        載入器與公開設定（絕不放金鑰）
  i18n.js locale.js voice.js    36 種介面語言、內容翻譯快取、語音
  personalization.js            個人桌面（主題、版面、語音、幣別，每位會員各自記住）
  account.js membership.js      會員（四欄位＋雙驗證）、通行證與付款
  tutor.js                      AI 師傅面板
  course-player.js              課程播放器（章節／步驟／測驗／鎖定）
  intern-tcm.js intern-western.js  實習級模擬器
  tcm-library.js nobel-explorer.js 中醫圖庫、諾貝爾與 AlphaFold 頁
  icons.js                      原創離線 SVG 圖示系統（2,420 個唯一描述）
  help.html terms.html          操作指南、條款與退款
  data/                         catalog、departments、tcm-library、release、courses/<科別>.json
portable/                       Python 伺服器（標準函式庫）
  server.py                     API、靜態檔、帳號、進度、AI 師傅、翻譯
  commerce.py rates.py          通行證、Stripe／ECPay／轉帳、匯率
  otp.py knowledge.py           驗證碼寄送、本地教材與課程檢索
  commerce_admin.py             站長指令（確認轉帳、對帳、撤銷、手動贈送）
tools/                          build_curriculum.py（課程產生器）、curriculum/（主題資料）、check_offline.py、index_documents.py、download_ai_model.py、model-manifest.json
local-documents/  models/       AI 教材與模型權重（不進 Git，由 update-and-upload.sh 同步）
*.sh  run-local.bat  start-mac.command   啟動、安裝模型、索引、重建、打包、上傳、發布
docs/  examples/  tests/        文件、nginx／systemd／.env 範例、測試
```

---

## 3. 語音與語系：是否跟隨觀看者？
* **介面語言**：首次開啟依瀏覽器語言偏好（`navigator.languages`）自動選擇，36 種語言可手動切換並記住。
* **語音朗讀語系**：預設**跟隨介面語言**（即觀看者的瀏覽器語系），**不是依 GPS 或 IP 所在地**；可在個人桌面改為固定語系，並選男聲／女聲、音高、語速、專業／親切／精簡風格。瀏覽器需有對應語音（iOS Safari 需先互動一次）。
* **幣別**：依瀏覽器語言的地區子標籤（如 `ja-JP`→JPY）或時區判斷，再以匯率換算；右上角可改。
* **課程內容語言**：中文與英文為原著核心；其他語言的課程內容在伺服器設定 AI 路線後自動翻譯並快取，否則保留原文。

---

## 4. 會員、付費與結算
* 註冊四項：帳號（4–32 字元）、密碼（≥10 字元含字母與數字）、信箱、手機（含國碼）。伺服器寄出信箱驗證碼與簡訊驗證碼，兩組皆正確才建立帳號並登入（PBKDF2-SHA256、HttpOnly Cookie、同源檢查、速率限制）。
* 每門課第一節免費；其餘章節與實習級需通行證，**不是整個科別免費**。
* 付款流程（`docs/COMMERCE_ZH.md`）：
  1. Stripe Checkout（Visa／Master／JCB／AMEX，`request_three_d_secure=any`）或綠界 ECPay 收銀台（台灣卡）；卡號只在金流商頁面輸入。
  2. 金流商以簽章通知伺服器（Stripe Webhook 簽章／ECPay CheckMacValue），伺服器再**主動向金流商查單**確認後才寫入權限。
  3. 郵局轉帳：學員轉到 **中華郵政 700／局號 0101034／帳號 0187821** 後填寫轉帳時間與末五碼，站長 `python3 -m portable.commerce_admin confirm-transfer 訂單 --reason "..."` 開通。
  4. 刷卡款項由金流商撥款到站長在金流商後台登記的同一郵局帳戶（Stripe 撥款帳戶／綠界撥款帳戶）。

---

## 5. AI 師傅（生成式 AI 回覆學徒問題）
任一路線設定後，AI 師傅會以「目前課程脈絡＋檢索到的課程步驟＋站長索引的本地教材」為依據回答，並標示出處：
```bash
bash install-ai-models.sh --model qwen3-17b --download   # 下載開放權重（SHA-256 校驗、可續傳）
bash run-ai-llamacpp.sh                                  # 本機 llama.cpp（CPU／GPU）
bash run-ai-ollama.sh --download                         # 或 Ollama（qwen3:4b；HT_OLLAMA_MODEL=qwen3:8b 可換）
bash run-ai-cloud.sh                                     # 或 .env 內的 OpenAI／Anthropic／Gemini／OpenAI 相容服務
bash index-documents.sh                                  # 把 local-documents/ 的教材建成索引供引用
```
雲端路線需學員逐次勾選同意；未設定任何路線時面板回傳標示為「非生成式」的教材摘要。詳見 `docs/AI_ROUTES_ZH.md`。

---

## 6. 更新與上傳：`update-and-upload.sh`
一支完整的 bash 檔，執行時把**本地更新的程式**、**新增的教材文件**與**模型／權重**上傳到伺服器或雲端備份：
```bash
bash update-and-upload.sh --ssh deploy@academy.example.org:/srv/huatuo --restart          # 程式＋教材＋模型，完成後重啟服務
bash update-and-upload.sh --ssh deploy@host:/srv/huatuo --only documents --reindex-remote  # 只傳新增教材並在遠端重建索引
bash update-and-upload.sh --remote gdrive:HuaTuoBackup --only models                       # 權重備份到 rclone 遠端
bash update-and-upload.sh --repo git@github.com:me/huatuo.git --pages --message "v1.0.1"   # 推程式碼並發布 GitHub Pages 靜態版
bash update-and-upload.sh --ssh deploy@host:/srv/huatuo --rebuild-curriculum --index-documents --dry-run
```
流程：重建（可選）→ 驗證資料一致性 → 掃描機密 → 逐檔 SHA-256 比對上次狀態，只傳更新與新增 → rsync（續傳、校驗模型雜湊）／rclone／git → 遠端重建索引與重啟（可選）→ 寫入 `UPLOAD_MANIFEST.json` 與 `logs/`。
永不上傳 `.env`、資料庫、`server-secret.txt`、金鑰與未完成的 `.part` 檔；教材與模型不進 Git。

---

## 7. 課程資料與擴充
`tools/curriculum/*.py` 是主題來源（西醫外科 566、西醫內科與基礎 389、中醫 289、生醫 141、諾貝爾 117＋35、研究技術 56、穴位 396、中藥 255、方劑 176、AlphaGo 系列…），`tools/build_curriculum.py` 依主題種類套用步驟範本，並對 14 門旗艦課程（DBS、CABG、PCI、TKA、THA、ACL、腹腔鏡膽囊切除、CPR、插管、白內障超音波乳化、剖腹產、TAVI、針刺得氣、二十七脈）使用手寫核心步驟。新增主題後執行 `bash rebuild-curriculum.sh`。
每一門課程的圖示由（圖形、主色、環、點、翻轉、徽章）六個維度組成，建置時驗證 2,420 個描述互不重複；全部為本專案原創的離線 SVG，不依賴任何線上圖庫。詳見 `docs/CURRICULUM_ZH.md`。

---

## 8. 參考與來源
* 架構藍本：MacGyver Engineering Academy v11（靜態優先、Python 標準函式庫伺服器、課程／步驟資料模型、個人化、語音、金流）。
* 介面參考：聰動成長協會 SmartAction 與 ActionIntelligent-AI（深綠主色、卡片式版面、多語言、免責聲明）。
* 諾貝爾資料：nobelprize.org；2026 年得主依公告整理（生理學或醫學：光遺傳學；化學：不對稱自催化）。
* 中醫：古典原文（《黃帝內經》《傷寒論》《金匱要略》《針灸甲乙經》《溫病條辨》等）、WHO 標準穴位定位、「子子中醫」等公開影片頻道作為延伸學習連結。
* 西醫：各專科學會指引（ACC/AHA、AHA CPR、WHO、ADA…），課程頁「來源」區列出。
* 匯率：open.er-api.com（伺服器每 12 小時更新；內附 2026-10-12 備援表）。

> 本站提供醫學教育資訊，不能取代個別診斷與治療；手術、針灸與處方須在合格醫師監督下學習與執行。授權見 `LICENSES.md`。
