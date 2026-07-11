# 设置页 i18n key 映射

设置页所有 key 的 `t(...)` 引用形式。`defaultNS` 为 `common`，其他命名空间需带前缀。

## 全集 key → namespace:key

### 通用 (General)

| key | t(...) 引用 |
|-----|-------------|
| `language` | `settings:language` |
| `select_interface_language` | `settings:select_interface_language` |
| `general` | `settings:general` |

### 界面 (Interface)

| key | t(...) 引用 |
|-----|-------------|
| `interface_settings` | `settings:interface_settings` |
| `extension_icon_badge` | `settings:extension_icon_badge` |
| `display_type` | `settings:display_type` |
| `badge_type_none` | `settings:badge_type_none` |
| `badge_type_run_count` | `settings:badge_type_run_count` |
| `badge_type_script_count` | `settings:badge_type_script_count` |
| `extension_icon_badge_type` | `settings:extension_icon_badge_type` |
| `background_color` | `settings:background_color` |
| `badge_background_color_desc` | `settings:badge_background_color_desc` |
| `text_color` | `settings:text_color` |
| `badge_text_color_desc` | `settings:badge_text_color_desc` |
| `script_menu` | `settings:script_menu` |
| `display_right_click_menu` | `settings:display_right_click_menu` |
| `display_right_click_menu_desc` | `settings:display_right_click_menu_desc` |
| `expand_count` | `settings:expand_count` |
| `auto_collapse_when_exceeds` | `settings:auto_collapse_when_exceeds` |
| `favicon_service` | `settings:favicon_service` |
| `favicon_service_scriptcat` | `settings:favicon_service_scriptcat` |
| `favicon_service_google` | `settings:favicon_service_google` |
| `favicon_service_duckduckgo` | `settings:favicon_service_duckduckgo` |
| `favicon_service_icon-horse` | `settings:favicon_service_icon-horse` |
| `favicon_service_local` | `settings:favicon_service_local` |
| `favicon_service_desc` | `settings:favicon_service_desc` |

### 同步 (Sync)

| key | t(...) 引用 |
|-----|-------------|
| `script_sync` | `settings:script_sync` |
| `enable_script_sync_to` | `settings:enable_script_sync_to` |
| `backup_to` | `settings:backup_to` |
| `sync_delete` | `settings:sync_delete` |
| `sync_delete_desc` | `settings:sync_delete_desc` |
| `save` | `save` (common) |
| `save_success` | `save_success` (common) |

### 更新 (Update)

| key | t(...) 引用 |
|-----|-------------|
| `update` | `update` (common) |
| `script_update_check_frequency` | `settings:script_update_check_frequency` |
| `script_auto_update_frequency` | `settings:script_auto_update_frequency` |
| `never` | `settings:never` |
| `6_hours` | `settings:6_hours` |
| `12_hours` | `settings:12_hours` |
| `every_day` | `settings:every_day` |
| `every_week` | `settings:every_week` |
| `update_disabled_scripts` | `settings:update_disabled_scripts` |
| `silent_update_non_critical_changes` | `settings:silent_update_non_critical_changes` |
| `control_script_update_behavior` | `settings:control_script_update_behavior` |

### 运行时 (Runtime)

| key | t(...) 引用 |
|-----|-------------|
| `runtime` | `logs:runtime` |
| `enable_background` | `settings:enable_background` (object) |
| `storage_api` | `editor:storage_api` |
| `use_file_system` | `editor:use_file_system` |
| `open_directory` | `editor:open_directory` |
| `not_set` | `editor:not_set` |
| `in_use` | `editor:in_use` |
| `storage_error` | `editor:storage_error` |
| `settings` | `settings` (common) |
| `reset` | `reset` (common) |

### 安全 (Security)

| key | t(...) 引用 |
|-----|-------------|
| `security` | `settings:security` |
| `blacklist_pages` | `settings:blacklist_pages` |
| `blacklist_pages_desc` | `settings:blacklist_pages_desc` |
| `blacklist_placeholder` | `settings:blacklist_placeholder` |
| `expression_format_error` | `settings:expression_format_error` |

### 开发者 (Developer)

