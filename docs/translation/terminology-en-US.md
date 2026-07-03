# en-US Terminology and UI Copy Guidelines

This document defines terminology for ScriptCat's US English (`en-US`) interface and documentation. It is intended to keep product concepts identifiable, make UI actions read naturally in English, and prevent later translations from copying unclear source wording.

Usage sources reviewed: `src/locales/en-US/*.json`, `README.md`

## Principles

1. Use concise US English UI copy that states the action or state directly.
2. Preserve product distinctions between `User Script`, `Page Script`, `Background Script`, and `Scheduled Script`; they are not interchangeable labels.
3. Do not replace words globally based on spelling alone. Confirm the feature, UI location, surrounding copy, and whether the string is a label or a sentence.
4. Keep developer-facing terms technically precise, including `regular expression`, `cron expression`, `watch`, `storage`, and metadata identifiers.
5. Do not alter placeholders, HTML/React tags, i18next interpolation, URLs, or identifiers such as `@match`, `@exclude`, `@grant`, and `@connect` as part of copy editing.
6. `en-US` is the runtime fallback locale and the template for new translations. Ambiguous or ungrammatical English should be corrected deliberately rather than propagated into other locales.
7. Keys listed below document present usage or known review targets; the same terminology principles apply to future strings with the same meaning.

## Categories

| Category | Use |
| --- | --- |
| **A. Product and feature terms** | Names that identify ScriptCat capabilities and script types. |
| **B. UI actions and states** | Preferred wording for controls, labels, and status messages. |
| **C. Context-sensitive wording** | Terms whose best wording depends on the specific feature or UI surface. |
| **D. Technical terms to preserve** | Terms and identifiers that should retain their technical meaning. |
| **E. Copy review targets** | Existing strings that need later correction or product-context confirmation. |

## A. Product and Feature Terms

| Concept | Preferred wording | Current example keys | Notes |
| --- | --- | --- | --- |
| ScriptCat browser extension | `ScriptCat extension` | `start_guide_title`, `ext_update_notification` | Preserve the `ScriptCat` product capitalization. |
| generic userscript capability | `user script` / `userscript` | `create_user_script`, `guide_script_list_content`, README | Use `User Script` in UI type labels; prose may use `userscript` consistently within a document. |
| Tampermonkey-compatible script type | `Tampermonkey script` | `script_status_tooltip` | Do not reduce a compatibility statement to a generic script label. |
| page script | `Page Script` | `page_script`, `foreground_page_script_tooltip` | A script that runs on a specified page. |
| background script | `Background Script` | `create_background_script`, `background_script`, `enable_background.description` | A ScriptCat script type and background-running capability. |
| scheduled script | `Scheduled Script` | `create_scheduled_script`, `scheduled_script`, `scheduled_script_description_title` | Use this product term instead of introducing `crontab script`. |
| script sync | `Script Sync` | `script_sync`, `sync_status`, `guide_setting_sync_title` | When deletion is involved, explain whether deletion state or content is synchronized. |
| script subscription | `Subscription` | `subscribe`, `subscribe_url`, `subscribe_import_progress` | Use `Subscribe` only as a verb or control action; use `Subscription` for the object. |
| script gallery / market | `Script Gallery` / `Script Market` | `script_gallery`, `guide_script_list_title` | Match the destination's product label rather than merging names without confirmation. |

## B. UI Actions and States

