# zh-CN 术语与界面文案规范

本文档是 ScriptCat 简体中文（`zh-CN`）界面与文档的用语依据。翻译或修改简体中文时，目标是让中国大陆用户自然理解，同时保留 ScriptCat 已建立的脚本类型、功能名称和开发者术语。

用例参考来源：`src/locales/zh-CN/*.json`、`docs/README_zh-CN.md`、`docs/ARCHITECTURE.md`

作者确认参考：[PR #1421 讨论](https://github.com/scriptscat/scriptcat/pull/1421)。其中 CodFrm 明确确认了 `同步删除`、`同步脚本删除`、`查询`，并建议将存储权限标题写为 `脚本正在尝试访问存储空间`。

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
| ScriptCat browser extension | `脚本猫扩展` | `welcome_title`, `ext_update_notification` | `扩展` 是浏览器 extension 的标准表达。 |
| generic user script | `用户脚本` | `script_list_content`, `allow_user_script_guide` | 泛指用户脚本能力或浏览器权限。 |
| ordinary userscript type | `普通脚本` | `create_user_script`, `script_list.sidebar.normal_script` | 表示当前产品中的普通脚本分类；不可与后台脚本或定时脚本合并。 |
| Tampermonkey compatibility | `油猴脚本` / `兼容 Tampermonkey 的用户脚本` | `docs/README_zh-CN.md`, `docs/ARCHITECTURE.md` | 仅在说明兼容性时使用，不把所有“用户脚本”泛称或“普通脚本”分类改写为油猴脚本。 |
| page script | `页面脚本` | `script_list_enable_content` | 表示页面运行概念；不能仅因分类标签使用“普通脚本”而删去，也不应未经界面确认便互相替换。 |
| background script | `后台脚本` | `create_background_script`, `background_script`, `enable_background.description` | 表示后台运行能力及脚本类型。 |
| scheduled script | `定时脚本` | `create_scheduled_script`, `scheduled_script`, `scheduled_script_description_title` | 表示按计划执行的脚本类型。 |
| ScriptCat script-browsing destination | `脚本站` / `脚本市场` | `script_gallery`, `script_list_title`, `script_list_content`, README | README 将指向 `https://scriptcat.org/search` 的入口称为 `脚本站`；引导界面的脚本发现与安装区域使用 `脚本市场`。按显示位置沿用名称，不自动互换。 |
| script synchronization | `脚本同步` | `script_sync`, `setting_sync_title`, `sync_status` | 与同步相关的功能名称沿用现行产品用语。 |
| deletion synchronization | `同步删除` / `同步脚本删除` | `sync_delete`, `notification.script_sync_delete`, `setting_sync_content` | CodFrm 在 PR #1421 中明确选择此写法；具体行为由右侧帮助说明解释，不在标签中扩写为 `删除状态`。 |
| script subscription | `订阅` / `脚本订阅` | `subscribe`, `subscribe_url`, `importpage.count_subscribes` | 对象为订阅，不使用英文式动词名词混写。 |

## B. 界面操作与状态标准表达

| 概念 | 优先使用 | 当前用例 key | 说明 |
| --- | --- | --- | --- |
| create | `新建` / `创建` | `create_script`, `create_background_script`, `source_local_script` | 新建按钮使用 `新建`；描述创建来源或过程时可用 `创建`。 |
| save / save as | `保存` / `另存为` | `save`, `save_as`, `save_success` | 与现行 UI 一致。 |
| import / export | `导入` / `导出` | `import`, `export`, `import_file`, `export_file` | 与现行 UI 和大陆技术产品习惯一致。 |
| install / update | `安装` / `更新` | `script`, `update_script`, `success` | 脚本与订阅均沿用同一动词。 |
| run / runtime | `运行` / `运行时` | `run`, `running`, `runtime`, `run_at` | 脚本执行及 runtime 语境使用现行表达。 |
| enable / disable | `开启` / `关闭`；状态或系统能力可用 `启用` / `禁用` | `enable`, `disable`, `enabled_label`, `sync_system_closed`, `enable_background.title` | 操作按钮与配置状态需按句子自然度决定，不机械互换。 |
| settings / configuration | `设置` / `配置` | `settings`, `script_setting`, `editor_config`, `user_config` | 产品设置页用 `设置`；配置对象或开发者配置使用 `配置`。 |
| connect / synchronization | `连接` / `同步` | `connect`, `connection_success`, `script_sync`, `sync_system_connect_failed` | 分别表示网络或服务连接、数据同步。 |
| restore / reset | `恢复` / `重置` | `restore`, `restore_default_values`, `reset`, `editor_config_reset` | 恢复备份/默认值与重置操作应按实际行为区分。 |
| load / reload | `加载` / `重新加载` | `loading`, `loading_title`, `click_to_reload` | 与现行 UI 一致。 |
| directory | `目录` | `open_directory`, `open_backup_dir` | 文件系统操作的常用表达。 |
| tabs | `标签页` | `close_current_tab`, `close_other_tabs` | 指浏览器 tab 时使用完整的 `标签页`。 |
| log query | `查询` | `query`, `total_logs`, `filtered_logs`, `enter_filter_conditions` | CodFrm 在 PR #1421 中明确偏好 `查询`；日志筛选说明可继续使用 `筛选`。 |

## C. 需结合语境判断的词汇

| 概念 | 可用表达 | 判断标准 | 当前用例 key |
| --- | --- | --- | --- |
| local / cloud | `本地` / `云端` | 保存位置、导入来源与同步目的地使用现行成对表达。 | `local`, `cloud`, `source_local_script`, `tools_backup_content` |
| storage | `存储` / `储存` / `存储空间` | 当前权限标题和脚本数据文案使用 `储存` / `储存空间`，API 标签保留英文 `Storage API`；统一用词前需按 UI 语境单独审查。 | `storage_api`, `script_operation_title`, `script_storage`, `storage_error` |
| panel / console | `面板` / `控制台` | 操作面板使用 `面板`；开发者工具输出位置使用 `控制台`。 | `background_script_description`, `build_success_message` |
| source | `来源` / `安装来源` / `订阅源` | 依据是一般来源、安装出处还是提供订阅内容的源来选择。 | `source`, `importpage.col_source`, `source_subscribe_link` |
| permission / authorization | `权限` / `授权` | 能力类别与请求使用 `权限`；给予脚本访问权或已授权项使用 `授权`。 | `permission`, `request_permission`, `permission_management`, `confirm_delete_permission` |
| ordinary / normal script | `普通脚本` | 与后台脚本、定时脚本分开处理，不从一般“用户脚本”称呼推定分类。 | `create_user_script`, `script_list.sidebar.normal_script`, `script_list_enable_content` |
| match / exclude | `匹配` / `排除` | 用户可见文案保留 `@match` / `@exclude` 标识符并配以中文说明。 | `website_match`, `website_exclude`, `add_match`, `add_exclude` |

## D. 固定保留的技术词

| 英文概念 | 固定使用 | 当前用例 key | 理由 |
| --- | --- | --- | --- |
| expression | `表达式` | `value_export_expression`, `cookie_export_expression`, `expression_format_error` | 是脚本、条件与导出字段中一致且明确的开发术语。 |
| cron expression | `定时表达式` | `cron_invalid_expr`, `error_cron_invalid` | 当前界面对 cron 采用用户可理解的产品表述。 |
| regular expression | `正则表达式`；紧凑提示可写 `正则` | `search_regex` | 简体中文开发语境中的通用写法。 |
| watch file changes | `监听文件` / `停止监听` | `watch_file_description`, `watch_file`, `stop_watch_file` | 表达持续监听变化并触发更新的功能含义。 |
| metadata declaration | `声明` | `error_metadata_line_duplicated` | 对应 metadata declaration 的技术含义。 |
| storage API | `存储 API` | `storage_api` | API 名称应与开发文档和平台术语保持一致。 |
| ESLint / VSCode / Cookie / API | 保留原英文名称 | `enable_eslint`, `vscode_url`, `permission_cookie`, `storage_api` | 产品名与 API/平台名称不翻译。 |

## E. 后续审查项目

以下内容记录当前文案中需要确认或统一的地方。本规范的建立本身不要求同时修改 `*.json`。

| 对象 | 当前情况 | 建议方向 | 当前用例 key |
| --- | --- | --- | --- |
| `存储` / `储存` | 脚本数据、权限标题和迁移文案均使用 `储存` / `储存空间`，API 标签为英文 `Storage API`。 | 面向简体中文用户的新普通 storage 文案优先使用 `存储`；既有内容是否统一需单独确认。 | `storage_api`, `script_operation_title`, `script_storage`, `storage_error`, `migration_confirm_message` |
| browser tabs | 关闭操作使用 `标签页`，运行环境使用 `标签`。 | 若运行环境字段表示浏览器 tab，应改用 `所有标签页`、`普通标签页`、`隐身标签页`。 | `close_current_tab`, `script_run_env.all`, `script_run_env.normal-tabs`, `script_run_env.incognito-tabs` |
| script type boundaries | 界面同时存在 `普通脚本` 与一般称呼 `用户脚本`。 | 新文案不要把普通脚本、后台脚本和定时脚本合并为同一分类。 | `create_user_script`, `script_list.sidebar.normal_script`, `script_list_content` |
| UI spacing around Latin identifiers | 部分字符串写成 `API文档`、`ESLint规则`、`Cookie域`、`@connect标签`。 | 新增文案优先在中文与英文/标识符之间保留空格，既有内容应在单独审查中统一。 | `api_docs`, `eslint_rules`, `cookie_domain`, `confirm_operation_description` |

## 常用标准词

新增或修改简体中文文案时，在对应语境下可优先采用以下写法。

本表只规定 `zh-CN` 输出应使用的词语，不是简繁转换表，也不表示右栏词语在其所属 locale 中有误。右栏以 `zh-TW` 原写法显示，用于识别误混入简体中文文案的繁中界面词。例如浏览器 extension 在 `zh-CN` 中写为 `扩展`，在 `zh-TW` 中可规范地写为 `擴充功能`；两者是各自 locale 的完整术语，并非 `扩展` 到 `扩充` 的逐字替换。

| 在 `zh-CN` 中优先使用 | 不要混入 `zh-CN` 文案的 `zh-TW` 写法 |
| --- | --- |
| `导入` / `导出` | `匯入` / `匯出` |
| `文件` / `目录` | `檔案` / `資料夾` |
| `信息` | `資訊` |
| `设置`（产品选项）/ `配置`（配置内容） | `設定` |
| `支持` | `支援` |
| `搜索` | `搜尋` |
| `加载` | `載入` |
| `代码` / `源码` | `程式碼` |
| `账号` | `帳號` |
| `设备` | `裝置` |
| `网络` | `網路` |
| `服务器` | `伺服器` |
| `扩展`（浏览器 extension） | `擴充功能` |
| `鼠标` | `滑鼠` |
| `标签页`（浏览器 tab） | `分頁` |
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
