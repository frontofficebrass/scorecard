# Scorecard

- 本專案以 Markdown 儲存 User Story Map，viewer 與 agent 共用檔案。
- 建立或修改 USM 時，讀取 [scorecard Skill](skills/scorecard/SKILL.md)；其他任務不必載入。
- 預設由使用者在 host 啟動 viewer；agent 負責編輯 map 與相關規格，不自動啟動 server 或設定 port forwarding。
- 維護程式時，parser 在 `lib/parser.js`、writer 在 `lib/writer.js`、server 在 `server.js`、UI 在 `public/index.html`；修改 JavaScript 後執行 `npm test`。
- `skills/scorecard/` 是 Skill 唯一來源；`.agents/skills/scorecard` 與 `.claude/skills/scorecard` 透過相對 symlink 共用它。
