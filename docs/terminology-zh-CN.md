# zh-CN 术语与界面文案规范

本文档是 ScriptCat 简体中文（`zh-CN`）界面与文档的用语依据。翻译或修改简体中文时，目标是让中国大陆用户自然理解，同时保留 ScriptCat 已建立的脚本类型、功能名称和开发者术语。

用例参考来源：`src/locales/zh-CN/translation.json`、`docs/README_zh-CN.md`

## 使用原则

1. 优先使用简体中文软件界面中常见且清晰的表达，例如 `设置`、`保存`、`加载`、`目录`、`连接`、`扩展`。
2. 保持产品类型信息：`普通脚本`、`页面脚本`、`后台脚本`、`定时脚本` 表示不同的界面或运行概念，不应仅为了语言统一而互相替换。
3. 不对单字或词组进行机械式全局替换；先确认英文概念、功能行为、显示位置及相邻文案。
4. 技术词应保持开发者可识别的含义，例如 `表达式`、`正则表达式`、`监听文件`、`存储 API`。
5. placeholder、HTML/React 标签、i18next 插值、URL，以及 `@match`、`@exclude`、`@grant`、`@connect` 等代码标识符不得因文案整理而改变。
6. 表中列出的 key 是当前用例或待审查现状；相同含义的新文案应遵循相同原则。
7. 当前翻译存在不一致时，本规范可指出建议方向，但不表示应在缺少界面确认的情况下批量修改现有字符串。

## 分类说明

| 分类 | 用法 |
| --- | --- |
| **A. 产品与功能标准术语** | 同一产品概念应优先复用的名称。 |
| **B. 界面操作与状态标准表达** | 按钮、菜单、字段和状态文案中可直接沿用的表达。 |
| **C. 需结合语境判断的词汇** | 不同功能场景可能需要不同词语，不作自动替换。 |
| **D. 固定保留的技术词** | 为保持技术含义和已有产品约定，不应随意改写。 |
| **E. 后续审查项目** | 当前文件已有混用或表达需要产品语境确认，本次规范不直接修改原翻译。 |

## A. 产品与功能标准术语

| 概念 | 优先使用 | 当前用例 key | 说明 |
| --- | --- | --- | --- |
| ScriptCat browser extension | `脚本猫扩展` | `start_guide_title`, `ext_update_notification` | `扩展` 是浏览器 extension 的标准表达。 |
| generic user script | `用户脚本` | `guide_script_list_content`, `allow_user_script_guide` | 泛指用户脚本能力或浏览器权限。 |
| ordinary / Tampermonkey-compatible script type | `普通脚本` / `普通油猴脚本` | `create_user_script`, `script_status_tooltip`, `script_list.sidebar.normal_script` | 表示产品中的脚本分类；不可仅因泛称为用户脚本而抹去分类信息。 |
| page script | `页面脚本` | `page_script`, `foreground_page_script_tooltip`, `guide_script_list_enable_content` | 表示在指定页面运行的脚本。 |
| background script | `后台脚本` | `create_background_script`, `background_script`, `enable_background.description` | 表示后台运行能力及脚本类型。 |
| scheduled script | `定时脚本` | `create_scheduled_script`, `scheduled_script`, `scheduled_script_description_title` | 表示按计划执行的脚本类型。 |
| script marketplace / site | `脚本站` / `脚本市场` | `script_gallery`, `guide_script_list_title` | 两者现用于不同入口或引导标题；新文案应与所指页面名称一致。 |
| script synchronization | `脚本同步` | `script_sync`, `guide_setting_sync_title`, `sync_status` | 涉及删除同步时应说明是同步删除状态或删除操作。 |
| script subscription | `订阅` / `脚本订阅` | `subscribe`, `subscribe_url`, `subscribe_import_progress` | 对象为订阅，不使用英文式动词名词混写。 |

## B. 界面操作与状态标准表达