| Concept | Preferred wording | Current example keys | Notes |
| --- | --- | --- | --- |
| create | `Create` | `create_script`, `create_background_script`, `create_success_note` | Use for creation actions and confirmations. |
| save / save as | `Save` / `Save As` | `save`, `save_as`, `save_as_success` | Capitalize as a label; use sentence case within prose. |
| import / export | `Import` / `Export` | `import`, `export`, `import_file`, `export_file` | Standard data/file actions. |
| install / update | `Install` / `Update` | `install_script`, `update_script`, `install_success` | Use the object name when needed to disambiguate. |
| run / runtime | `Run` / `Runtime` | `run`, `running`, `runtime`, `log_title` | `Runtime Logs` is appropriate for execution logs. |
| enable / disable | `Enable` / `Disable`; states `Enabled` / `Disabled` | `enable`, `disable`, `updatepage.enabled`, `updatepage.disabled` | Avoid `open` or `close` for feature enablement. |
| settings / configuration | `Settings` / `Configuration` | `settings`, `script_setting.title`, `editor_config` | UI options are settings; configuration data or editor configuration uses configuration. |
| connect / sync | `Connect` / `Sync` | `connect`, `connection_success`, `script_sync` | Keep connection state separate from data synchronization. |
| restore / reset | `Restore` / `Reset` | `restore`, `restore_default_values`, `reset` | Use according to whether saved/default content is recovered or settings are reset. |
| load / reload | `Loading` / `Reload` | `loading`, `install_page_loading`, `click_to_reload` | Use natural progressive/action forms. |
| directory | `Directory` | `open_directory`, `open_backup_dir` | Suitable for this developer-facing file-system feature. |
| browser tab | `Tab` | `close_current_tab`, `close_other_tabs` | Do not call browser tabs `tags`. |

## C. Context-Sensitive Wording

| Concept | Candidate wording | Decision rule | Current example keys |
| --- | --- | --- | --- |
| local / cloud | `Local` / `Cloud` | Use for data origin, destination, and storage location; add `device` or `storage` where the object is otherwise unclear. | `local`, `cloud`, `source_local_script`, `guide_tools_backup_content` |
| panel / console | `panel` / `console` | Use `panel` for ScriptCat UI controls and `console` for developer-tools output. | `background_script_description`, `build_success_message` |
| source | `Source`, `Install Source`, `Subscription Source` | Name what the source provides; a subscription object is not a verb. | `source`, `install_source`, `subscribe_source_tooltip` |
| permissions / authorization | `Permission`, `Allow`, `Grant access` | Use permission for capability records, allow/deny for decisions, and grant access in explanatory sentences. | `permission`, `allow_once`, `confirm_script_operation` |
| run location / application | `Applies To`, `Run Status` | Verify the column behavior before rewriting `Apply To / Run Status`; it may combine two separate concepts. | `apply_to_run_status`, `guide_script_list_apply_to_run_status_title` |
| sync deletion | `Sync Deletions` / `Sync Deletion Status` | Choose after confirming whether the setting propagates tombstones or performs deletion immediately. | `sync_delete`, `sync_delete_desc`, `notification.script_sync_delete` |
| match / exclude | `Match` / `Exclude` | Keep metadata identifiers visible as `@match` and `@exclude` when the UI edits those rules. | `website_match`, `website_exclude`, `add_match`, `add_exclude` |

## D. Technical Terms to Preserve

| Concept | Use | Current example keys | Reason |
| --- | --- | --- | --- |
| regular expression | `regular expression` / compact label `regex` | `search_regex` | Standard developer terminology. |
| cron expression | `cron expression` | `cron_invalid_expr`, `error_cron_invalid` | Identifies the accepted schedule syntax precisely. |
| expression | `expression` | `value_export_expression`, `cookie_export_expression`, `expression_format_error` | Retains the technical meaning of an entered or evaluated expression. |
| watch file changes | `Watch File` / `Stop Watching` | `watch_file_description`, `watch_file`, `stop_watch_file` | `watch` describes ongoing file-change monitoring in developer tools. |
| metadata declaration | `declaration` | `error_metadata_line_duplicated` | Corresponds to metadata syntax, not a general duplicate value. |
| storage / Storage API | `storage` / `Storage API` | `script_storage`, `storage_api`, `script_operation_title` | Feature and API terminology. |
| product/API identifiers | Preserve `ESLint`, `VSCode`, `Cookie`, `GM API`, `@resource`, `@require` | `enable_eslint`, `vscode_url`, `permission_cookie`, `script_resource_tooltip` | Names and metadata identifiers must remain recognizable and accurate. |

## E. Copy Review Targets

The entries below identify defects or inconsistencies already present in `*.json`. Creating this guideline does not itself change runtime strings; these should be corrected in a scoped English copy pass with UI checks.

