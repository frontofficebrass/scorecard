---
description: ⚾ 啟動 scorecard viewer，把當前專案的 markdown（scorecard.md）渲染成 User Story Map
argument-hint: "[map-file] [port]"
allowed-tools: Bash, Read
---

啟動 scorecard viewer，服務**當前工作目錄**的 User Story Map。

參數 `$ARGUMENTS`：第一個是 map 檔（預設 `scorecard.md`），第二個是 port（預設 `4173`）。

若目前在 sandbox，先請使用者在 host 啟動，不執行下面的背景啟動步驟。Host 環境請照以下步驟做：

1. 先解析 map 與 port（下文 `<port>` 代入實際數字），再確認 viewer 是否已在該 port 上跑：`curl -s -m 2 127.0.0.1:<port>/api/map -o /dev/null -w '%{http_code}'`。
   若回 200，代表已在運行，直接告訴使用者網址即可，不要重複啟動。
2. 若尚未運行，在**當前目錄**背景啟動 plugin 內建的 server（不需要全域安裝）：
   ```bash
   nohup node "${CLAUDE_PLUGIN_ROOT}/server.js" "<map-file>" "<port>" > /tmp/scorecard.log 2>&1 &
   ```
   server 以當前工作目錄解析 `scorecard.md` 與 `features/`，僅監聽 `127.0.0.1`。
3. 啟動後再 `curl` 一次 `/api/map` 確認回 200，並給使用者摘要：
   幾個 **Activity（`##`）**、**Step（`###`）**、**Release 泳道**；
   一併提醒卡片可以直接用滑鼠拖到別的 release／step、點兩下標記完成，`scorecard.md` 會同步改寫。
若當前目錄沒有 `scorecard.md`，先問使用者這張 story map 的主題，再依 scorecard skill 的格式排出骨架後才啟動。