| 概念 | 优先使用 | 当前用例 key | 说明 |
| --- | --- | --- | --- |
| create | `新建` / `创建` | `create_script`, `create_background_script`, `local_creation` | 新建按钮使用 `新建`；描述创建来源或过程时可用 `创建`。 |
| save / save as | `保存` / `另存为` | `save`, `save_as`, `save_success` | 与现行 UI 一致。 |
| import / export | `导入` / `导出` | `import`, `export`, `import_file`, `export_file` | 与现行 UI 和大陆技术产品习惯一致。 |
| install / update | `安装` / `更新` | `install_script`, `update_script`, `install_success` | 脚本与订阅均沿用同一动词。 |
| run / runtime | `运行` / `运行时` | `run`, `running`, `runtime`, `script_run_at.title` | 脚本执行及 runtime 语境使用现行表达。 |
| enable / disable | `开启` / `关闭`；状态或系统能力可用 `启用` / `禁用` | `enable`, `disable`, `enable_script`, `sync_system_closed`, `enable_background.title` | 操作按钮与配置状态需按句子自然度决定，不机械互换。 |
| settings / configuration | `设置` / `配置` | `settings`, `script_setting.title`, `editor_config`, `user_config` | 产品设置页用 `设置`；配置对象或开发者配置使用 `配置`。 |
| connect / synchronization | `连接` / `同步` | `connect`, `connection_success`, `script_sync`, `sync_system_connect_failed` | 分别表示网络或服务连接、数据同步。 |
| restore / reset | `恢复` / `重置` | `restore`, `restore_default_values`, `reset`, `reset_success` | 恢复备份/默认值与重置操作应按实际行为区分。 |
| load / reload | `加载` / `重新加载` | `loading`, `install_page_loading`, `click_to_reload` | 与现行 UI 一致。 |
| directory | `目录` | `open_directory`, `open_backup_dir` | 文件系统操作的常用表达。 |
| tabs | `标签页` | `close_current_tab`, `close_other_tabs` | 指浏览器 tab 时使用完整的 `标签页`。 |

## C. 需结合语境判断的词汇

| 概念 | 可用表达 | 判断标准 | 当前用例 key |
| --- | --- | --- | --- |
| local / cloud | `本地` / `云端` | 保存位置、导入来源与同步目的地使用现行成对表达。 | `local`, `cloud`, `source_local_script`, `guide_tools_backup_content` |
| storage | `存储` / `储存` | 面向大陆用户的新技术/UI 文案优先 `存储`；现有混用列入审查，不直接全局替换。 | `storage_api`, `script_operation_title`, `script_storage`, `storage_error` |
| panel / console | `面板` / `控制台` | 操作面板使用 `面板`；开发者工具输出位置使用 `控制台`。 | `background_script_description`, `build_success_message` |
| source | `来源` / `安装来源` / `订阅源` | 依据是一般来源、安装出处还是提供订阅内容的源来选择。 | `source`, `install_source`, `subscribe_source_tooltip` |
| permission / authorization | `权限` / `授权` | 能力类别与请求使用 `权限`；给予脚本访问权或已授权项使用 `授权`。 | `permission`, `request_permission`, `permission_management`, `confirm_delete_permission` |
| ordinary / normal / page | `普通脚本` / `页面脚本` | 两者是否同一运行类型需依据产品模型确认，不从字面推定。 | `create_user_script`, `page_script`, `guide_script_list_enable_content` |
| match / exclude | `匹配` / `排除` | 用户可见文案保留 `@match` / `@exclude` 标识符并配以中文说明。 | `website_match`, `website_exclude`, `add_match`, `add_exclude` |

## D. 固定保留的技术词

| 英文概念 | 固定使用 | 当前用例 key | 理由 |
| --- | --- | --- | --- |
| expression | `表达式` | `value_export_expression`, `cookie_export_expression`, `expression_format_error` | 是脚本、条件与导出字段中一致且明确的开发术语。 |
| cron expression | `定时表达式` | `cron_invalid_expr`, `error_cron_invalid`, `scheduled_script_description_description_expr` | 当前界面对 cron 采用用户可理解的产品表述。 |
| regular expression | `正则表达式`；紧凑提示可写 `正则` | `search_regex` | 简体中文开发语境中的通用写法。 |
| watch file changes | `监听文件` / `停止监听` | `watch_file_description`, `watch_file`, `stop_watch_file` | 表达持续监听变化并触发更新的功能含义。 |
| metadata declaration | `声明` | `error_metadata_line_duplicated` | 对应 metadata declaration 的技术含义。 |
| storage API | `存储 API` | `storage_api` | API 名称应与开发文档和平台术语保持一致。 |
| ESLint / VSCode / Cookie / API | 保留原英文名称 | `enable_eslint`, `vscode_url`, `permission_cookie`, `storage_api` | 产品名与 API/平台名称不翻译。 |

