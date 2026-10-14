# models/ — 本機生成式 AI 權重

`bash install-ai-models.sh` 列出開放權重模型；加上 `--model qwen3-17b --download` 才會下載（SHA-256 校驗、可續傳）。
`bash run-ai-llamacpp.sh` 以 llama.cpp 載入此資料夾的 GGUF；`bash run-ai-ollama.sh` 改用 Ollama。
此資料夾不進 Git；`update-and-upload.sh --only models` 會把校驗完成的權重同步到伺服器或雲端備份（排除 *.part）。
