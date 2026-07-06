# zh-TW 術語與介面文案規範

本文件是 ScriptCat 繁體中文（`zh-TW`）介面與文件的用語依據。翻譯或修改繁體中文時，目標是讓台灣使用者自然理解，並維持台灣軟體產品介面常見的語氣。

盤點來源：`src/locales/zh-TW/*.json`、`docs/README_zh-TW.md`、`docs/ARCHITECTURE.md`

產品互動參考：[PR #1421 討論](https://github.com/scriptscat/scriptcat/pull/1421)。CodFrm 對相同同步刪除設定確認應以簡短標籤呈現，詳細行為由旁側說明交代；此項產品決策在 `zh-TW` 對應為 `同步刪除` / `同步腳本刪除`，不代表其他 `zh-CN` 詞彙偏好應套用至繁中。

## 使用原則

1. 避免只有繁體字形、但詞彙與語氣仍偏中國大陸介面的翻譯。
2. 優先使用台灣產品介面慣用詞，例如 `儲存`、`載入`、`設定`、`裝置`、`分頁`。
3. 不對詞彙做機械式全域取代；即使表中列有目前的修正案例，也應先確認英文原意、功能和完整句子。
4. 技術名詞以專案既有術語與台灣開發者常用寫法為準；例如 `expression` 使用 `表達式`，`watch` 使用 `監聽`，不可改為 `運算式` 或 `監看`。
5. 本文件列出的 `受影響 key` 是目前盤點到的現況，不限制日後在其他文案中套用相同原則。

## 分類說明

| 分類 | 用法 |
| --- | --- |
| **A. 目前介面應直接修正** | 在表列 UI 語境中已確認應改；除非語境相同，不應擴張為任何句子的禁用詞。 |
| **B. 視語境修正** | 台灣可能使用，但替代詞取決於產品功能或原文意思。 |
| **C. 風格一致性** | 技術上可接受，不一定錯；面向使用者的介面宜優先採用較自然寫法。 |
| **D. 固定保留的技術詞** | 已採用且符合本產品技術語境的詞彙，不應因在地化掃描而替換。 |

## A. 目前介面應直接修正

| 避免使用 | 優先使用 | 目前受影響 key |
| --- | --- | --- |
| `新建` | `新增` / `建立` | `create_user_script`, `create_background_script`, `create_scheduled_script`, `create_script`, `create_success_note` |
| `暫無資料` | `尚無資料` / `目前沒有資料` | `no_data` |
| `通用` | `一般` | `general` |
| `列表` | `清單` | `backup_list`, `editor.show_script_list`, `editor.hide_script_list` |
| `連接` | `連線` | `auto_connect_vscode_service`, `connect`, `connection_success`, `connection_failed`, `sync_system_connect_failed` |
| `應用至` | `套用至` | `apply_to_run_status`, `script_list_enable_title` |
| `每星期` | `每週` | `cron_oncetype.week` |
| `返傭連結` | `分潤連結` | `referral_link_description` |
| `訂閱源` | `訂閱來源` | `source_subscribe_link` |
| `展示` | `顯示` | `script_list_enable_content` |
| `懸停` | `滑鼠停留` / `將滑鼠移到...上方` | `script_list_enable_content` |
| `運行` | 腳本用 `執行`；功能或環境用 `運作` | `script_list_action_content`, `run_at`, `runtime`, `enable_background.title`, `enable_background.prompt_title`, `enable_background.prompt_description` |
| `視圖模式` | `檢視模式` | `script_list_action_content` |
| `其它` | `其他` | `setting_sync_content` |
| `批量` | `批次` | `batch_edit` |
| `代碼` | `程式碼` | `script_code` |
| `回車` | `Enter 鍵` | `input_tags_placeholder` |
| `重覆` | `重複` | `error_metadata_line_duplicated` |
| `加載` | `載入` | `loading` |

## B. 視語境修正

| 目前詞彙 | 建議判斷 | 目前受影響 key |
| --- | --- | --- |
| `目錄` | 指 filesystem directory 的介面動作用 `資料夾`；文章或文件的內容目錄仍用 `目錄`。 | `open_backup_dir`, `open_directory`, `script_operation_description`, `get_backup_dir_url_failed` |
| `恢復` | restore settings/default values 用 `還原`；resume operation 或 recover 依語意使用 `恢復` / `復原`。 | `exclude_on`, `restore_default_values` |
| `拉取` | Git pull 可用 `拉取`；從雲端取得備份或資料的 UI 動作用 `下載` / `擷取` / `同步取得`。 | `pulling_data_from_cloud`, `pull_failed` |
| `保存` / `儲存` | UI 的 save 動作用 `儲存`；保存期限、保存證據或一般敘述仍可使用 `保存`。 | `tools_backup_content` |
| `設備` / `裝置` | 使用者持有、同步或連線的 device 介面用 `裝置`；equipment 或設備管理等語境仍可使用 `設備`。 | `setting_sync_content` |
| `打開` / `開啟` | 按鈕、選單或操作指示優先用 `開啟`；一般敘述中的 `打開` 並非錯誤。 | `show_main_sidebar` |
| `聲明` / `宣告` | 程式 metadata declaration 使用 `宣告`；政策、立場或正式 statement 仍使用 `聲明`。 | `error_metadata_line_duplicated` |
| `控制面板` / `面板` / `控制台` | 依實際產品元件與英文原文決定。英文為 `panel` 時優先保留 `面板`；只有 console/dashboard 或既定元件名稱才用 `控制台` / `儀表板`。 | `scheduled_script_description_title`, `background_script_description` |
| `查看` | 台灣可用；選單、模式或系統動作可用 `檢視`，開啟工具則可直接寫 `開啟`。 | `script_list_enable_content`, `develop_mode_guide`, `allow_user_script_guide`, `build_success_message`, `ext_update_notification_desc` |
| `退出瀏覽器` | quit/close browser 通常用 `關閉瀏覽器`，必要時可用 `結束瀏覽器`。 | `enable_background.description` |
| `前臺` / `後臺` | foreground/background 用 `前景` / `背景`；frontend/backend 用 `前端` / `後端`；管理系統語境才可能用 `前台` / `後台`。 | `error_script_type_mismatch` |
| `使用者腳本` / `普通腳本` / `頁面腳本` | `使用者腳本` 是一般概念，`普通腳本` 是現行分類標籤，`頁面腳本` 是介面中的頁面執行概念。三者應依顯示位置保留，不因用詞相近而自動合併或互換。 | `script_list_content`, `create_user_script`, `script_list.sidebar.normal_script`, `script_list_enable_content` |
| `Tampermonkey 腳本` | 僅在說明相容性時使用；不要把所有 `使用者腳本` 泛稱或 `普通腳本` 分類改成 Tampermonkey 標籤。 | `docs/README_zh-TW.md`, `docs/ARCHITECTURE.md` |
| `本地` / `本機` | 兩者皆為台灣可用寫法，不應只因 `zh-TW` 在地化而互相取代。`本地` 適合表達 local source / local creation 等與遠端來源相對的概念；`本機` 適合強調目前裝置或與雲端相對的儲存、匯入位置。同一功能流程內應維持一致。 | `source_local_script`, `local`, `importpage.source_local`, `sync_delete_desc`, `tools_backup_content` |
| `腳本站` / `腳本網站` / `腳本中心` | README 將指向 `https://scriptcat.org/zh-TW/search` 的入口稱為 `腳本站`；介面另有 `腳本網站` 與用於尋找、安裝腳本的 `腳本中心`。依顯示位置沿用名稱，不自動互換。 | `script_gallery`, `script_list_title`, `script_list_content`, README |
| `查詢` / `搜尋` | 兩者皆可用；紀錄或資料條件查詢的欄位可保留 `查詢`，搜尋動作與正規表達式搜尋使用 `搜尋`。不因 `zh-CN` 對 `查詢` 的偏好而全域統一。 | `query`, `search_regex`, `search_scripts` |
| `同步刪除` / `同步腳本刪除` | 依 CodFrm 對同一設定的產品文案決策，設定標籤與通知標題保留短稱；刪除狀態的傳播行為由說明文字呈現，不在標籤中擴寫。 | `sync_delete`, `notification.script_sync_delete`, `setting_sync_content`, `sync_delete_desc` |
| `腳本同步儲存空間` | 權限對話框標題使用 `儲存空間` 即可；同步用途由周邊功能語境與說明文字交代。 | `script_operation_title`, `script_operation_description` |

## C. 風格一致性

| 目前詞彙 | 介面優先寫法 | 目前受影響 key | 說明 |
| --- | --- | --- | --- |
| `幫助` | `說明` / `協助` | `helpcenter`, `help_translate` | 台灣日常用語可使用 `幫助`；Help Center 建議為 `說明中心`，help translate 建議為 `協助翻譯`。 |
| `更新日誌` | `更新紀錄` / `版本紀錄` | `ext_update_notification_desc` | 技術內容可理解，產品介面以 `紀錄` 較自然。 |
| `腳本個數` | `腳本數量` | `badge_type_script_count` | `個數` 可理解，但介面欄位以 `數量` 較自然。 |
| `普通腳本` / `普通標籤` | `一般腳本` / `一般分頁` | `create_user_script`, `script_run_env.normal-tabs`, `script_list.sidebar.normal_script` | `普通` 可改為較適合分類名稱的 `一般`；若 `tabs` 指瀏覽器分頁，應使用 `分頁`。 |
| `API文件` / `專案文件` | `API 文件` / `API 說明文件` / `專案文件` | `api_docs`, `project_docs` | `文件` 在台灣技術語境可接受；不要改為偏中國大陸用語的 `文檔`。 |

## D. 固定保留的技術詞

| 英文概念 | 固定使用 | 不使用 | 目前使用 key | 理由 |
| --- | --- | --- | --- | --- |
| `expression` | `表達式` | `運算式` | `value_export_expression`, `cookie_export_expression`, `cron_invalid_expr`, `expression_format_error`, `search_regex` | `表達式` 是台灣程式開發語境常見用法，也與既有 `正規表達式` 術語一致。將不同 expression 文案改成 `運算式` 會造成同一概念在介面中不一致，且容易讓人誤解為只限數學或計算公式。 |
| `watch`（檔案變動功能） | `監聽` | `監看` | `watch_file_description`, `watch_file`, `stop_watch_file` | 在開發工具中，watch 表示持續監聽檔案變動並觸發更新，與 watcher、事件監聽等技術概念相連。`監聽` 能保持技術意義與現有文案一致；`監看` 雖可理解，但不作為本專案術語。 |

## 常用標準詞

新增或修改繁體中文文案時，以下寫法可在表列語境中直接沿用；表格中的限定說明同樣屬於規範的一部分。

本表只規定 `zh-TW` 輸出應使用的詞語，不是簡繁轉換表，也不表示右欄詞語在其他 locale 中有誤。右欄記錄的是不適合混入相同 `zh-TW` 介面語境的寫法，並保留其可能出現在繁中草稿中的字形，方便檢查現有文案；它不是其他 locale 正式詞形的逐項引用。例如瀏覽器 extension 在 `zh-TW` 中寫為 `擴充功能`，而 `zh-CN` 可規範地寫為 `扩展`，兩者並非逐字替換關係。

| 在 `zh-TW` 中優先使用 | 不要混入相同 `zh-TW` 介面語境的寫法 |
| --- | --- |
| `匯入` / `匯出` | `導入` / `導出` |
| `檔案` / `資料夾` | `文件`（一般使用者檔案語境）/ `目錄`（filesystem UI 動作） |
| `資訊` | `信息` |
| `設定` | `配置` |
| `支援` | `支持` |
| `搜尋` | `搜索` |
| `載入` | `加載` |
| `程式碼` | `代碼` |
| `帳號` | `賬號` |
| `裝置`（使用者持有、同步或連線的 device） | `設備`（同一 device UI 語境；equipment 語境可保留） |
| `網路` | `網絡` |
| `伺服器` | `服務器` |
| `擴充功能` | `擴展` / `插件`（指瀏覽器 extension 時） |
| `滑鼠` | `鼠標` |
| `分頁` | `標籤`（指瀏覽器 tab 時） |
| `正規表達式` | `正則表達式` / `正規運算式` |
| `表達式` | `運算式`（指程式、排程或匯出 expression 時） |
| `監聽檔案` / `停止監聽` | `監看檔案` / `停止監看` |

## AI 與貢獻者檢查清單

修改包含繁體中文的檔案時：

1. 確認文字的目標語系是 `zh-TW`，而非只將簡體中文字形轉為繁體。
2. 針對與表列 UI 語境相同的文案，套用「目前介面應直接修正」與「常用標準詞」。
3. 遇到「視語境修正」或「風格一致性」詞彙時，檢查功能、英文原文或相鄰文案後再決定。
4. 遇到「固定保留的技術詞」時，沿用指定寫法，不依一般替換偏好改寫。
5. 維持既有 placeholder、HTML/React 標記與 i18next 插值格式，不因術語修正而改壞行為。
6. 交付前重新搜尋本次新增或修改的繁體中文，確認未引入本文件標示應避免的用詞。