| key | t(...) 引用 |
|-----|-------------|
| `development_tools` | `settings:development_tools` |
| `enable_eslint` | `settings:enable_eslint` |
| `check_script_code_quality` | `settings:check_script_code_quality` |
| `eslint_rules` | `settings:eslint_rules` |
| `custom_eslint_rules_config` | `settings:custom_eslint_rules_config` |
| `enter_eslint_rules` | `settings:enter_eslint_rules` |
| `eslint_rules_reset` | `editor:eslint_rules_reset` |
| `eslint_rules_saved` | `editor:eslint_rules_saved` |
| `eslint_config_format_error` | `editor:eslint_config_format_error` |
| `editor_config` | `editor:editor_config` |
| `editor_config_reset` | `editor:editor_config_reset` |
| `editor_config_saved` | `editor:editor_config_saved` |
| `editor_config_format_error` | `editor:editor_config_format_error` |
| `editor_config_description` | `editor:editor_config_description` |
| `editor_type_definition` | `editor:editor_type_definition` |
| `editor_type_definition_reset` | `editor:editor_type_definition_reset` |
| `editor_type_definition_saved` | `editor:editor_type_definition_saved` |
| `editor_type_definition_description` | `editor:editor_type_definition_description` |

---

## 新增到 settings.json 的 key（规则 3）

以下 8 个 key 在 new-ui 任何命名空间均不存在，已从 v1.4 `translation.json` 迁移到 7 个 `src/locales/<locale>/settings.json`：

| key | 位置 |
|-----|------|
| `badge_type_none` | `settings:badge_type_none` |
| `badge_type_run_count` | `settings:badge_type_run_count` |
| `badge_type_script_count` | `settings:badge_type_script_count` |
| `script_menu` | `settings:script_menu` |
| `display_right_click_menu` | `settings:display_right_click_menu` |
| `display_right_click_menu_desc` | `settings:display_right_click_menu_desc` |
| `expand_count` | `settings:expand_count` |
| `auto_collapse_when_exceeds` | `settings:auto_collapse_when_exceeds` |

## 映射到现有命名空间的 key（规则 2 — 不重复迁移）

| key | 现有 namespace:key |
|-----|-------------------|
| `save` | `common:save` → `t("save")` |
| `save_success` | `common:save_success` → `t("save_success")` |
| `update` | `common:update` → `t("update")` |
| `settings` | `common:settings` → `t("settings")` |
| `reset` | `common:reset` → `t("reset")` |
| `runtime` | `logs:runtime` → `t("logs:runtime")` |
| `storage_api` | `editor:storage_api` → `t("editor:storage_api")` |
| `use_file_system` | `editor:use_file_system` → `t("editor:use_file_system")` |
| `open_directory` | `editor:open_directory` → `t("editor:open_directory")` |
| `not_set` | `editor:not_set` → `t("editor:not_set")` |
| `in_use` | `editor:in_use` → `t("editor:in_use")` |
| `storage_error` | `editor:storage_error` → `t("editor:storage_error")` |
| `eslint_rules_reset` | `editor:eslint_rules_reset` → `t("editor:eslint_rules_reset")` |
| `eslint_rules_saved` | `editor:eslint_rules_saved` → `t("editor:eslint_rules_saved")` |
| `eslint_config_format_error` | `editor:eslint_config_format_error` → `t("editor:eslint_config_format_error")` |
| `editor_config` | `editor:editor_config` → `t("editor:editor_config")` |
| `editor_config_reset` | `editor:editor_config_reset` → `t("editor:editor_config_reset")` |
| `editor_config_saved` | `editor:editor_config_saved` → `t("editor:editor_config_saved")` |
| `editor_config_format_error` | `editor:editor_config_format_error` → `t("editor:editor_config_format_error")` |
| `editor_config_description` | `editor:editor_config_description` → `t("editor:editor_config_description")` |
| `editor_type_definition` | `editor:editor_type_definition` → `t("editor:editor_type_definition")` |
| `editor_type_definition_reset` | `editor:editor_type_definition_reset` → `t("editor:editor_type_definition_reset")` |
| `editor_type_definition_saved` | `editor:editor_type_definition_saved` → `t("editor:editor_type_definition_saved")` |
| `editor_type_definition_description` | `editor:editor_type_definition_description` → `t("editor:editor_type_definition_description")` |
