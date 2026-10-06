# ⚾ Scorecard

把 Markdown 速記即時渲染成 **User Story Mapping** 圖形界面。

Scorecard 包含可獨立安裝的 **USM 編寫 Skill** 與 **網頁 viewer**。Skill 讓 AI agent 正確編輯
Markdown；viewer 在 host 上讀寫同一份檔案。Viewer 零相依，只需 Node.js ≥ 18；Skill 本身不需要 Node.js。

## 安裝與開始使用

需要準備兩樣東西：給 agent 使用的 **Skill**，以及在 host 開啟的 **viewer**。
依序完成：**安裝 Skill → 產生 `scorecard.md` → 取得並啟動 viewer**。

下列 `npx` 命令在 **host 的終端機**執行，需先安裝 Node.js/npm 與 Git。
GitHub 來源為 `frontofficebrass/scorecard`；Scorecard 不需要另外發佈到 npm。

### 1. 安裝 Skill

依使用的 agent 展開安裝方法。Skills CLI 會將可編輯的 Skill 檔案複製到專案；
Claude Code 也可透過 Plugin 安裝。相同環境選擇其中一種，避免重複安裝同名 Skill。

<details>
<summary><strong>Codex 與其他 Agents</strong></summary>

進入與 sandbox 共用的專案目錄，使用 [Skills CLI](https://github.com/vercel-labs/skills) 從 GitHub 安裝：

```bash
cd /path/to/your-project
npx skills@latest add frontofficebrass/scorecard --skill scorecard --copy
```

依提示選擇 Codex 或其他 agent；只安裝給 Codex 時，可在命令最後加上 `--agent codex`。
`skills@latest` 指定使用最新版的 Skills CLI；`frontofficebrass/scorecard` 則是 Skill 的 GitHub 來源。

選擇 Codex 時，Skill 會安裝到專案的 `.agents/skills/scorecard/`。
`--copy` 會複製完整 Skill（含 `SKILL.md` 與 `references/`），不依賴 sandbox 外的 symlink 或絕對路徑。
若新安裝的 Skill 尚未出現，重新啟動 agent。

Codex 採用 [Skill 漸進式載入](https://developers.openai.com/codex/skills/)：平時只載入名稱與描述，
符合任務時才讀取 `SKILL.md`，需要寫規格時再讀取 Gherkin 參考文件。

</details>

<details>
<summary><strong>Claude Code</strong></summary>

在 Claude Code 對話中加入本 repo 的 marketplace，再安裝 Plugin：

```text
/plugin marketplace add frontofficebrass/scorecard
/plugin install scorecard@scorecard-marketplace
```

如果希望將可編輯的 Skill 檔案放進專案，也可改在 host 終端機使用 Skills CLI：

```bash
cd /path/to/your-project
npx skills@latest add frontofficebrass/scorecard --skill scorecard --agent claude-code --copy
```

這會安裝到 `.claude/skills/scorecard/`。Plugin 與 Skills CLI 兩種方式擇一即可。

Plugin 另附 `/scorecard [map-file] [port]` viewer 啟動指令，會在 agent 所在環境啟動 server。
採用 host／sandbox 分工時，請依第 3 步在 host 啟動 viewer。

</details>

### 2. 請 agent 產生 scorecard.md

在已安裝 Skill 的 agent 中開啟目標專案，提供產品需求並提出：

> 請使用 Scorecard Skill，根據目前的產品需求建立 scorecard.md，規劃 Activity、Step、MVP 與 Backlog。

Codex 也可以用 `$scorecard` 明確指定 Skill。
**確認專案根目錄已產生 `scorecard.md`，再進行下一步**；viewer 讀取既有的 map 檔，才有故事地圖可以顯示。
Skill 不會自動啟動 viewer。
`features/` 下的規格可以之後再請 agent 補寫；尚無 feature 檔的 story 仍會顯示在故事地圖上。

### 3. 在 host 取得並啟動 viewer

所有 agent 都使用相同的 viewer 啟動方式。在 host 終端機進入已有 `scorecard.md` 的專案根目錄：

```bash
cd /path/to/your-project
npx github:frontofficebrass/scorecard   # 讀取 ./scorecard.md，預設 port 4173

# 或指定 map 與 port：
npx github:frontofficebrass/scorecard my-map.md 8080
```

`npx` 會從 GitHub 取得套件、快取並啟動 viewer，不需要先做全域安裝。
在 host 瀏覽器開啟 `http://127.0.0.1:4173`（自訂 port 時改用對應網址）。
Viewer 僅接受本機存取；寫入 API 要求同來源的 JSON 請求與目前的 map version。
Map 路徑與 `features/` 都以啟動時的工作目錄為準；自訂 map 放在子目錄時，`features/` 仍在專案根目錄。

```text
Agent（sandbox） → scorecard.md / features/ ← viewer（host） ← 瀏覽器
```

Host 與 sandbox 必須讀寫**同一份專案檔案**。使用共用工作目錄時，agent 存檔後 viewer 會讀到變更，
不需要讓 sandbox 啟動 server 或轉發 port。若使用獨立 clone，需先同步檔案，兩份工作目錄不會自動即時連動。

瀏覽器每 1.5 秒偵測 map／feature 檔案狀態並重新渲染；可拖曳卡片調整位置、點兩下切換完成狀態，
結果寫回同一份 Markdown。

<details>
<summary><strong>使用本機副本</strong></summary>

先將 Skill 複製到目標專案，以下以 Codex 為例：

```bash
mkdir -p /path/to/your-project/.agents/skills
cp -R /path/to/scorecard/skills/scorecard /path/to/your-project/.agents/skills/
```

Claude Code 可將目的目錄改成 `.claude/skills/`；若使用 Plugin，則將 marketplace 來源改成 `/path/to/scorecard`。

依第 2 步產生 `scorecard.md` 後，在 host 啟動 viewer：

```bash
cd /path/to/your-project
node /path/to/scorecard/server.js
```

也可先用 `npm install -g /path/to/scorecard` 安裝，再於目標專案執行 `scorecard`。

</details>

## 本 repo 的通用 agent 入口

[AGENTS.md](AGENTS.md) 是精簡的專案入口，只記錄工作分工、需要 USM 時的 Skill 路徑與程式維護指引；
完整格式不放進每次都會讀取的入口文件。[Codex 會探索 AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)，
其他 agent 則依各自的入口支援方式讀取。

- `skills/scorecard/SKILL.md` — 共用的 USM 概念與 Markdown 格式規則。
- `skills/scorecard/references/gherkin.md` — 只有撰寫規格時才讀取。
- `.agents/skills/scorecard` — 指向共用 Skill 的相對 symlink，供 Codex 在本 repo 探索。
- `.claude/skills/scorecard` — 指向同一來源的相對 symlink，供 Claude Code 在本 repo 探索。

在本 repo 工作不必再複製 Skill。使用 Scorecard 的其他專案只需安裝 Skill，不必複製本 repo 的 `AGENTS.md`。
Viewer 操作與安裝說明留在 README，編排 USM 時不需要載入。

## 格式對照（USM 概念 ↔ Markdown）

| USM 概念 | 說明 | Markdown |
| --- | --- | --- |
| **Map title** | 整張 story map 的標題 | `# 標題` |
| **Activity** | Backbone 層級一（大段落，左→右） | `## 標題` |
| **Step** | Backbone 層級二（activity 底下的欄）；可省略 | `### 標題` |
| **Story** | 卡片（`[x]` = 完成） | `- [ ] [[feature-name]]` |
| **Release** | 泳道（列）；此行**以上**的 story 屬於該 release | `<!-- ---- {Release 名稱} -->` |
| **Feature 檔** | wiki-link 連到的 Gherkin 規格 | `features/feature-name.feature` |

```markdown
# 我的 Story Map

## 探索商品

### 搜尋書籍

- [ ] [[search-a]]
- [x] [[search-b|關鍵字搜尋]]
<!-- ---- {MVP} -->
- [ ] [[search-c]]
<!-- ---- {Release 2} -->
```

- 分隔線標示的是它**上方**那一段 story 所屬的 release——就像畫面上泳道名稱貼齊泳道下緣的那條線。
- 沒被分隔線收尾的 story（該 `###` 最後一段）落到自動追加、永遠排在最下面的 **Backlog** 泳道。
- Release 泳道是全圖共用的，同名合併，依首次出現排序；分隔線只作用到該欄結束。Backlog 留給未收尾的 story 自動產生。
- `###` 可以省略：story 直接寫在 `##` 底下時，那些卡片自成一欄接在該 activity 下方，step 卡從缺。
- 點卡片會在側邊欄預覽對應的 feature 檔（`features/<name>.feature`，亦支援 `.md` 與一層子目錄）。
- 還沒有 feature 檔的 story 以灰色虛線顯示，代表「還沒請 AI agent 寫規格」。

## 在畫面上編輯（畫面 → markdown）

| 操作 | 效果 | markdown 改動 |
| --- | --- | --- |
| 拖曳卡片到別格 | 換 release 泳道／step 欄位 | 把那一行搬到目標區段 |
| 卡片上**點兩下** | 標記完成／未完成 | 該行 `- [ ]` ⇄ `- [x]` |
| 點一下卡片 | 預覽 feature 檔 | 不改檔 |

點一下和點兩下共用同一張卡片，所以預覽會延後約 220ms 才打開——這段時間內若來了第二下，
就當成「勾選」而不是「預覽」。

## 拖曳卡片

卡片可以直接用滑鼠拖到任何一格（step 欄 × release 泳道），放開的瞬間 `scorecard.md`
就被改寫，畫面隨即重繪：

- **換 release**：卡片那一行被搬到目標 release 分隔線的上方。目標欄若還沒有這條泳道，
  會依全圖泳道順序補一條 `<!-- ---- {Release 名稱} -->`。
- **換 step**：同樣是搬那一行，只是搬進另一個 `###` 區段。
- **同格內上下拖**：調整 story 在泳道裡的順序（story map 的縱向即優先順序）。
- 拖到卡片**上半部**會插在它上面，下半部則插在下面；藍色細線標示落點。

改寫盡量最小：只有 story 那一行被搬動，list marker、`- [x]`、wiki-link、別名與行尾文字
原樣保留，其他內容（含註解、程式碼區塊）一律不動。被搬空的 release 分隔線會**留在原地**——
它仍宣告該泳道，泳道順序才不會因為一次拖曳而跳動，卡片也拖得回去。

若在編輯期間 `scorecard.md` 被別人（或 agent）改過，該次拖曳／勾選會被拒絕並提示重試，
避免把變更套用到使用者沒看到的版本上。

## 與 AI agent 協作

Skill 以 map 檔為準，每次修改前重讀，保留使用者在 viewer 中調整的順序、泳道與完成狀態。
只有使用者要求修改的部分才變動；補寫 feature 規格不會自動把 story 標記完成。

後續調整地圖時，例如在 Codex 中提出：

> $scorecard 把結帳的優惠券故事放到 Release 2，保留其他卡片的位置與完成狀態。

需要補規格時可以說：

> 讀 scorecard.md，把還沒有 feature 檔的 story 都到 features/ 逐一寫好。

Agent 此時才讀取 Gherkin 參考規則，依 wiki-link 建立 `features/*.feature`。
尚無 feature 檔的卡片會在 viewer 顯示灰色虛線，檔案建立後即可預覽。

## 匯入 to-tickets 本地工作單

支援 [mattpocock/skills 的 to-tickets](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)
產生的 `.scratch/<feature>/issues/<NN>-<slug>.md`。Scorecard 的定位是以 USM 展示 tickets：
Skill 讀取依賴、依使用者旅程分類並安排 Release，GUI 呈現寫好的 map。

可請 agent：

> 使用 Scorecard Skill，把 .scratch/catalog/issues 的 tickets 整理成 scorecard.md，依使用者旅程編排 Activity／Step，考慮 Blocked by 安排 MVP 與後續 Release。

CLI 提供基本轉換，不自行推論 Release。在本 repo 可執行：

```bash
npm run import:tickets -- .scratch/catalog/issues --activity '尋找書籍' --step '搜尋'
```

在其他專案中，安裝 CLI 後使用 `scorecard-import`，或指定本機副本的指令路徑：

```bash
cd /path/to/your-project
node /path/to/scorecard/bin/import-tickets.js .scratch/catalog/issues/01-search.md \
  --activity '尋找書籍' --step '搜尋' --map scorecard.md
```

來源可為一張 ticket 或整個 issues 目錄。Activity／Step 必填，由人或 agent 依旅程分類；
不同分類分次匯入，缺少的欄位會建立。CLI 先把新卡片放進 Backlog，Skill 接續依交付目標與依賴排入 Release。
尚未完成的前置工作應在同一或更早 Release；同一 Release 可以包含有先後依賴的多張 tickets，不必每一層依賴都拆成一個 Release。
匯入只讀寫檔案，不會啟動 server。未指定 map 時依序使用 `scorecard.md`、`usm.md`，都不存在則新建 `scorecard.md`。

- 一張 ticket 對應一張卡，完整內容（包含驗收條件與 Blocked by）存為 `features/ticket-<hash>.md`，可在現有側欄預覽文字。
- 穩定 ID 是 feature 目錄名稱加 ticket 編號；更改標題或檔名 slug 不會新增卡片。改 feature 名稱或編號則視為新 ticket。
- 重新匯入更新副本、卡片標題和完成狀態，保留使用者調整的欄位、Release 與排序。相同內容重匯不改檔案。
- **執行狀態以來源 `**Status:**` 為準**：`done`／`completed`／`closed`／`resolved` 為完成，其餘為未完成。看板雙擊不回寫來源，下次匯入會依來源更新勾選。
- 來源刪除不會自動刪除卡片；匯入副本請勿手改或另建同名 `.feature`。來源保留原樣，沒有遠端 tracker 寫入。

依賴由 Skill 在編排時考慮；GUI 不負責依賴圖、自動判斷可開始工作或派工。目前匯入為手動觸發的單向更新，沒有即時或雙向同步。`ready-for-agent` 不表示沒有阻擋依賴。
匯入的來源、副本與 map 必須位於專案內，路徑不可經過 symlink，map 必須是獨立的 `.md` 檔案。
一般 I/O 失敗會嘗試回復已寫入檔案；程序被強制終止或斷電不保證多檔案交易完整，修復原因後可重新匯入。
本地 ticket 標題需為 `# NN: 標題`，編號與檔名一致，並有 `**Status:**`；卡片標題不接受 `[`、`]`、`|`。
只有 Skill 的環境也可請 agent 依 [匯入規則](skills/scorecard/references/tickets.md) 直接編輯，不必安裝 CLI。

## 完整範例

根目錄的 `scorecard.md` 記錄 Scorecard 自身的功能；書店示範與對應規格位於 `examples/bookstore/`。
在 host 執行下列命令即可預覽有規格連結的範例：

```bash
cd examples/bookstore
node ../../server.js
```

## 開發

```bash
npm test        # parser / writer / tickets / server API 測試（node:test）
```

- `lib/parser.js` — markdown → USM 結構（`activities` / `steps` / `stories` / `releases`）
- `lib/writer.js` — 反向：把畫面上的編輯（`moveStory` / `setStoryDone`）寫回 markdown
- `lib/tickets.js` / `bin/import-tickets.js` — 本地 tickets 匯入、來源識別與原位更新
- `server.js` — 靜態頁 + `/api/map`、`/api/feature`、`/api/move`、`/api/done`；
  以 cwd 解析 map 檔，僅監聽 `127.0.0.1`（本機）
- `public/index.html` — 前端渲染、拖放與勾選（無框架）

兩個寫入端點都要求 `Content-Type: application/json` 與非空的 `version`；缺少版本回 400，版本過期回 409。
請求來自瀏覽器時必須與 viewer 同來源。兩個端點回傳改寫後的完整 map（與 `/api/map` 同格式）：

```jsonc
// POST /api/move —— 拖曳
{
  "version": "…",      // 客戶端當下看到的 /api/map version，不符會回 409
  "line": 13,          // 要搬的 story 在 markdown 中的行號（1-based）
  "toStep": 0,         // 目標欄位：/api/map 中所有 step 攤平後的索引
  "toRelease": "MVP",  // 目標泳道名稱
  "beforeLine": null   // 插在這一行的 story 之上；null = 放在該泳道最後
}

// POST /api/done —— 勾選
{
  "version": "…",
  "line": 13,
  "done": true         // 想要的狀態，不是 toggle：重送同一個請求不會反覆翻面
}
```

Claude Code 相容檔案：

- `.claude-plugin/plugin.json` — Plugin manifest。
- `.claude-plugin/marketplace.json` — marketplace 定義。
- `commands/scorecard.md` — 選用的 viewer 啟動指令，使用 `${CLAUDE_PLUGIN_ROOT}/server.js`。

> `Scorecard` 是工具名稱；文件與 UI 使用 USM 標準術語（Activity／Step／Story／Release）。
> 既有的 `usm.md` 仍可被 server 當作退回檔名讀取。