## E. 后续审查项目

以下内容记录当前文案中需要确认或统一的地方。本规范的建立本身不要求同时修改 `translation.json`。

| 对象 | 当前情况 | 建议方向 | 当前用例 key |
| --- | --- | --- | --- |
| `存储` / `储存` | API、权限标题与 S3 使用 `存储`，脚本数据和迁移文案使用 `储存`。 | 确认产品词后，面向大陆用户的技术/UI 文案优先统一为 `存储`。 | `storage_api`, `script_operation_title`, `script_storage`, `storage_error`, `migration_confirm_message` |
| browser tabs | 关闭操作使用 `标签页`，运行环境使用 `标签`。 | 若 `script_run_env` 表示浏览器 tab，应改用 `所有标签页`、`普通标签页`、`隐身标签页`。 | `close_current_tab`, `script_run_env.all`, `script_run_env.normal-tabs`, `script_run_env.incognito-tabs` |
| script type boundaries | 界面同时存在 `普通脚本`、`普通油猴脚本`、`用户脚本` 和 `页面脚本`。 | 在确认类型模型前保留各自现行含义；新文案不要擅自合并类别。 | `create_user_script`, `script_status_tooltip`, `guide_script_list_content`, `page_script` |
| synchronization deletion label | `同步删除` 可能被理解为立即执行删除。 | 依据实际交互确认是否应明确为 `同步删除状态` 或在说明中补足行为。 | `sync_delete`, `sync_delete_desc`, `notification.script_sync_delete` |
| UI spacing around Latin identifiers | 部分字符串写成 `API文档`、`ESLint规则`、`Cookie域`、`@connect标签`。 | 新增文案优先在中文与英文/标识符之间保留空格，既有内容应在单独审查中统一。 | `api_docs`, `eslint_rules`, `cookie_domain`, `confirm_operation_description` |

## 常用标准词

新增简体中文文案时，在对应语境下可优先采用以下写法：

| 优先使用 | 避免混入的其他 locale 写法 |
| --- | --- |
| `导入` / `导出` | `汇入` / `汇出` |
| `文件` / `目录` | `档案` / `资料夹` |
| `信息` | `资讯` |
| `设置`（产品选项）/ `配置`（配置内容） | `设定` |
| `支持` | `支援` |
| `搜索` | `搜寻` |
| `加载` | `载入` |
| `代码` / `源码` | `程式码` |
| `账号` | `帐号` |
| `设备` | `装置` |
| `网络` | `网路` |
| `服务器` | `伺服器` |
| `扩展`（浏览器 extension） | `扩充功能` |
| `鼠标` | `滑鼠` |
| `标签页`（浏览器 tab） | `分页` |
| `正则表达式` | `正規表達式` |

## AI 与贡献者检查清单

修改包含简体中文的文件时：

1. 确认目标 locale 是 `zh-CN`，不要从 `zh-TW` 规则机械转换词汇。
2. 同一功能优先沿用“产品与功能标准术语”和“界面操作与状态标准表达”。
3. 对“需结合语境判断的词汇”检查实际 UI 行为、英文概念和相邻文案后再选择写法。
4. 对“固定保留的技术词”保留指定用语和代码标识符。
5. 对“后续审查项目”仅在能够确认产品含义及影响范围时实施统一。
6. 保持 placeholder、HTML/React 标记、i18next 插值、URL 及 metadata 标识符原样可用。
7. 交付前搜索本次新增或修改的简体中文，确认未引入其他 locale 的专属用词或脚本类型混淆。
