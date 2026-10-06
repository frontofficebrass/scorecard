# 匯入 to-tickets 本地工作單

讀取 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`。一檔一張 ticket，格式如下：

```markdown
# 01: 以關鍵字搜尋書籍

**What to build:** 使用者輸入關鍵字後看到符合的書籍。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 搜尋結果符合輸入的關鍵字
```

## 依旅程與依賴編排 Release

先讀取 tickets 與既有 map，依使用者旅程指定 Activity／Step。同一批 tickets 可分屬不同欄，分批或逐檔匯入；編號和 Blocked by 是實作依賴，不是旅程順序。技術重構可放進相關技術工作欄，不強行描述成使用者操作。GUI 負責展示 map；依賴的理解與 Release 規劃由 Skill 在寫檔時完成。

- 讀取每張 ticket 的 What to build、驗收條件和 Blocked by，依編號／標題解析實際引用；追查相關前置 tickets，不能把未讀取或缺失的依賴當成已完成。
- 優先沿用使用者的交付目標與既有 Release；沒有規劃時，依已知需求提出並寫入合理的 MVP／後續 Release，簡述切分依據與假設。MVP 應能完成一段有價值的使用者流程，不只是收集沒有 blockers 的 tickets。
- 尚未完成的前置工作必須排在依賴它的 ticket **同一個或更早的 Release**。可在同一 Release 內先做前置工作，不必每一層依賴都新增一個 Release。已完成的前置工作不必為此搬動。
- 欄位順序仍依使用者旅程。相同欄位與 Release 中，可將前置 ticket 排在依賴它的 ticket 上方；跨欄的執行先後保留在 ticket 的 Blocked by，不能為了表達依賴而打亂旅程。
- 尚未排程的範圍留在 Backlog。缺失、歧義或循環依賴需明確指出，受影響的新卡先留 Backlog，繼續編排可確定的部分；不要擅自改寫來源依賴或宣稱相關 Release 已可交付。
- 首次匯入後，將新卡依規劃移到各欄對應的 Release 分隔線上方。一般重匯保留人工排列；若新依賴與既有 Release 衝突，說明衝突及建議調整。使用者要求重排 Release 時才調整既有規劃。

例如：01「搜尋」無依賴，02「篩選」依賴 01，03「儲存搜尋」依賴 02。若首版目標是找到符合條件的書，可把 01、02 一起排 MVP，03 排 R2；不必拆成三個 Release。若既有 map 把 02 排 MVP、尚未完成的 01 留在 R2，應指出這個交付衝突。

完成後核對每個已排程 ticket 的前置工作皆已完成或在同一／更早 Release，並檢查各欄分隔線是否收走正確的 stories。這是編排時的檢查，GUI 不持續計算「可開始」或派工。

## 使用匯入指令

有安裝 Scorecard CLI 時，在目標專案根目錄執行：

```bash
scorecard-import .scratch/catalog/issues/01-search.md --activity '尋找書籍' --step '搜尋'
# 同一欄的整批 tickets：
scorecard-import .scratch/catalog/issues --activity '尋找書籍' --step '搜尋'
```

可用 `--map maps/product.md` 指定 map；預設沿用 `scorecard.md`，其次 `usm.md`。`features/` 仍在工作目錄根部。此指令只寫檔，不會啟動 viewer。CLI 將新卡放入 Backlog；執行後，Skill 仍需依前述規則完成 Release 編排。

指令使用 `<feature-slug>/<去除前導零的編號>` 作為穩定 ID；例如 `catalog/1`。wiki-link 為 `ticket-` 加上 ID 的 SHA-256 十六進位雜湊前 24 字元。標題或檔名 slug 更名仍是同一張卡，feature 目錄或編號改變則是新 ID。

匯入到 `features/<wiki-link>.md`，首行是 `<!-- scorecard-ticket: <encodeURIComponent(ID)> -->`，接著保留 Source 路徑、Ticket-ID 與完整來源內容。不要另建同名 `.feature`，它會遮蔽 `.md`。這些文件是匯入副本，請修改來源後重匯。

## 再次匯入

- 以穩定 wiki-link 找既有卡片，只更新標題和完成勾選；保留欄位、Release、排序和其他卡片。
- 來源 Status 為 `done`、`completed`、`closed`、`resolved`（不區分大小寫）時勾選，其餘為未完成。驗收條件勾選不代替 Status。
- Viewer 的勾選只改 map，不回寫 ticket；下次匯入會恢復來源狀態。要持續保存完成狀態，修改來源 Status 再匯入。
- 移除來源檔不自動刪卡或刪規格，保留歷史；需要移除時依使用者要求處理。
- Blocked by 原文保留，供 Skill 編排 Release 與讀者查閱；GUI 不計算「可開始」，也不自動安排執行工作。`ready-for-agent` 不代表沒有 blockers。

## 只有 Skill、沒有 CLI 時

Skill 可獨立使用，不要求安裝 Node.js。依上面的 ID 與文件規則，使用環境可用的 SHA-256 工具取得 wiki-link，直接編輯 map 和副本即可；套用相同的重匯規則，每次寫入前重讀，拒絕覆蓋沒有相符來源標記的同名文件。不要把 ticket 驗收 checkbox 逐項匯入為 stories，整張 ticket 才是一張卡。
