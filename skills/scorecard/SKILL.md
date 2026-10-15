---
name: scorecard
description: 依 USM 概念與 Markdown 對照建立、更新 User Story Map（scorecard.md），包含 Activity、Step、Story、Release 與規格連結。用於需求梳理、故事地圖編排、to-tickets 本地工作單匯入及對應的 feature 規格；不負責啟動 viewer。
---

# USM ↔ Markdown

直接編輯使用者指定的 map；未指定時沿用專案既有的 `scorecard.md` 或 `usm.md`，新建則用 `scorecard.md`。
本 Skill 可獨立使用，不需要 viewer、Node.js 或 Plugin。預設由使用者在 host 操作 viewer。

## 概念與格式

依使用者旅程由左到右排列 Activity／Step；Story 描述可交付的使用者行為或價值。
Release 是橫跨旅程的交付切片，由上到下表示交付順序，同格內的 Story 由上到下排列優先序。

| USM 概念 | Markdown |
| --- | --- |
| Map title：整張地圖的標題 | `# 標題` |
| Activity：旅程的大段落 | `## 活動` |
| Step：活動下的步驟，可省略 | `### 步驟` |
| Story：待辦／完成 | `- [ ] [[feature-name]]`／`- [x] [[feature-name]]` |
| Story 別名：顯示名稱與連結目標分開 | `- [ ] [[feature-name\|顯示名稱]]` |
| Ticket／Markdown 文件卡片 | `- [ ] [顯示名稱](.scratch/catalog/issues/01-search.md)` |
| 卡片筆記／附件 | 在卡片下縮排至少兩個空格；可寫多層清單、驗收 checkbox、段落、文件連結與程式碼 |
| Release：收尾上方的一段 Story | `<!-- ---- {MVP} -->` |
| Feature 連結：目標不含副檔名 | `[[feature-name]]` → 專案根目錄的 `features/feature-name.feature` |

- Story 必須在 `##` 下；`###` 也必須在 `##` 下。省略 Step 時，Story 自成無標題的一欄，可接在該 Activity 的具名 Step 之前。
- Release 分隔線收走**同一欄、上一條分隔線之後、這條線之前**的 Story。新增 Story 要放在目標 Release 分隔線的上方。
- 到下一個 `###`、`##` 或檔案結尾，未被收尾的 Story 進入 **Backlog**。讓 Backlog 自動產生，不另寫 `{Backlog}` 分隔線，以保持它在最下方。
- Release 名稱全圖共用，依首次出現排序；每個欄位都要各自收尾。空分隔線仍宣告泳道及順序，編輯時保留。
- 未縮排的 checkbox 首行建立一張卡片；接續縮排至少兩個空格（或 tab）的內容屬於該卡片，縮排 checkbox 不另建 stories。內部空白行可保留；下一個未縮排內容結束卡片區塊。移動卡片時連同整個區塊搬動。標題、Story 首行、分隔線均不縮排；分隔線獨占一行。實際 map 不要包在程式碼區塊中，區塊內容會被忽略。
- 沒有規格連結時可用 `- [ ] 純文字故事`；有連結時保留目標的大小寫與空格，用 `|` 後的別名改顯示文字。Feature 檔可稍後補寫。
- 標準 Markdown 文件連結相對於 map 所在目錄；例如 `maps/product.md` 連根目錄 ticket 時用 `../.scratch/catalog/issues/01-search.md`。wiki-link 仍相對於專案根目錄的 `features/`。文件必須位於專案內。
- 同一卡片可引用多張 tickets／Markdown 文件與多份 feature，來源可放首行或縮排內文；viewer 依筆記、tickets／文件、feature 分區全部展開。只展開卡片直接引用的文件，不遞迴載入文件內的引用。來源缺失不妨礙其他內容預覽。

## 範例

```markdown
# 線上書店

## 探索商品
### 搜尋書籍
- [ ] [[search-by-keyword|關鍵字搜尋]]
  - [ ] 搜尋結果符合輸入的關鍵字
  - [搜尋工作單](.scratch/catalog/issues/01-search.md)
<!-- ---- {MVP} -->
- [ ] [[filter-by-author|依作者篩選]]
<!-- ---- {Release 2} -->
- [ ] [[saved-search|儲存搜尋]]

### 查看詳情
- [x] [[view-book-detail|查看書籍詳情]]
<!-- ---- {MVP} -->

## 購買
- [ ] [[checkout|結帳]]
<!-- ---- {MVP} -->
```

`saved-search` 屬於 Backlog；`購買` 省略 Step，但仍有自己的 MVP 收尾線。

## 編輯與檢查

- 動手前重讀 map，使用者可能透過其他工具同步修改。以最新內容做局部修改，保留無關文字、勾選狀態、順序與 Release 歸屬；依使用者要求調整相關部分。
- 新建時依已知需求排骨架，只有缺少會影響編排的資訊才詢問。不要把補寫規格當作 Story 已完成的依據。
- 只有需要撰寫或更新對應規格時，讀取 [Gherkin 規格規則](references/gherkin.md)。單純編排 USM 不必載入。
- 寫完後逐欄核對 Activity／Step、Story 連結、Release 收尾範圍與 Backlog 歸屬；檢查不依賴 localhost 或執行中的 viewer。

## 匯入本地 tickets

將 `to-tickets` 的本地工作單接入看板時，讀取 [ticket 匯入規則](references/tickets.md)。以來源 ticket 管理內容和執行狀態，Skill 依使用者旅程分類，並讀取 Blocked by 規劃可交付的 Release，寫入 map 供 GUI 展示。CLI 是轉換工具，新增卡片進 Backlog 不代表完成 Release 規劃；首次整理應接續編排。一般重新匯入保留既有排列，更新這些卡片的標題與完成狀態。