| Target | Current wording or issue | Preferred direction | Current example keys |
| --- | --- | --- | --- |
| spelling errors | `Suceeded`, `exeuction` | `Succeeded`, `execution` | `import_local_success`, `exclude_off` |
| subscription as a noun | Object labels use `Subscribe`, such as `Subscribe URL` and `Install Subscribe`. | Use `Subscription URL`, `Install Subscription`, `Update Subscription`, and plural `Subscriptions` where the value is an object. | `subscribe_url`, `install_subscribe`, `update_subscribe`, `select_subscribes_to_import`, `notification.subscribe_update` |
| browser tabs | Run-environment entries call tabs `tags`. | Use `All Tabs`, `Normal Tabs`, and `Incognito Tabs` if these values target browser tabs. | `script_run_env.all`, `script_run_env.normal-tabs`, `script_run_env.incognito-tabs` |
| scheduled script naming | One status string says `crontab scripts` while the feature name is `Scheduled Script`. | Use `scheduled scripts` consistently. | `only_background_scheduled_can_run`, `scheduled_script` |
| product capitalization | `Scriptcat extension updated` does not match `ScriptCat`. | Preserve `ScriptCat` capitalization. | `ext_update_notification` |
| metadata identifier | Tooltip refers to `@required`; userscript metadata uses `@require`. | Keep the identifier as `@require`. | `script_resource_tooltip` |
| title-style fragments used as messages | Many success/error messages use noun-like forms such as `Delete Successful`, `Update Successful`, or `Dump success saved`. | For notifications, prefer natural result messages such as `Deleted successfully`, `Updated successfully`, and `Export successful`; keep label capitalization separate. | `delete_success`, `update_success`, `export_success`, `install_success` |
| script type capitalization | Labels use title case while sentences capitalize `Background scripts` and `Scheduled scripts` mid-sentence. | Use title case only for displayed type labels; use lowercase common nouns in explanatory sentences. | `background_script`, `scheduled_script`, `script_status_tooltip` |
| interaction instructions | Links use `tap` or `Click me`, and some instructional text is ungrammatical. | Use consistent desktop UI wording such as `Click to learn how to enable it` and sentence-form instructions. | `develop_mode_guide`, `allow_user_script_guide`, `lower_version_browser_guide`, `blacklist_placeholder`, `import_script_placeholder` |
| browser-specific background behavior | Background-running copy says the user must quit `Chrome`, although ScriptCat supports multiple browsers. | Confirm implementation behavior, then use `the browser` unless the setting is Chrome-specific. | `enable_background.description` |

## Preferred Vocabulary

For new `en-US` strings in the corresponding context, prefer these forms:

| Prefer | Avoid unless required by a specific context |
| --- | --- |
| `ScriptCat` | `Scriptcat` |
| `User Script`, `Page Script`, `Background Script`, `Scheduled Script` | `Normal Script` or `crontab script` as an unverified replacement type |
| `Subscription` for the object; `Subscribe` for the action | `Subscribe` used as a noun |
| `Settings` for product options; `Configuration` for configuration data | `Config` in user-facing copy without space constraints |
| `Tab` for a browser tab | `Tag` for a browser tab |
| `regular expression` / `regex` | vague `condition` when regex syntax is accepted |
| `Storage API` | renamed API terminology |
| `@require`, `@resource`, `@match`, `@exclude`, `@grant`, `@connect` | translated or misspelled metadata identifiers |

## Checklist for AI and Contributors

When adding or editing English copy:

1. Confirm the target locale is `en-US` and consult this guide plus adjacent existing UI strings.
2. Use the product and feature terms for the same ScriptCat concept; do not merge script types based on similar wording.
3. For context-sensitive terms, check actual behavior, control type, and neighboring text before editing.
4. Preserve technical terms, product capitalization, metadata identifiers, tags, interpolation values, and URLs.
5. Treat `en-US` as source copy for other locales: do not introduce awkward grammar, noun/verb ambiguity, or untranslated type distinctions.
6. Address review targets only with a scoped change that also checks related notifications, tooltips, and labels.
7. Before delivery, search newly edited English text for inconsistent type naming, `Subscribe` used as a noun, browser tabs called tags, and modified identifiers.
