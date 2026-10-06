---
description: ⚾ 啟動 scorecard viewer，把當前專案的 markdown（scorecard.md）渲染成 User Story Map
argument-hint: "[map-file] [port]"
allowed-tools: Bash, Read
---

啟動 scorecard viewer，服務**當前工作目錄**的 User Story Map。

參數 `$ARGUMENTS`：第一個是 map 檔（預設 `scorecard.md`），第二個是 port（預設 `4173`）。

請照以下步驟做：

1. 先確認 viewer 是否已在該 port 上跑：`curl -s -m 2 localhost:4173/api/map -o /dev/null -w '%{http_code}'`。
   若回 200，代表已在運行，直接告訴使用者網址即可，不要重複啟動。
2. 若尚未運行，在**當前目錄**背景啟動 plugin 內建的 server（不需要全域安裝）：
   ```bash
   nohup node "${CLAUDE_PLUGIN_ROOT}/server.js" ${ARGUMENTS:-scorecard.md 4173} > /tmp/scorecard.log 2>&1 &
   ```
   server 以當前工作目錄解析 `scorecard.md` 與 `features/`，並綁在 `::`（dual-stack）。
3. 啟動後再 `curl` 一次 `/api/map` 確認回 200，並給使用者摘要：
   幾個 **Activity（`##`）**、**Step（`###`）**、**Release 泳道**；
   一併提醒卡片可以直接用滑鼠拖到別的 release／step、點兩下標記完成，`scorecard.md` 會同步改寫。
4. 若在 sandbox 環境（`$SANDBOX_VM_ID` 有值），提醒使用者需在 **host** 執行
   `sbx ports $SANDBOX_VM_ID --publish <port>:<port>/tcp`，才能用瀏覽器開 `http://localhost:<port>`。

若當前目錄沒有 `scorecard.md`，先問使用者這張 story map 的主題，再依 scorecard skill 的格式排出骨架後才啟動。
