# 整合包 v3.7：雲端操作

日常上傳只需在完整整合包內執行：

```bash
bash upload.sh
```

先看差異則加`--dry-run`；模型ZIP位置不同則加`--model-archives "/模型ZIP資料夾"`。有提供四份模型包時自動還原；網站差異發布、既有完整模型分塊同步都由同一入口執行。本機沒有模型時可只更新網站，保留私有庫原有模型。完整最短步驟見根目錄`README.md`。

## 私有模型的使用

公開頁面不能直接執行CPU模型，也不能將GitHub私人憑證放入瀏覽器。請在自己的後端部署完整本包，使用SSH唯讀deploy key取得私人模型；登入與生成式AI都在同一個HTTPS後端內執行。

自己電腦測試（先完成模型上傳）：

```bash
bash huatuo-private-ai.sh --setup-runtime --tts --local
```

正式後端首次使用：

```bash
bash huatuo-private-ai.sh \
  --ssh-key "$HOME/.ssh/huatuo_models_readonly" \
  --setup-runtime --tts \
  --backend-url https://academy.example.org
```

`academy.example.org`須換成自己已設定DNS與HTTPS反向代理的網域；範例代理見`examples/nginx-huatuo-private-ai.conf`。此腳本不會替您購買伺服器、註冊網域或設定DNS。唯讀key的公鑰加入私人庫`Settings → Deploy keys`，不要勾寫入權限；私鑰留在後端專案外。

後端可用後，再從本機更新公開入口：

```bash
bash upload.sh --backend-url https://academy.example.org
```

網站AI／會員入口將前往完整後端，模型權重不會傳到訪客瀏覽器。未配置後端網址的公開頁面只提供免費靜態預覽。後續後端更新可省略`--setup-runtime`。

## 進階入口

`huatuo-sync.sh`是內部差異同步器；已準備完整模型時可獨立執行`--public-only`或`--models-only`。一般使用者請使用`upload.sh`，以免漏掉模型匯入步驟。

模型庫必須維持Private。若GitHub API限流，請在GitHub確認私人庫仍為Private後才使用`--private-visibility-confirmed`；程式不會略過已確認為Public的情況。個別模型本機缺少時，同步器保留原有雲端模型，不做整庫鏡像刪除。

官方參考：
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
