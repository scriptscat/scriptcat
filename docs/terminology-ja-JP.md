# 日本語（ja-JP）用語・UI 文言ガイドライン

本書は、ScriptCat の日本語（`ja-JP`）UI およびドキュメントで使用する用語と UI 文言の基準です。日本語の文言を翻訳または修正する際は、日本語として自然で、製品 UI として一貫した表現を使用します。

用例の参照元：`src/locales/ja-JP/translation.json`、`docs/README_ja.md`

## 外来語表記の基準

個別に本書または製品用語として指定していない外来語は、最新の JIS に沿う表記を既定とします。現時点で参照する基準は `JIS Z 8301:2019` であり、同規格の外来語表記は主として内閣告示第二号「外来語の表記」（平成3年6月28日）によります。

- 語末の `-er`、`-or`、`-ar` などに対応する長音は、原則として長音符号 `ー` を付けます。例：`サーバー`、`ユーザー`、`エディター`。
- 本書で固定している製品名、API 名、第三者サービス名、コード上の識別子は、一般的な外来語表記への機械的置換対象にしません。
- 既存の `ja-JP` 文言がこの原則と異なる場合でも、本書の追加だけを理由に直ちに変更しません。意味、UI の表示箇所、既存の利用実績を確認する後日の監査対象とします。

参照：

