# 課程資料模型與擴充（docs/CURRICULUM_ZH.md）

## 1. 數量
| 學院 | 科別 | 主題 |
|---|---|---|
| 西醫臨床與手術 | 43 科（神經外科、神經內科、心臟內外科、血管、胸腔、骨科、關節重建、脊椎、一般外科、泌尿、耳鼻喉、眼科、整形燒傷、產科、婦科與生殖、小兒外科、麻醉、疼痛、牙科口腔顎面、急診、重症、消化肝膽、胸腔內科、腎臟、內分泌、風濕免疫、血液、腫瘤、放射腫瘤、感染、皮膚、精神、小兒新生兒、復健、老年家醫、影像核醫、病理檢驗、護理、藥理、公衛、醫學遺傳、基礎醫學） | 955 |
| 中醫藥、針灸與推拿 | 15 科（基礎理論、經典與名醫、四診、針灸技術、灸罐刮痧外治、推拿、泰式按摩、氣功導引、內科病症、婦兒皮傷五官、食療、實習門診、穴位 396、中藥 255、方劑 176） | 1,116 |
| 生醫創新與基因 | 基因體學、基因編輯與細胞治療、免疫治療與疫苗、生醫工程、神經科技與腦機介面、再生醫學、臨床研究方法 | 116 |
| 醫學 AI | AlphaGo→AlphaZero→MuZero→AlphaFold 1/2/3、AlphaMissense、AlphaProteo、醫學影像 AI、大型語言模型於醫療 | 25 |
| 諾貝爾與研究技術 | 生理學或醫學獎 1901–2026（117）、生醫相關化學獎（35）、研究技術（56：PCR、CRISPR、cryo-EM、單細胞定序、光遺傳學、類器官…） | 208 |
| **合計** | **69 科** | **2,420 門、17,180 步** |

主題種類（kind）：concept 455、acupoint 396、procedure 300、herb 255、skill 214、formula 176、technique 161、prize 153、research 97、syndrome 64、manual 40、device 25、classic 24、ai 23、test 21、case 16。

## 2. 檔案
* `tools/curriculum/western_surgery.py`、`western_medicine.py`、`tcm.py`、`biomed.py`、`nobel.py`、`acupoints.py`、`herbs.py`、`formulas.py`：主題來源，用 `T(suffix, zh, en, kind, focus_zh, focus_en, **extra)` 與 `D(dep_id, zh, en, faculty, glyph, accent, intro_zh, intro_en, topics)` 描述。
* `tools/curriculum/authored.py`：14 門旗艦課程的手寫核心步驟（`CORE_STEPS[topic_id]`，每步 12 欄位＋知識點）。
* `tools/build_curriculum.py`：依 kind 套用步驟範本（手術：適應症→術前→麻醉擺位→步驟→併發症→術後；穴位：經絡→定位→針法→主治→配穴→禁忌；方劑：出處→組成→方義→主治→加減→禁忌…），產生測驗、圖示描述、目錄與 release 統計。
* 輸出：`public/academy/data/catalog.json`（目錄）、`departments.json`、`tcm-library.json`、`release.json`、`catalog-index.csv`、`courses/<科別>.json` 與 `.js` 包裝（供 file:// 使用）。

## 3. 課程 JSON 結構
```json
{"id":"neurosurgery-dbs","title":"深部腦刺激手術（DBS）","titleEn":"Deep brain stimulation (DBS)","department":"neurosurgery","kind":"procedure","tiers":["basic","intern"],
 "stages":[{"id":"…-s1","order":1,"title":"第一節 · …（免費試學）","free":true,"steps":[
   {"id":"…-s1-1","order":1,"title":"…","titleEn":"…","objective":"…","instruction":"…","observation":"…","failure":"…","check":"…",
    "knowledge":[{"title":"…","text":"…"}],"quiz":{"question":"…","options":["…"],"answer":0,"explanation":"…"}}]}],
 "sources":[{"title":"…","url":"…"}]}
```
每個欄位都有 `…En` 英文版；第一節 `free:true`，其餘 `false`。

## 4. 新增一門課程
1. 在對應學院檔案的科別 `topics` 內加入 `T("my-topic", "中文名", "English name", "procedure", "中文重點", "English focus")`。
2. （選）在 `authored.py` 的 `CORE_STEPS["<科別>-my-topic"]` 寫入手寫步驟。
3. `bash rebuild-curriculum.sh` → 重新產生資料並以 `tools/check_offline.py` 驗證（≥2000 門、圖示唯一、第一節免費、步驟欄位齊全）。
4. `bash update-and-upload.sh --ssh … --only code` 上傳。

## 5. 圖示系統
`public/academy/icons.js` 提供 70 餘個原創單線圖形（聽診器、腦、神經元、心臟、血管、肺、骨、關節、脊椎、手術刀、腎、肝、胃、眼、耳、鼻、喉、牙、皮膚、手、胎兒、子宮、嬰兒、口罩、救護車、監視器、血液、輻射、病毒、顯微鏡、藥丸、DNA、陰陽、卷軸、舌、針、艾灸、蓮花、太極、藥鼎、草藥（葉／根／子／花／礦／動物／皮）、碗、圍棋盤、CRISPR、抗體、腦機介面、燒瓶、獎牌、滴管…）。建置時每門課程得到 `{g 圖形, a 主色, s 環樣式 0–8, d 點樣式 0–6, f 翻轉, b 徽章}` 描述，`IconRegistry` 保證 2,420 個描述互不重複；首頁背景以此輪播。全部離線 SVG，未使用任何線上圖庫（建置環境無法連線 Iconify／CDN，且離線版本不應依賴外部資源）。

## 6. 來源政策
每門課程的 `sources` 列出該科別的權威來源（學會指引、WHO、nobelprize.org、經典原文、公開影片頻道）。課程文字是教育性拆解，不是臨床協定；`release.json` 的 `curriculumScope` 聲明此限制。
