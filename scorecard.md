# ⚾ Scorecard Story Map
<!--
  格式：# 地圖標題 · ## Activity（backbone 層級一）· ### Step（backbone 層級二）
  · story 卡片寫成 markdown checkbox（打 x 表示完成）
  · release 泳道分隔線寫成 HTML 註解，內含大括號包住的泳道名稱
  · 分隔線「以上」的 story 屬於該 release；沒被分隔線收尾的落到最下面的 Backlog
  · wiki-link → features/*.feature（Gherkin 規格）

  這張 map 描述的就是 Scorecard 這個工具本身：
  [x] = 已實作（見 README「開發」章節的檔案對照）
  [ ] = 還沒做

  泳道由上而下＝由核心到後來才長出來的能力：
    MVP 先讓 markdown 變成看得到的看板 → R2 把卡片接上 Gherkin 規格
    → R3 讓圖反過來改得動 markdown → R4 打包成別的專案／agent 用得到的形式
    → R5 已經看得到形狀的下一步 → Backlog 還沒排進來的想法
-->

<!-- 泳道順序由「首次出現」決定，所以在這裡先宣告一次；不在任何 ### 內的分隔線不會收走任何卡片。 -->
<!-- ---- {MVP · markdown 變看板} -->
<!-- ---- {R2 · 規格連得到} -->
<!-- ---- {R3 · 圖上改得動} -->
<!-- ---- {R4 · 帶到別的專案} -->
<!-- ---- {R5 · 下一步} -->

## 取得與啟動

### 安裝

- [x] [[zero-dependency|零相依，只需 Node.js ≥ 18]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[install-global-cli|全域 CLI（npm install -g）]]
- [x] [[install-as-plugin|安裝為 Claude Code plugin]]
<!-- ---- {R4 · 帶到別的專案} -->

### 啟動 viewer

- [x] [[resolve-map-from-cwd|以 cwd 解析 map 檔與 features/]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[slash-command-scorecard|/scorecard 指令啟動]]
- [x] [[dual-stack-binding|綁 :: 讓 sandbox 也能發布 port]]
- [x] [[legacy-usm-filename|退回讀取舊檔名 usm.md]]
<!-- ---- {R4 · 帶到別的專案} -->
- [ ] [[open-browser-on-start|啟動後自動開瀏覽器]]
<!-- ---- {R5 · 下一步} -->

## 撰寫 story map（markdown → 圖）

### 排出 backbone

- [x] [[parse-map-title|解析地圖標題]]
- [x] [[parse-activity|解析 Activity]]
- [x] [[parse-step|解析 Step]]
- [x] [[parse-story-card|解析 story 卡片與完成狀態]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[optional-step|省略 Step，story 直接掛在 Activity 下]]
<!-- ---- {R2 · 規格連得到} -->

### 切 release 泳道

- [x] [[release-separator|分隔線收走它上方的 story]]
- [x] [[release-lane-order|泳道全圖共用，依首次出現排序、同名合併]]
- [x] [[default-backlog-lane|未收尾的 story 落到 Backlog]]
<!-- ---- {MVP · markdown 變看板} -->

### 連結規格

- [x] [[wikilink-to-feature|wiki-link 指向 features/ 的 Gherkin 檔]]
- [x] [[feature-file-lookup|支援 .feature/.md 與一層子目錄]]
- [x] [[wikilink-alias|wiki-link 顯示別名]]
<!-- ---- {R2 · 規格連得到} -->

## 檢視看板

### 渲染

- [x] [[render-board-grid|Step 欄 × Release 泳道的看板]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[missing-feature-card-style|沒有規格的卡片以灰色虛線標示]]
- [x] [[show-parse-warnings|顯示解析警告（孤兒 story 等）]]
<!-- ---- {R2 · 規格連得到} -->

### 預覽規格

- [x] [[preview-feature-drawer|點卡片在側邊欄預覽 feature 檔]]
- [x] [[gherkin-highlight|Gherkin 語法上色]]
- [x] [[close-drawer-with-esc|Esc 關閉預覽]]
<!-- ---- {R2 · 規格連得到} -->

### 即時同步

- [x] [[poll-live-reload|每 1.5 秒偵測變動並重繪]]
- [x] [[map-version-hash|以 version 雜湊判斷是否需要重繪]]
<!-- ---- {R2 · 規格連得到} -->
- [x] [[pause-reload-while-dragging|拖曳中暫停重繪]]
<!-- ---- {R3 · 圖上改得動} -->

## 在畫面上編輯（圖 → markdown）

### 拖曳卡片

- [x] [[drag-change-release|拖曳換 release 泳道]]
- [x] [[drag-change-step|拖曳換 step 欄位]]
- [x] [[drag-reorder-within-cell|同格內上下調整優先順序]]
- [x] [[drop-indicator|藍線標示落點]]
- [x] [[create-missing-lane-on-drop|目標欄缺泳道時自動補分隔線]]
<!-- ---- {R3 · 圖上改得動} -->

### 勾選完成

- [x] [[dblclick-toggle-done|點兩下切換完成狀態]]
- [x] [[click-vs-dblclick-delay|延後 220ms 區分預覽與勾選]]
<!-- ---- {R3 · 圖上改得動} -->

### 安全改寫

- [x] [[minimal-rewrite|只搬 story 那一行，其餘原樣保留]]
- [x] [[keep-emptied-separator|被搬空的分隔線留在原地]]
- [x] [[reject-stale-version|檔案被改過就拒絕該次編輯（409）]]
<!-- ---- {R3 · 圖上改得動} -->
- [ ] [[edit-backbone-in-ui|在畫面上新增／改名 activity 與 step]]
- [ ] [[manage-releases-in-ui|在畫面上新增／改名 release 泳道]]
<!-- ---- {R5 · 下一步} -->
- [ ] [[undo-last-edit|復原上一次拖曳／勾選]]

## 與 AI agent 協作

### 教會 agent 這套格式

- [x] [[scorecard-skill|scorecard skill 定義格式與協作紀律]]
- [x] [[agent-edit-discipline|要求 agent 每次編輯前重讀檔案]]
- [x] [[plugin-marketplace|以 plugin + marketplace 散佈]]
<!-- ---- {R4 · 帶到別的專案} -->

### 由 agent 產出規格

- [x] [[agent-writes-gherkin|依 wiki-link 建立 features/*.feature]]
- [x] [[gherkin-zh-tw|繁體中文專案採 zh-TW 關鍵字]]
- [x] [[agent-syncs-done-state|完成時把卡片回寫成已完成]]
<!-- ---- {R4 · 帶到別的專案} -->
- [ ] [[bulk-generate-missing-features|一鍵補齊所有缺少的 feature 檔]]

## 開發與維護

### 對外介面

- [x] [[api-map|GET /api/map：解析後的 story map]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[api-feature|GET /api/feature：feature 檔內容]]
<!-- ---- {R2 · 規格連得到} -->
- [x] [[api-move|POST /api/move：拖曳改寫]]
- [x] [[api-done|POST /api/done：勾選改寫]]
<!-- ---- {R3 · 圖上改得動} -->

### 品質

- [x] [[parser-unit-tests|parser 單元測試]]
<!-- ---- {MVP · markdown 變看板} -->
- [x] [[writer-unit-tests|writer 單元測試]]
<!-- ---- {R3 · 圖上改得動} -->
- [ ] [[server-api-tests|server 端點測試]]
<!-- ---- {R5 · 下一步} -->
- [ ] [[browser-e2e-tests|拖曳／勾選的端對端測試]]
