# 授權 · Licenses

## 本專案程式碼與課程文字
MIT License — Copyright (c) 2026 Hua Tuo Medical & Biomedical Academy contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

* 課程步驟、摘要與測驗為教育性拆解；引用的指引、經典與公開資料之著作權屬原作者，課程頁「來源」區列出。
* `public/academy/icons.js` 的圖示系統為本專案原創 SVG，隨程式以 MIT 授權。
* 架構參考 MacGyver Engineering Academy v12（同作者提供的原始碼）。

## 第三方
* 無任何第三方 JavaScript／CSS／字型／圖庫被打包；前端只使用瀏覽器內建 API（Web Speech、Canvas、Intl、Service Worker）。
* Python 伺服器只用標準函式庫；`requirements-documents.txt` 的 pypdf（BSD）僅在匯入 PDF 教材時選用。
* 匯率資料：open.er-api.com（免費版，依其條款註明來源）。
* 另包模型：Qwen3官方GGUF（Apache-2.0）；模型包保留官方LICENSE。Kokoro v1.1中文／英文ONNX模型（Apache-2.0）、sherpa-onnx（Apache-2.0）及相關聲音資產的模型卡、LICENSE／NOTICE隨語音包保留。
* 語音資產包含eSpeak-NG資料，保留其GPL授權副本（ESPEAK_COPYING）；對應原始資料與建置來源：https://github.com/espeak-ng/espeak-ng 。Kokoro模型來源：https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh ；CPU資產發行來源：https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models 。
* 選用依賴由安裝器取得，保留其各自授權；不將第三方軟體改標為本專案MIT授權。
* 金流：Stripe、綠界 ECPay 依各自商家合約。

## 免責
本站提供醫學教育資訊，不能取代個別診斷與治療；手術、針灸、推拿與處方須在合格醫師監督下學習與執行。