- [`JIS Z 8301:2019`（日本規格協会）](https://webdesk.jsa.or.jp/books/W11M0090/index/?bunsyo_id=JIS+Z+8301%3A2019)
- [文化庁「外来語の表記」（平成3年内閣告示第二号）](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gairai/index.html)

## 基本方針

1. 日本語 UI として自然で、簡潔に操作内容が伝わる文言を使用します。
2. 製品内ですでに確立しているスクリプト種別、機能名、技術用語を維持します。
3. 単語だけを見て一括置換せず、機能、原文の意味、周辺の UI 文言を確認します。
4. placeholder、HTML/React タグ、i18next の補間形式、`@grant`、`@match`、`@exclude` などの識別子は変更しません。
5. 個別指定のない外来語を新たに導入する場合は、上記の外来語表記基準に従います。
6. 本書に記載した key は現在の用例であり、同じ機能・同じ意味の新規文言には同じ用語原則を適用します。
7. 現行翻訳に複数の表現がある場合は、監査が完了するまで新しい統一ルールを推測して導入しません。
8. UI ラベルは短く明確にし、動作の詳細や注意事項は説明文またはツールチップで補います。

## 分類

| 分類 | 扱い |
| --- | --- |
| **A. 製品・機能の標準用語** | 同じ機能を示す文言では、現行の用語を優先して使用します。 |
| **B. UI 操作・状態の標準表現** | ボタン、メニュー、列名、状態表示などで現在採用されている表現です。 |
| **C. 文脈を確認する用語** | 用途により語が変わるため、自動置換しません。 |
| **D. 固定して扱う技術用語** | 技術的な意味を保つため、別表現へ安易に変更しません。 |
| **E. 後日レビュー対象** | 現行ファイルに複数表現があるため、現時点では統一を強制しません。 |

## A. 製品・機能の標準用語

| 概念 | 使用する表記 | 現行用例 key | 備考 |
| --- | --- | --- | --- |
| user script | `ユーザースクリプト` | `create_user_script`, `guide_script_list_content` | 一般名として使用します。 |
| Tampermonkey compatible script | `Tampermonkey スクリプト` | `script_status_tooltip` | `ユーザースクリプト` に置き換えて種別情報を失わないでください。 |
| page script | `ページスクリプト` | `page_script`, `guide_script_list_enable_content` | ページ上で動作するスクリプト種別です。 |
| background script | `バックグラウンドスクリプト` | `create_background_script`, `background_script`, `enable_background.description` | 実行方式を示す製品用語です。 |
| scheduled script | `スケジュールスクリプト` | `create_scheduled_script`, `scheduled_script`, `scheduled_script_description_title` | 定時実行のスクリプト種別です。 |
| ScriptCat extension | `ScriptCat拡張機能` | `start_guide_title`, `ext_update_notification` | locale ファイルの現行表記を基準とします。 |
| script center | `スクリプトセンター` | `guide_script_list_title`, `guide_script_list_content` | README にも使用例があります。 |
| sync deletion state | `削除状態を同期` / `スクリプトの削除状態を同期` | `sync_delete`, `notification.script_sync_delete` | 削除操作そのものではなく、削除済み状態を同期する機能です。 |

## B. UI 操作・状態の標準表現

| 概念 | 使用する表記 | 現行用例 key | 備考 |
| --- | --- | --- | --- |
| create | `新しい...を作成` / `作成` | `create_script`, `create_background_script`, `create_success_note` | ボタンでは短く、説明文では目的語を補います。 |
| save / save as | `保存` / `名前を付けて保存` | `save`, `save_as`, `save_success` | 現行 UI と揃えます。 |
| import / export | `インポート` / `エクスポート` | `import`, `export`, `import_file`, `export_file` | 現行の外来語表記を維持します。 |
| install | `インストール` | `install_script`, `install_success`, `install_failed` | 現行 UI と揃えます。 |
| run / runtime | `実行` / `ランタイム` | `run`, `running`, `runtime`, `script_run_at.title` | `runtime` は `ランタイム` を維持します。 |
| enable / disable | `有効` / `無効`、操作文では `有効にする` / `無効にする` | `enable`, `disable`, `enable_script`, `enable_background.title`, `in_use`, `sync_system_closed` | 状態表示には `有効` / `無効` を優先します。 |
| settings | `設定` | `settings`, `script_setting.title`, `editor_config` | 現行 UI と揃えます。 |
| permission | `権限` / `許可` | `permission`, `permission_management`, `allow_once` | 権限の種類は `権限`、許可する操作は `許可` を使用します。 |
| connection | `接続` | `connect`, `connection_success`, `sync_system_connect_failed` | 状態を表す `closed` は機能の意味に応じて訳します。 |
| synchronization | `同期` | `script_sync`, `sync_status`, `guide_setting_sync_title` | 対象がある場合は `削除状態を同期` のように対象を明示します。 |
| restore | `復元` | `restore`, `restore_default_values` | 現行 UI と揃えます。 |
| load / reload | `読み込み` / `再読み込み` | `loading`, `install_page_loading`, `click_to_reload` | 現行 UI と揃えます。 |
| tabs | `タブ` | `close_current_tab`, `script_run_env.all`, `script_run_env.normal-tabs` | 現行の外来語表記を維持します。 |
| interface display | `表示` / `非表示` | `badge_type_none`, `editor.show_script_list`, `editor.hide_script_list` | 表示状態および表示操作に使用します。 |
| action / operation | `操作` | `action`, `operation`, `guide_script_list_action_title` | UI の列名、操作欄、メニュー文脈では `操作` を使用します。 |
| work in progress | `開発中` | `under_construction` | ソフトウェアの機能状態を示します。 |
| silent update | `サイレントで更新する` | `silent_update_non_critical_changes` | 通知を抑えた更新を示す現行表記です。 |
| issue report | `バグ報告 / 問題のフィードバック` | `report_issue` | 読みやすい区切りを維持します。 |

## C. 文脈を確認する用語

| 概念 | 現行表記 | 判断基準 | 現行用例 key |
| --- | --- | --- | --- |
| local / cloud | `ローカル` / `クラウド` | 端末上の保存先、作成元、インポート元は `ローカル`、同期先は `クラウド` を使用します。 | `local`, `cloud`, `source_local_script`, `local_creation`, `guide_tools_backup_content` |
| directory / path | `ディレクトリ` / `パス` | ファイルシステムを扱う開発機能では、現行の `ディレクトリ` を維持します。一般向け機能へ拡大する場合は別途確認します。 | `open_directory`, `open_backup_dir`, `script_operation_description`, `watch_file_description` |
| panel / console | `パネル` / `コンソール` | `panel` は `パネル`、開発者ツールの console は `コンソール` とし、相互に置換しません。 | `background_script_description`, `build_success_message` |
| check / confirm | `チェック` / `確認` | 更新確認の UI には両表現が現存します。新しい文言では周辺 UI に合わせ、統一はレビュー後に行います。 | `check_update`, `updatepage.main_header`, `status_checking_updates` |
| source | `ソース` / `インストール元` | 外部リソースや出所一般は `ソース`、導入元を明示する欄では `インストール元` を使用しています。 | `source`, `install_source`, `install_from_legitimate_sources_warning` |
| query / filter | `検索` / `絞り込み` / `クエリ` | ログ検索 UI の操作名は `検索`、結果を条件で狭める説明は `絞り込み` を優先します。API や問い合わせ言語など技術文脈では `クエリ` を使用できます。 | `query`, `enter_filter_conditions`, `filtered_logs` |
| match / exclude | `対象` / `除外`、ラベルでは `対象サイト（@match）` / `除外サイト（@exclude）` | ユーザー向け操作では現行の `対象` / `除外` を優先します。`@match` / `@exclude` は識別子として保持します。現行の `マッチ` 文言は後日レビュー対象です。 | `add_match`, `add_exclude`, `website_match`, `website_exclude`, `match` |
| storage access / operation | `同期ストレージにアクセス` / `ストレージ` | 許可ダイアログのタイトルでは対象への `アクセス` を明確にし、説明文で具体的操作を補います。API 名や保存領域の機能名では `ストレージ` を維持します。 | `script_operation_title`, `script_storage`, `storage_api` |

## D. 固定して扱う技術用語

| 英語概念 | 現行表記 | 現行用例 key | 理由 |
| --- | --- | --- | --- |
| regular expression | `正規表現` | `search_regex` | 日本語の開発用語として定着しており、別表記へ変更しません。 |
| cron expression | `cron 式` | `cron_invalid_expr`, `error_cron_invalid` | cron の入力エラーでは現行の短い表記を維持します。 |
| expression（入力・エラー文言） | `式` | `value_export_expression`, `cookie_export_expression`, `expression_format_error` | 入力欄と形式エラーでは現行の `式` を維持します。スケジュール説明のラベルは後日レビュー対象です。 |
| watch file changes | `監視` | `watch_file_description`, `watch_file`, `stop_watch_file` | ファイル変更の watch 機能は `監視` として統一されています。 |
| metadata declaration | `宣言` | `error_metadata_line_duplicated` | metadata 行の declaration を示す技術用語です。 |
| storage | `ストレージ` | `script_storage`, `storage_api`, `script_operation_title` | API・同期保存領域の機能名として使用します。 |
| background execution | `バックグラウンド実行` | `enable_background.title`, `enable_background.description` | バックグラウンドスクリプトと関連する機能名として維持します。 |
| ESLint / VSCode / API names | 原文の固有名を維持 | `enable_eslint`, `eslint_rules`, `vscode_url`, `storage_api` | 製品名・API 名は翻訳せず、必要に応じて周辺文言のみ調整します。 |

## E. 後日レビュー対象

以下は現行翻訳を否定するものではありません。既存ファイル内に複数の表記または意味確認が必要な箇所があるため、後日の日本語レビューで確認します。本書の作成だけを理由に変更しません。

| 対象 | 現行の状況 | 現行用例 key |
| --- | --- | --- |
| subscription | `サブスクライブ` と `サブスクリプション` が使用されています。機能名としてどちらを採用するか確認が必要です。 | `subscribe`, `subscribe_url`, `subscribe_source_tooltip`, `notification.subscribe_update` |
| expression label | 多くの入力・エラーは `式` ですが、スケジュール説明には `表現` が使用されています。画面上の意味を確認してから統一を検討します。 | `scheduled_script_description_description_expr`, `cron_invalid_expr`, `expression_format_error` |
| panel operation availability | `background_script_description` は `パネルで手動制御` と明記されていますが、`scheduled_script_description_title` は手動操作の場所を省略しています。機能仕様を確認してから調整します。 | `background_script_description`, `scheduled_script_description_title` |
| documentation link locale | locale 文言内のドキュメントリンクに `/en/` または別 locale の URL が含まれています。利用可能な日本語ページを確認してから変更します。 | `develop_mode_guide`, `allow_user_script_guide`, `guide_script_list_action_content`, `import_script_placeholder` |
| 外来語の語末長音 | 外来語表記の既定では長音符号を付けますが、現行文言に `エディタ`、`エディタ設定` など既存表記があります。製品内での統一範囲を確認してから変更します。 | `editor_config`, `editor_type_definition`, `editor_config_description`, `editor_type_definition_description`, `editor_config_reset`, `editor_config_saved`, `editor_config_format_error`, `editor_type_definition_reset`, `editor_type_definition_saved` |
| match 表記 | 操作ラベルは `対象` / `除外` ですが、説明文や一部ラベルに `マッチ` が使用されています。UI 上の概念名としてどちらを採用するか確認してから統一します。 | `match`, `after_deleting_match_item`, `confirm_delete_match`, `add_match`, `website_match` |

## AI・コントリビューター向けチェックリスト

日本語の文言を追加または修正する場合：

1. 対象 locale が `ja-JP` であることを確認し、まず本書と既存の近接文言を確認してください。
2. 同じ機能の既存文言がある場合は、「製品・機能の標準用語」と「UI 操作・状態の標準表現」を優先してください。
3. 「文脈を確認する用語」は、英語原文、表示場所、ユーザー操作を確認してから選択してください。
4. 「固定して扱う技術用語」は、明確なレビュー判断なしに別表現へ変更しないでください。
5. 個別指定がない新規の外来語は、`JIS Z 8301:2019` が主として参照する「外来語の表記」に沿って表記してください。
6. 「後日レビュー対象」は、個別の翻訳変更と同時に根拠を確認できる場合のみ統一してください。
7. placeholder、HTML/React タグ、i18next 補間、URL、コード識別子を文言整理だけを理由に壊さないでください。
8. UI ラベルを変更する場合は、同じ概念の通知、ツールチップ、説明文も確認してください。
9. `@match`、`@exclude`、`@grant` などのメタデータ識別子は翻訳せず、必要であれば日本語ラベルに併記してください。
