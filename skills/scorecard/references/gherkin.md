# Story 對應的 Gherkin 規格

僅在使用者要求撰寫或更新 Story 規格時使用。

- 先讀 map 與既有規格；`[[feature-name]]` 對應專案根目錄的 `features/feature-name.feature`。
- viewer 也接受 `.md`、`.feature.md`，並搜尋 `features/` 下一層子目錄。已有對應檔案時更新原檔，不另建重複規格；保留連結目標的大小寫與空格。
- 新規格用 Gherkin，包含 Feature 描述與具體的 Scenario、Given／When／Then；依 Story 的可觀察行為描述驗收條件。
- 繁體中文規格使用 `# language: zh-TW` 與 `功能`、`場景`、`假設`、`當`、`那麼` 等關鍵字，並沿用專案既有慣例。
- 未提供的產品決策應標為待確認，不把假設寫成已確認的需求。
- 寫完規格本身不代表 Story 已完成。只在使用者要求或規格與實作確認完成時更新勾選狀態。
