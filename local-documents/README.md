# local-documents/ — AI 師傅的本地教材

把講義、指引、經典原文、教科書 PDF（有文字層）、DOCX、PPTX、TXT、MD、CSV、JSON 放在這裡，然後執行：

```bash
bash index-documents.sh            # 產生 portable/data/knowledge.json
```

AI 師傅回答學徒問題時會檢索相符段落並標示「檔名 · 頁碼」。此資料夾不會進入 Git；
`update-and-upload.sh` 會把新增的教材同步到伺服器（`--only documents --reindex-remote`）。
PDF 需安裝 `python3 -m pip install -r requirements-documents.txt`；掃描檔請先 OCR。
請確認教材有再散布權限；付費章節的私有教材只會提供給有通行證的會員。
