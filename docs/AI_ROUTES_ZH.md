# AI 師傅：生成式 AI 路線與本地教材（docs/AI_ROUTES_ZH.md）

AI 師傅（`POST /api/tutor`）以三層資料回答學徒的問題，並要求模型標示出處與臨床限制：
1. **目前課程脈絡**：學員正在看的課程與步驟（由前端 `course-player.contextText()` 送出）。
2. **課程檢索**：`portable/knowledge.py` 的 `CurriculumIndex` 以 IDF 加權的中英關鍵字（含中文二字組）搜尋 2,420 門課程的標題、摘要與步驟，例如「LI4」「CABG」「四君子湯」會直接命中對應課程。
3. **本地教材**：`bash index-documents.sh` 把 `local-documents/` 的 PDF／DOCX／PPTX／TXT／MD／CSV／JSON 切成段落存成 `portable/data/knowledge.json`；回答時引用「檔名 · 頁碼」。預設只有持通行證的會員能檢索（`DOCUMENTS_FOR_ALL=1` 可開放給所有登入者）。

沒有任何路線時，面板回傳標示為「非生成式」的教材摘要（仍含上述檢索）。

## 路線一覽（`.env`）
| 路線 id | 設定 | 說明 |
|---|---|---|
| `default` | `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`（可加 `AI_LABEL`） | 任何 OpenAI 相容 `/v1/chat/completions`：本機 llama.cpp、LM Studio、vLLM、Groq、OpenRouter、DeepSeek… 本機位址視為「本機路線」不需同意 |
| `ollama` | `OLLAMA_BASE_URL`（僅限 127.0.0.1）、`OLLAMA_TEXT_MODEL` | Ollama 原生 `/api/chat`，關閉長思考 |
| `openai` | `OPENAI_API_KEY`、`OPENAI_MODEL`（預設 gpt-4.1-mini） | 雲端，需同意 |
| `anthropic` | `ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`（預設 claude-sonnet-5-5） | 雲端，需同意 |
| `gemini` | `GEMINI_API_KEY`、`GEMINI_MODEL`（預設 gemini-2.5-flash） | 雲端，需同意 |

多條路線同時設定時，面板出現下拉選單；雲端路線每次提問都要勾選「同意將問題與課程脈絡送至雲端 AI」。每帳號每小時 `AI_HOURLY_LIMIT`（預設 60）次。

## 本機模型（不需金鑰、資料不離開電腦）
```bash
bash install-ai-models.sh                                  # 只列出
bash install-ai-models.sh --model qwen3-17b --download     # 下載 Qwen3 1.7B Q8_0（1.83 GB，SHA-256 校驗，可續傳）
bash run-ai-llamacpp.sh                                    # 需要 llama.cpp 的 llama-server（macOS: brew install llama.cpp；
                                                           # Linux/Windows: https://github.com/ggml-org/llama.cpp/releases）
HT_GGUF=models/其他.gguf HT_CPU_THREADS=12 HT_GPU_LAYERS=20 bash run-ai-llamacpp.sh   # 自訂模型／執行緒／GPU 層數
bash run-ai-ollama.sh --download                           # 或 Ollama：qwen3:4b；HT_OLLAMA_MODEL=qwen3:8b 品質更好
```
`tools/model-manifest.json` 列出模型、授權與雜湊。CPU 推論 1.7B 約需數十秒，4B 以上建議 GPU 或 16 GB 以上記憶體。

## 雲端模型
```bash
cp .env.example .env    # 填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY 或 GEMINI_API_KEY（可同時）
bash run-ai-cloud.sh
```

## 內容翻譯
`POST /api/translate` 使用同一條路線，把非中英文介面語言的課程文字（標題、步驟）批次翻譯並在瀏覽器快取 2,500 筆；未設定路線時保留原文。

## 教材上傳流程（站長）
1. 把新教材放進本機 `local-documents/`。
2. `bash update-and-upload.sh --ssh user@host:/srv/huatuo --only documents --reindex-remote` → 只傳新增／更新的檔案並在遠端重建索引。
3. 新權重：`bash update-and-upload.sh --ssh … --only models`（rsync 續傳＋遠端 sha256 校驗），遠端以 `run-ai-llamacpp.sh` 重新啟動。

## 安全與隱私
* 系統提示（`portable/server.py` 的 `POLICY`）要求：只依教材回答、不捏造劑量與引用、提醒合格醫師監督、緊急狀況轉介急救、拒絕危險請求。
* 提問、課程脈絡與教材段落都當作「不可信資料」送入模型；伺服器日誌不記錄問答內容。
* 金鑰只放在根目錄 `.env`，`update-and-upload.sh` 與 `publish-github.sh` 都會拒絕上傳。
