# CSP 规则管理功能规格

> 状态：目标规格，尚未在当前分支实现。最后核对日期：2026-07-17。
>
> 实现本规格前仍须遵守 [开发规范](../develop.md)、[设计系统](../design.md)、
> [测试规范](../references/develop-testing.md)、[翻译规范](../translation.md)和
> [真实扩展验证指南](../verification.md)。本文件只拥有 CSP 规则管理的产品、UX、技术合同与取舍。

## 0. 读者与规范性约定

本文件同时服务于实现者、测试作者、UI 审查者和发布审核者。除第 2 节“讨论结论”和第 14 节“决策记录”
只用于说明来源与理由外，其他章节都是第一版的目标合同。

- “必须”表示验收失败即不能合并；“应”表示实现应遵循，除非在代码评审中记录理由；“可以”表示非必需选项。
- “规则”表示用户看到并编辑的**逻辑规则**；“DNR 规则”表示浏览器中的
  `chrome.declarativeNetRequest.Rule`。一个逻辑规则不等于一个 DNR 规则。
- 本文件新增的路径、类型和 ID 都是计划内容，不代表当前分支已经存在。实现开始前必须重新核对路径和现有
  API；若代码形状已变化，先更新本文件或在实现计划中记录差异，再写代码。
- 本文件中的英文 UI 文案是翻译基准值，不是允许直接写入 JSX 的硬编码文本。所有用户可见文本必须按
  [翻译规范](../translation.md)加入对应 namespace，并在 8 个现有 locale 中提供值。

### 0.1 完成定义

CSP 规则管理只有同时满足以下条件才算完成：

1. 第 12.1 节的领域、持久化、编译、同步和并发测试通过。
2. 第 12.2 节的 UI 测试覆盖每个列出的状态和操作，且 `pnpm run lint`、`pnpm run typecheck` 与相关
   `pnpm test -- --run ...` 通过。
3. 第 12.3 节的 Chrome `>= 120`、Edge `>= 120` 和 Firefox `>= 136` 手动验证均完成；浏览器失败或
   未验证的项目必须在报告中标为未验证，不能用“应用成功”替代。
4. 所有代码路径、测试路径和本规格中的目标路径相互一致；实现后必须更新本文件的状态标记和
   `docs/verification.md` 所要求的验证记录。

## 1. 目标与成功定义

为遇到网页 CSP 阻止用户脚本开发或运行的用户，提供一个**由用户主动配置、按网站域名生效、可随时暂停**
的 CSP 响应头移除工具。

第一版成功必须同时满足：

1. 一般用户只需粘贴网址或输入域名，不需学习 DNR、正则表达式或 whistle pattern。
2. 规则以域名为单位，覆盖该域名的全部路径，SPA 使用 `history.pushState` 改变路径不会造成“看似应生效、
   实际未重新触发”的路径规则陷阱。
3. 默认不会影响任何网站；没有启用规则时，ScriptCat 不注册 CSP 修改规则。
4. 网站开发者或用户脚本作者不能通过 metadata 代用户开启此能力；只有扩展用户可在工具页配置。
5. 用户能看到生效范围、风险、应用失败状态，并能用总开关统一暂停/恢复全部 CSP 规则。
6. 数据模型允许一条逻辑规则包含多个域名，也允许一个域名出现在多条逻辑规则中。
7. 第一版只移除 CSP 相关响应头；今后只有出现实际需求时才增加新的 action，不预先做通用代理或改头工具。

主要回归用例来自 [issue #866](https://github.com/scriptscat/scriptcat/issues/866)：开发模式以网络方式加载的
脚本会受页面 CSP 阻止，单靠 `inject-into content` 无法解决网络层 CSP。

## 2. 讨论结论与优先级

本规格已核对 [PR #1264](https://github.com/scriptscat/scriptcat/pull/1264) 和
[PR #1348](https://github.com/scriptscat/scriptcat/pull/1348) 的 PR 描述、全部顶层评论、改动文件、
reviews 与 review threads；两份 PR 均没有 inline review thread 或已提交 review。发生冲突时，
以 cyfung1031 的较新意见为先。

| 讨论重点 | 决定 |
| --- | --- |
| [cyfung1031：不要像 Tampermonkey 只放一个“全局禁用 CSP”开关，用户要知道自己在做什么](https://github.com/scriptscat/scriptcat/pull/1264#issuecomment-3912226560) | 主界面采用域名规则清单；总开关只负责暂停/恢复现有规则，绝不代表“所有网站” |
| [cyfung1031：只在用户需要时加入域名；规则与是否存在适用脚本无关](https://github.com/scriptscat/scriptcat/pull/1264#issuecomment-3912230053) | 规则由用户手动创建；目标域名一旦匹配，即使该页没有脚本也会移除 CSP |
| [CodFrm 建议、cyfung1031 确认可支持 `*` 全部网站](https://github.com/scriptscat/scriptcat/pull/1264#issuecomment-4103877087) | 保留“所有网站”能力，但放在新增/编辑表单的“高级范围”中；启用时必须二次确认，不以裸 `*` 作为普通输入教学 |
| [boommanpro：可演进为修改响应头或插件转发](https://github.com/scriptscat/scriptcat/pull/1264#issuecomment-4229250344) | 第一版不做。action 使用可判别类型保留演进边界；新增 action 必须另写需求、冲突语义和审核说明 |
| [CodFrm：此功能低频，适合放在设置或 Tools](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4248998313) | 放入当前 Options 的“工具”页，沿用 `SettingsLayout`，不新增一级导航 |
| [cyfung1031：whistle 规则语法资料与 domain/subdomain 语义不清](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4259584654) | 不沿用 whistle pattern，不提供正则、路径、协议或 `* / ** / ***` 语法 |
| [cyfung1031：多数网站为 SPA，路径切换会让 URL 匹配产生误解](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4622331109) | 第一版只按整个域名匹配；所有路径自动包含 |
| [cyfung1031：一条规则应可含多个域名，一个域名也可对应多条规则](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4622331109) | 作为持久化模型和 CRUD 合同；编译 DNR 时可按 action 合并、去重 |
| [cyfung1031：功能过多可能影响产品定位与商店审核](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4622365783) | 不增加远程云控、通用代理、脚本声明或新权限；商店说明明确“用户本地、按网站、自行启用” |
| [CodFrm：此功能不需要新增权限](https://github.com/scriptscat/scriptcat/pull/1348#issuecomment-4623028317) | 保持当前 manifest 已有的 `declarativeNetRequest` 与 `<all_urls>`；不添加 PR #1348 提议的 `declarativeNetRequestWithHostAccess` |

## 3. 产品边界

### 3.1 第一版范围

- 工具页中的 CSP 规则设置区。
- CSP 规则的创建、编辑、删除、启用、禁用。
- 全部规则的总暂停/恢复。
- 一条 `domains` 规则包含 1–100 个规范化域名；最多保存 100 条逻辑规则，所有 `domains` 规则合计最多
  1,000 个不同规范化域名。`allSites` 规则不占用域名数量，但仍占用逻辑规则数量。
  这些是第一版明确上限，出现真实超限需求后再调整。
- 普通目标“域名及其所有子域名”，以及需要确认的高级目标“所有网站”。
- 域名/网址粘贴、规范化、去重和字段级错误提示。
- 将所有启用的“移除 CSP”逻辑规则编译为至多 1 条 DNR dynamic rule。
- Chrome/Edge 与仓库当前最低 Firefox 136 的实现和验证。
- 操作成功后明确提示：规则只影响后续网络响应，已打开页面需要重新加载。

上限在 service worker 中重新验证，而不是只在表单中验证。创建或编辑操作必须先规范化并去重，再以整个
候选 state 计算上限；超过任一上限时不得写入部分数据，也不得调用 DNR。编辑已有规则时，已有规则的域名先
从全局集合中移除，再加入候选规则的域名，避免把自己重复计算。

规则集合不排序、不拖动：新规则追加到 `rules` 数组，编辑和启停保持数组位置，删除移除该元素；列表按数组
顺序显示。域名 badge 按用户输入首次出现的顺序显示，compiler 为了确定性测试再按 ASCII 升序输出 DNR
`requestDomains`。

### 3.2 明确不做

- 不允许用户脚本用 metadata 或 API 新建、启用或扩宽规则。
- 不自动从脚本的 `@match`、`@include` 或当前运行页面生成规则。
- 不做 URL path、query、hash、协议、DNR `urlFilter`、正则或 whistle pattern 编辑器。
- 不做“匹配测试器”；域名规则无需另一个与浏览器实现可能漂移的匹配引擎。
- 不移除 `X-Frame-Options`，它不是 CSP，且会额外改变页面能否被嵌入。
- 不修改 CSP 为用户输入值，不做任意 request/response header 编辑。
- 不做优先级、拖动排序或冲突编辑器；第一版只有幂等的“移除同一组头”。
- 不做远程规则、云控、订阅、企业策略或服务器下发。
- 不自动刷新、关闭或重载用户标签页。
- 不承诺绕过 HTML `<meta http-equiv="Content-Security-Policy">`，也不承诺修改由页面 Service Worker /
  CacheStorage 直接生成、未经过网络栈的响应。
- 第一版不进入设置备份或云同步；这是高影响安全配置，日后若要导出，必须由用户显式选择并单独评审。
- 不迁移或猜测任何旧的 CSP 规则存储格式。第一版只接受第 7 节声明的 `schemaVersion: 1`；未来格式必须
  通过单独的迁移决定和回归测试加入。

## 4. 用户心智模型与文案

功能名称：

- 英文：`CSP rules`
- 简体中文：`CSP 规则`

工具卡说明应直接表达：

> Remove CSP response headers only from websites you choose. This weakens those websites' built-in protection.

简体中文语义：

> 只在你选择的网站移除 CSP 响应头。这会削弱这些网站原有的安全保护。

必须持续可见的事实：

- “域名规则覆盖所有路径，并包含其子域名。”
- “规则与脚本是否运行无关。”
- “保存、启用、禁用或暂停后，请重新加载受影响页面。”
- “某些网站会检查 CSP 是否存在；移除后可能拒绝工作，金融网站尤其应谨慎。”
- “移除 CSP 也会移除该响应头内的 Trusted Types 指令；不另设 Trusted Types 开关。”

不要使用“修复网站”“安全运行”“保证注入成功”等保证性文案。CSP 可能只是失败原因之一。

英文文案表中的句子是默认 locale 的基准文案；实现必须使用 `tools` namespace 的翻译 key，不得在
`CspRulesSection.tsx`、`CspRuleSheet.tsx` 或 toast 调用中直接写这些句子。错误详情分为可翻译的错误摘要和
可折叠的原始浏览器错误；原始错误只用于诊断，不作为翻译 key。

规则名称的默认值也必须由纯函数生成，避免不同页面生成不同结果：

- `domains` 目标：使用第一个规范化域名；若还有 `N` 个域名，追加 ` + N`，例如 3 个域名生成
  `github.com + 2`。
- `allSites` 目标：使用 `All websites` 的翻译值。
- 用户输入的名称 trim 后为空时才使用默认值；非空名称保留用户输入的大小写，最多 80 个 Unicode code
  points。默认名称在保存时按当前 locale 生成并持久化；之后渲染或切换 locale 不重新生成。名称不参与匹配。

## 5. 信息架构与交互

### 5.1 入口

在现有 `/tools` 页面新增一个 scroll-spy 分类和 `SettingCard`：

- 分类位置：数据迁移之后、开发工具之前。
- 分类和卡片 ID 固定为 `csp-rules`；在 `src/pages/options/routes/Tools/categories.ts` 注册分类，在
  `src/pages/options/routes/Tools/index.tsx` 按上述顺序渲染卡片。
- 分类图标：`ShieldOff`（lucide-react）。
- 不新增侧栏一级路由，不打开独立 1400px 横向表格，不使用已移除的 Arco `Drawer/Table/Form`。
- 复用 `SettingsLayout`、`SettingCard`、`SettingRow`、shadcn primitives、设计 token 和 `notify`。

### 5.2 卡片首屏

从上到下：

1. 标题“CSP rules”和风险帮助按钮。
2. 总开关“Run CSP rules”：
   - 默认为开；空规则时无网络效果。
   - 关闭只暂停，不改变每条规则自己的 enabled 状态。
   - 开启后恢复原先逐条状态。
3. 状态摘要：
   - 正常且只有域名目标：`3 active rules · 8 websites`；active rules 是 enabled 逻辑规则数，websites 是
     enabled 域名目标去重后的数量。
   - 正常且存在启用的 `allSites`：显示 active rules 数和 `All websites`，不得把所有网站伪装成一个域名。
   - 暂停：`Paused · 3 rules kept`；rules kept 是 enabled 逻辑规则数，包含 `allSites`。
   - 应用失败：红色错误状态、原始错误摘要和“Retry”按钮。
4. 主按钮“Add rule”。
5. 规则清单或空状态。

第一次加载保持卡片结构，用 `Skeleton` 显示摘要与 2 行占位；不可用空白卡片或只在控制台记录错误。

UI 必须按以下状态渲染，而不是通过“有没有数据”猜测状态：

| 状态 | 进入条件 | 必须显示 | 允许的操作 |
| --- | --- | --- | --- |
| loading | 首次请求尚未返回 | 卡片、摘要 Skeleton、2 行规则 Skeleton | 不提交操作 |
| applied | `apply.state === "applied"` | 规则和 active websites 摘要 | 全部 CRUD、启停、暂停/恢复 |
| paused | `masterEnabled === false` 且没有应用错误 | `Paused` 和保留的启用规则数量 | 可以编辑规则；不产生网络修改 |
| error | state 已保存但 DNR reconcile 失败 | 可翻译摘要、原始错误详情、`Retry`；注明浏览器可能仍使用上一 revision | 允许 Retry 和新的 CRUD；新请求完成前只禁用发起请求的控件 |
| load-error | 无法读取或 schema 不受支持 | 可操作错误和恢复说明 | 不显示可编辑规则，不伪造空状态 |

应用失败时仍显示已保存的逻辑 state，但不能显示“已应用”或“已暂停”。`Retry` 只重试 service worker
当前保存的 state，不从 UI 草稿重建 state；重新打开工具页必须再次从 service worker 读取。

### 5.3 规则清单

每条规则展示：

- 用户名称；未输入时由首个域名生成，例如 `github.com + 2`。
- 目标摘要：最多展示前 3 个域名 badge，其余显示 `+N`；所有网站规则显示 danger/warning 语义的
  `All websites` badge。
- action 固定显示 `Remove CSP`。
- enabled switch；切换期间只禁用当前 switch 并显示内联 loading。
- 更多菜单：Edit、Delete。删除使用行内 `popconfirm`。

桌面为同一卡片内的紧凑列表行；移动端改为单列小卡，不使用横向滚动表格。移动端 switch、菜单和主要按钮的
可点击区域不小于约 44px。首批显示 20 条，之后每次“Show more”再显示 20 条，避免 100 条上限把整个工具页
一次性撑开。

“Show more”只是 UI 的本地分页：一次 `getState` 返回完整逻辑规则数组，首次 `visibleCount = 20`，每次
点击增加 20，达到数组长度后隐藏按钮。删除后保留当前可见数量上限，不为了补齐数量发起第二次请求。

总开关关闭时，规则行的 enabled switch 仍反映每条规则自己的状态；用户仍可以编辑或启停单条规则，但
`masterEnabled === false` 时 compiler 必须输出空数组。所有网站规则从 disabled 变为 enabled 时，无论总开关
当前是否开启都必须确认，因为它可能在以后恢复总开关时生效。

空状态：

- 标题：`No CSP rules`
- 说明：`Add only the websites where a script is blocked by CSP.`
- CTA：`Add rule`

### 5.4 新增与编辑

使用响应式 shadcn `Sheet`；桌面从右侧打开，移动端占满可用宽度。字段顺序：

1. **Websites**（必填）
   - 接受以换行、逗号分隔的多个值。
   - 接受完整 HTTP(S) URL 或域名；完整 URL 只提取 hostname。
   - 每个合法值提交后成为可删除 badge。
   - 固定辅助文案：`All paths and subdomains are included.`
2. **Name**（可选，最多 80 字符）
   - 留空时保存阶段自动生成，不要求一般用户先理解“规则名称”。
3. **Enabled**（默认开）。
4. **Advanced scope**（折叠）
   - 选项 `All websites`；选择后隐藏普通域名输入。
   - 新建或编辑结果为启用的 `allSites` 规则时显示 `AlertDialog`，明确它会影响所有匹配的主框架和子框架
     网络响应；确认前不得提交 service worker。
   - 从 `allSites` 切回 `domains` 时必须重新提供至少一个域名；从 `domains` 切到 `allSites` 只清空表单草稿，
     Cancel 后仍恢复原规则。

底部固定 ActionBar：Cancel、Save rule。验证在 blur 与 submit 进行；一旦显示错误则实时重验。
保存失败保留所有输入。

重复域名：

- 同一条规则内自动去重。
- 域名已存在于另一规则时显示非阻塞提示并允许保存，以满足“一个域名对应多条规则”。

### 5.5 操作反馈

- CRUD 或 switch 不做未经确认的乐观成功；等待 service worker 返回应用结果。
- 完全成功：`Rule saved. Reload affected pages to apply it.`
- 逻辑状态已保存但 DNR 应用失败：
  `Rule saved, but browser rules could not be updated. Retry before relying on it.`
- 删除、停用、总暂停成功同样提示重新加载；现有 document 的 CSP 不会被追溯恢复。
- 总开关恢复时若存在启用的 `allSites` 规则，必须再次确认影响范围；确认取消时保持暂停状态。
- 保存、启用、禁用、删除或总开关操作在 service worker 返回前不得显示成功 toast 或先改写为成功状态。
- service worker 返回 apply error 时，toast 只能说明“已保存但未应用”，不能使用成功文案；表单在 storage error
  时保留输入，apply error 时关闭表单并显示规则已保存但未应用。

## 6. 域名语义

### 6.1 规范化

纯函数 `normalizeCspDomain(input)`：

1. trim 空白；单个输入 token 不得包含换行或逗号。
2. 以 `http://` 或 `https://` 开头的 token（scheme 比较不区分大小写）按完整 URL 解析：只取
   `URL.hostname`，忽略 path、query、hash 和合法端口，因此保存后的规则匹配该 hostname 的所有端口；出现
   username/password credentials 时拒绝。URL 的 scheme 必须是 HTTP(S)。
3. 不带 scheme 的 token 只能是裸 hostname：不接受 path、query、hash、端口、credentials 或 `//` 前缀。
   方括号包裹的 IPv6 是例外，允许其 canonical IPv6 形式。
4. 通过 WHATWG `URL` API 得到小写 ASCII hostname；IDN 存储为 punycode。移除末尾根域点，
   但不删除 IPv6 的方括号。
5. 普通 hostname 至少包含一个点；`localhost`、`abc123` 等单标签名称第一版拒绝。合法 IPv4 和规范 IPv6
   不受此条限制。
6. 拒绝空值、浏览器内部 URL、非法端口/hostname、普通输入中的 `*` 和 `*.example.com`。
7. 单个规范域名最长 253 个 ASCII 字符；超过时返回字段错误，不截断。

字段解析的确定顺序是：先按换行或逗号拆 token，再对每个 token trim、规范化、去重，最后执行数量上限。
空 token 忽略；如果用户输入非空文本后所有 token 都为空，返回“至少输入一个网站”的错误。规范化失败的
token 必须保留其字段位置，供 UI 就地标错；不得因为一个 token 失败而静默丢掉其他 token。

以下输入输出是第一版固定行为：

| 输入 | 结果 |
| --- | --- |
| `https://Example.com:8443/a?q=1#x` | `example.com` |
| `example.com.` | `example.com` |
| `https://user:pass@example.com/` | 拒绝 credentials |
| `*.example.com` | 拒绝，并提示输入 `example.com`；系统已自动包含子域名 |
| `example.com/path` | 拒绝裸 hostname 中的 path |
| `localhost` | 拒绝单标签 hostname |
| `https://[2001:db8::1]/` | `[2001:db8::1]` |

`*.example.com` 的错误提示必须说明：请输入 `example.com`，系统已自动包含子域名。

### 6.2 匹配

普通规则直接使用 DNR `requestDomains`。例如：

| 保存值 | 匹配 | 不匹配 |
| --- | --- | --- |
| `example.com` | `example.com`、`a.example.com`、`a.b.example.com` 的所有路径 | `example.net`、`notexample.com` |
| `www.example.com` | `www.example.com` 及其子域名 | 根域 `example.com`、兄弟域名 `api.example.com` |

“所有网站”在持久化模型中是明确的 `allSites` target，不存成普通域名 `*`。编译 DNR 时才转换成
`condition.urlFilter = "*"`；只有 compiler 可以生成这个值，表单不得把它当作普通域名传给 service。

## 7. 持久化模型

计划新增 `src/app/repo/csp_rule.ts`，以一个带版本的 state 作为 `Repo<T>` 实体，避免总开关与规则集合
分开写入造成逻辑状态撕裂。DAO 名称、prefix 和 key 也固定，避免后续实现各自选择 storage key：

```ts
export class CspRuleStateDAO extends Repo<CspRuleState> {
  constructor() {
    super("csp_rule");
  }

  getState(): Promise<CspRuleState | undefined> {
    return this.get("state");
  }

  saveState(state: CspRuleState): Promise<CspRuleState> {
    return this._save("state", state);
  }
}
```

因此唯一持久化 key 为 `csp_rule:state`。该 DAO 不得调用 `enableCache()`：保存后必须从 storage 重新读取，
否则无法验证写入结果。`_save` 的现有 Promise 只表示 callback 已返回，不表示没有
`chrome.runtime.lastError`；DAO 必须在写后重新读取并同时核对 `schemaVersion`、`revision` 和完整 state。

逻辑数据合同：

```ts
type CspRuleTarget =
  | { type: "domains"; domains: string[] }
  | { type: "allSites" };

type CspRuleAction = { type: "removeCspHeaders" };

type CspRule = {
  id: string;
  name: string;
  enabled: boolean;
  target: CspRuleTarget;
  action: CspRuleAction;
  createdAt: number;
  updatedAt: number;
};

type CspRuleState = {
  schemaVersion: 1;
  revision: number;
  masterEnabled: boolean;
  rules: CspRule[];
};
```

约束：

- 默认 state 固定为 `{ schemaVersion: 1, revision: 0, masterEnabled: true, rules: [] }`。storage 没有 key
  时按该默认值运行，但不为了读取而写入；第一次真实用户变更才持久化 revision `1`。
- 每次改变逻辑 state 的成功 mutation 使 revision 加 1；`retryApply` 不改变 revision；没有语义变化的
  mutation 不写 storage，也不调用 DNR。
- `createdAt` 和 `updatedAt` 是 Unix epoch milliseconds。创建时两者相同；编辑或启停只更新
  `updatedAt`；数组顺序按第 3 节规则保持。
- ID 使用仓库现有 UUID 工具，不引入新依赖。
- service worker 是唯一写入者；Options 只能经 message client 修改。客户端不得发送完整替换后的 state，只能发送
  第 8 节规定的操作和 patch。
- 保存前重新执行全部结构和域名验证；UI 验证不能作为信任边界。
- 保存失败或写后核对失败时，不调用 DNR，不更新 service 内存中的 confirmed state，并向 UI 返回
  `storage_write_failed`；编辑表单保留输入。若写入后 revision 已变化但读取不一致，必须把它视为失败并停止，
  不能再次盲写覆盖。
- `schemaVersion` 缺失、不是 `1`，或 state 结构无法通过完整校验时，不删除或覆盖原数据；先尝试仅移除 ID 2001，
  再向 UI 返回 `unsupported_schema`，并禁用 CRUD，直到未来版本提供明确迁移。未知数据不能伪装成默认空 state。

完整结构校验至少包括：schemaVersion、revision 非负整数、布尔字段类型、每条规则的 id/name/enabled/target/action
类型、时间戳为有限整数、域名已 canonicalize、规则及域名上限。state 中出现未知 action 或 target 必须拒绝。

action 采用可判别联合只是稳定的数据边界，不代表预先实现其他 action。日后新增 `setCspHeader` 或通用
header action 时，必须先定义同域冲突、优先级、商店说明、迁移和 UI；不能只向 union 加一个字符串。

## 8. 服务与 DNR 同步

### 8.1 模块职责

计划文件与单一职责：

| 计划文件 | 职责 |
| --- | --- |
| `src/app/repo/csp_rule.ts` | state 类型、默认值、读取与保存 |
| `src/pkg/utils/csp_domain.ts` | 域名规范化和验证纯函数 |
| `src/app/service/service_worker/csp_rule_compiler.ts` | 纯函数：state → owned DNR rules |
| `src/app/service/service_worker/csp_rule.ts` | CRUD、总开关、规则上限、保存后 reconcile |
| `src/app/service/service_worker/client.ts` | `CspRuleClient` |
| `src/pages/options/routes/Tools/sections/CspRulesSection.tsx` | 工具卡、清单、状态 |
| `src/pages/options/routes/Tools/sections/CspRuleSheet.tsx` | 新增/编辑表单 |

`ServiceWorkerManager` 创建 DAO、compiler/applier 与 service，按构造函数注入；service 不在方法内 `new` DAO。
建议的构造边界为 `CspRuleService(group, messageQueue, stateDAO, compiler, applier)`；具体参数名可按现有
代码风格调整，但每个依赖必须可在单元测试中替换。compiler 不得读取 storage 或调用 Chrome API，applier
不得修改逻辑 state。

所有 mutation 与随后的 reconcile 必须在 service 内串行执行，避免两个 Options 页面或快速连续操作互相覆盖。
串行队列必须覆盖“读取 confirmed state → 应用 patch → 验证/保存 → 重新读取 → compile → updateDynamicRules
→ 生成结果”的整个区间，不能只锁住 storage 写入。每个请求从队列执行时的 confirmed state 开始，不接受客户端
上传的完整 state。

### 8.1.1 Message/client contract

service 在 `this.api.group("cspRule")` 上注册以下方法；名称和参数形状固定，返回类型如下。`baseRevision` 是
客户端打开表单或读取列表时看到的 revision；除 `retryApply` 外所有 mutation 都必须携带它。

```ts
type CspRuleTargetInput =
  | { type: "domains"; domains: string[] }
  | { type: "allSites" };

type CspRuleCreateInput = {
  baseRevision: number;
  name?: string;
  enabled: boolean;
  target: CspRuleTargetInput;
};

type CspRuleUpdateInput = {
  baseRevision: number;
  id: string;
  patch: Partial<Pick<CspRule, "name" | "target">>;
};

type CspRuleEnabledInput = { baseRevision: number; id: string; enabled: boolean };
type CspRuleDeleteInput = { baseRevision: number; id: string };
type CspMasterEnabledInput = { baseRevision: number; enabled: boolean };

type CspRuleSnapshot = { state: CspRuleState; apply: CspApplyStatus };
type CspMutationResult = CspRuleSnapshot & { outcome: "applied" | "apply-error" };
```

| method | input | behavior |
| --- | --- | --- |
| `getState` | none | 返回当前 snapshot；service 初始化未完成前等待初始化结果，不返回空 state |
| `createRule` | `CspRuleCreateInput` | 校验、追加一条规则、保存并 reconcile |
| `updateRule` | `CspRuleUpdateInput` | 只修改指定规则的 name/target；patch 为空拒绝，enabled 用单独方法 |
| `deleteRule` | `CspRuleDeleteInput` | 删除指定 id；id 不存在返回 `not_found`，不得删除其他规则 |
| `setRuleEnabled` | `CspRuleEnabledInput` | 只修改指定规则 enabled；目标为 `allSites` 且由 off 变 on 时必须先由 UI 确认 |
| `setMasterEnabled` | `CspMasterEnabledInput` | 只修改总开关；从 off 变 on 且有启用的 `allSites` 规则时，UI 必须先确认 |
| `retryApply` | none | 对当前已保存 state 重新 reconcile，不改变 revision |

`updateRule.patch` 只允许包含 `name` 和 `target`；字段出现时值必须完整且非 `undefined`，`target` 必须整体
替换为一个已验证的 `domains` 或 `allSites` target。客户端不得通过空 patch、部分 domains 数组或隐藏字段
修改 `id`、`enabled`、`action`、时间戳或数组顺序。

`CspRuleClient` 放在现有 `src/app/service/service_worker/client.ts`，继承 `Client` 并使用 prefix
`"serviceWorker/cspRule"`；Options 通过现有 global `message` 建立它，不直接构造 `Server` 或访问 Chrome
storage/DNR。service worker 的 `Server` prefix 当前为 `"serviceWorker"`，因此上述 group 名称最终对应这些
message actions。

如果请求的 `baseRevision` 不等于队列执行时的 revision，返回 `revision_conflict` 和当前 snapshot，不写入、不
调用 DNR；UI 必须重新读取并提示用户未覆盖其他页面的修改。service 仍必须在执行前后复核 revision，因为
客户端检查不是信任边界。

service 错误必须保持可序列化并包含稳定 `code`，至少包括 `invalid_input`、`not_found`、`revision_conflict`、
`storage_write_failed` 和 `unsupported_schema`；字段错误额外包含 `path` 与 `messageKey`。当前 message server
会把对象错误序列化为字符串，因此 `CspRuleClient` 必须解析这些 payload，而不能按英文错误文本分支。若实现
发现当前 transport 无法保留这些字段，必须先扩展 transport 并为其添加测试，再接入 UI。
`CspRuleService` 通过 `Group.on(...)` 注册：

- `getState`
- `createRule`
- `updateRule`
- `deleteRule`
- `setRuleEnabled`
- `setMasterEnabled`
- `retryApply`

每个变更接口返回最新 state 和：

```ts
type CspApplyStatus =
  | { state: "applied"; revision: number; appliedAt: number }
  | {
      state: "error";
      code: "dnr_apply_failed";
      desiredRevision: number;
      lastAppliedRevision?: number;
      message: string;
    };
```

`applied` 表示 DNR 中 ID 2001 的实际内容等于 `compileCspRules(state)`；`error` 表示逻辑 state 已保存但 DNR
内容未知或仍是上一 revision。`lastAppliedRevision` 只填写 service 明确成功应用过的 revision；首次应用失败
或无法确认已有规则时省略，不能猜测。apply status 是内存状态，不写入 `csp_rule:state`；service 重启后必须
重新 reconcile。

service 每次成功保存后，以及 DNR 应用失败后，都通过 `IMessageQueue.publish` 发布同一个最新 snapshot，topic
固定为 `cspRule/stateChanged`。Options 端的 `CspRuleClient` 订阅该 topic，收到新 revision 后替换列表；较旧
revision 的事件必须丢弃。请求响应和广播都使用相同 snapshot，避免两个 Options 页面展示不同的 apply status。

### 8.2 DNR 编译

第一版固定移除以下 response headers：

- `content-security-policy`
- `content-security-policy-report-only`
- `x-content-security-policy`
- `x-webkit-csp`

仅匹配 `main_frame` 与 `sub_frame`。

编译步骤：

1. `masterEnabled === false` 或没有 enabled 规则：产出空数组。
2. 任一 enabled rule 为 `allSites`：产出 1 条 `urlFilter: "*"` 规则。
3. 否则合并所有 enabled `domains`，去重并按 ASCII 升序后产出 1 条 `requestDomains` 规则。
4. 两种非空结果都必须完全符合以下 shape；`responseHeaders` 而不是 `requestHeaders` 是固定合同：

   ```ts
   {
     id: 2001,
     priority: 1,
     action: {
       type: "modifyHeaders",
       responseHeaders: [
         { header: "content-security-policy", operation: "remove" },
         { header: "content-security-policy-report-only", operation: "remove" },
         { header: "x-content-security-policy", operation: "remove" },
         { header: "x-webkit-csp", operation: "remove" },
       ],
     },
     condition: {
       resourceTypes: ["main_frame", "sub_frame"],
       // domains target: requestDomains: ["example.com", ...]
       // allSites target: urlFilter: "*"
     },
   }
   ```

5. 不生成 regex，不暴露 priority；priority 固定为 `1`。compiler 必须是纯函数，并对等价 state 产生稳定的
   深相等结果；第一版只有一个幂等 action。

脚本安装流程当前使用 dynamic rule ID `1`（初始化清理）和失败回退时的 ID `2`，详见
[`src/app/service/service_worker/script.ts`](../../src/app/service/service_worker/script.ts)。CSP 第一版只拥有
dynamic rule ID `2001`；该 ID 必须定义为单一常量，不能散落为 magic number：

```ts
await chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [2001],
  addRules: compiledRules,
});
```

即使 `compiledRules` 为空，也只允许调用 `{ removeRuleIds: [2001], addRules: [] }` 清理本功能的旧规则；不得按
范围清理，也不得移除其他模块的 dynamic rules。必须同时处理 Promise rejection 和 callback 中的
`chrome.runtime.lastError`，并在错误时保留已有 DNR 规则。官方 API 保证同一次 `updateDynamicRules` 的
remove/add 原子执行；失败时现有 DNR 保持不变。

### 8.3 状态一致性

逻辑 state 是用户意图的唯一来源，DNR 是可重建派生状态：

1. 先验证新 state；
2. 保存并重新读取相同 revision；若核对失败，停止且不调用 DNR，UI 显示“未保存”；
3. compiler 从已确认保存的 state 重建全部 owned rules；
4. 单次原子调用替换 ID 2001；
5. 成功返回 `applied`；
6. DNR 失败不吞异常、不谎报成功，返回 desired/last-applied revision 的 `error` 并保留“Retry”；总暂停失败时
   不得显示“已暂停”，而要明确浏览器仍可能运行上一 revision。`error` 中的 `desiredRevision` 必须等于
   已确认写入的 state revision；
7. service worker 初始化必须在注册 `cspRule/*` handlers 后完成一次 load/reconcile。初始化成功前，handler 等待
   同一个 `ready` Promise；初始化失败则所有请求得到可见的 `unsupported_schema` 或 `storage_write_failed`，
   不返回默认空 state。一并修复扩展升级或浏览器重启后遗留、缺失或内容不一致的 ID 2001。

如果 service worker 启动时没有 `csp_rule:state`，先使用默认 state 编译为空数组并清理 ID 2001；清理失败必须
显示 apply error，因为旧的 CSP 修改规则可能仍然生效。若 state 已有 `masterEnabled: false` 或没有启用规则，
成功 reconcile 的结果仍是 `applied`（revision 对应空 DNR），不是一个特殊的 paused apply error。

这个顺序接受“state 已保存、DNR 暂未应用”的短暂状态，代价是 UI 必须持续显示错误。它避免更复杂且仍可能
二次失败的跨 `chrome.storage` / DNR 伪事务回滚。

## 9. 平台、权限与审核

当前 [`src/manifest.json`](../../src/manifest.json) 已包含：

- `declarativeNetRequest`
- `host_permissions: ["<all_urls>"]`

因此第一版不新增权限，也不加入 `declarativeNetRequestWithHostAccess`。功能必须完全由包内代码和本地用户规则
决定，不获取远程逻辑或远程规则。实现必须不扩大 `host_permissions`，并在 manifest 未包含这两项能力时让构建
或启动检查明确失败，而不是静默显示“已应用”。

浏览器构建目标以 [`rspack.config.ts`](../../rspack.config.ts) 为准：Chrome `>= 120`、Edge `>= 120`、Firefox
`>= 136`。本规格中的“当前目标浏览器”均指这三个目标，不得用开发者本机的更高版本替代矩阵中的验证。

平台依据：

- [Chrome DNR API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)：
  `requestDomains` 自动匹配列出域名的子域名；dynamic rule 更新是原子的；`modifyHeaders` 属于最多
  5,000 条的 unsafe dynamic rules，而本功能第一版固定只用 1 条。
- [MDN DNR RuleCondition](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/RuleCondition)：
  canonical domain 应为小写 ASCII，IDN 使用 punycode。
- [MDN updateDynamicRules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/updateDynamicRules)：
  Firefox 128 起 dynamic/session 上限分离；仓库打包最低 Firefox 136。
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies)：
  提交代码应让审核者清楚辨认全部功能。因此商店说明、截图和审核备注必须明确本地按域名移除 CSP 的行为。

## 10. SPA 与生命周期语义

- CSP 来自主文档或子文档的网络响应。规则在该响应进入渲染引擎前移除 response header；第一版只匹配
  `main_frame` 和 `sub_frame`，不匹配 script、xhr、image 等子资源响应。
- 同 document 内的 `pushState` / `replaceState` 不会重新请求主 document；因第一版按域名而非 path，
  UI 不会出现“地址变了所以规则该重新匹配”的误导。
- 跨域导航或实际 reload 会产生新的 document request，并按新请求域名匹配。
- 对已加载页面新增/停用规则不会追溯改变现有 document 或子文档；必须 reload 或触发新的 document request。
- `history.pushState` / `replaceState` 只改变当前 document 的 URL，不会因为 path 改变而重新应用或撤销同一域名
  的规则；跨域的实际导航才按新请求重新匹配。
- 规则对匹配域名生效，不检查是否存在 ScriptCat 脚本。这是设计，不是缺陷。

## 11. 状态、安全与无障碍要求

- Light、dark 两主题都只能使用 design tokens；不写 raw palette/hex 或 inline color。
- 首次加载、空、应用中、应用失败、成功反馈全部可见。
- 错误显示可操作摘要；原始错误放 `font-mono` 详情，不只写 console。
- 所有 icon-only 按钮有 `aria-label`；自定义交互有 keyboard focus ring。
- Switch 同时有文字状态，不能只靠颜色表示启用。
- Sheet 使用 Radix 的 focus trap、Esc 和 return-focus。
- 异步摘要使用 `role="status"`；应用进度使用 `role="progressbar"` 或按钮内 `Loader2`。
- 移动端主要 tap target 不小于约 44px；德语/俄语等长文案可换行，不裁切。
- 所有网站范围用文字、图标和语义色三重提示，满足非颜色线索要求。

## 12. 验收标准

### 12.0 测试边界与文件归属

按职责放置测试，避免把 service、compiler 和 UI 的失败混在一个大 mock 中：

| 目标 | 计划测试文件 | 必须隔离的依赖 |
| --- | --- | --- |
| 规范化与 token 解析 | `src/pkg/utils/csp_domain.test.ts` | 只使用纯函数，不依赖 Chrome |
| DAO 默认值、round-trip、schema 校验 | `src/app/repo/csp_rule.test.ts` | 使用现有 storage mock，并模拟 `runtime.lastError` |
| state → DNR rule | `src/app/service/service_worker/csp_rule_compiler.test.ts` | 不调用 Chrome API，深相等断言完整 rule shape |
| mutation、队列、reconcile、错误 | `src/app/service/service_worker/csp_rule.test.ts` | 注入 fake DAO/compiler/applier/message queue |
| 工具卡和表单 | `src/pages/options/routes/Tools/sections/CspRulesSection.test.tsx`、`src/pages/options/routes/Tools/sections/CspRuleSheet.test.tsx` | 注入 `CspRuleClient`，不访问真实 service worker |

当前 Chrome mock 只覆盖 session 规则；实现 CSP 测试时先扩展 mock 的最小
`updateDynamicRules`/`getDynamicRules` 能力并覆盖原子失败行为。不要为了 CSP 测试直接改写现有脚本安装规则的
测试。applier 测试必须证明：失败时 remove/add 都不生效，成功时只改变 ID 2001。

### 12.1 领域与编译单元测试

测试名称遵守仓库中文 BDD 风格，至少覆盖：

- `输入完整网址时只保存规范化 hostname`
- `输入 IDN 时保存 punycode 并可由 requestDomains 使用`
- `输入星号和单标签 hostname 时给出明确错误`
- `同一规则的重复域名被去重`
- `规则数、单规则域名数和全局不同域名数超过第一版上限时拒绝保存`
- `多个规则的域名合并为一条 DNR 规则`
- `同一域名出现在多条规则时仍只编译一次`
- `存在所有网站规则时编译为 urlFilter 星号`
- `总开关关闭时编译为空规则`
- `编译结果只生成 ID 2001、priority 1、modifyHeaders responseHeaders 四个 CSP 头且只匹配 main_frame/sub_frame`
- `更新只拥有 ID 2001 且不会移除脚本安装 dynamic rule ID 2`
- `DNR 更新失败时保存 state 并返回可重试错误`
- `storage 写后 revision 核对失败时不调用 DNR`
- `并发 mutation 按保存与 reconcile 的完整顺序串行执行`
- `未知 schema 保留数据并移除 owned DNR rule`
- `service worker 初始化时按持久化 state 重建规则`
- `缺失 storage key 时使用 revision 0 默认 state 且不写入 storage`
- `写后重新读取的完整 state 与候选 state 不一致时返回 storage error 且不调用 DNR`
- `baseRevision 过期时返回 revision conflict 且不覆盖其他页面的修改`
- `retryApply 使用当前已保存 state 且不增加 revision`
- `应用失败后 lastAppliedRevision 只记录明确成功的上一 revision`
- `较旧的 stateChanged 广播不会覆盖较新的 UI state`

### 12.2 UI 组件测试

- 首次加载显示 skeleton，失败显示错误与 Retry。
- 空状态 CTA 打开新增 Sheet。
- 粘贴完整 URL 后显示规范化域名 badge 和“包含子域名”说明。
- blur/submit 错误就地显示；保存失败不清空表单。
- 桌面规则行与移动规则卡都能启用、编辑、删除。
- 第 21 条起由“Show more”逐批显示，每批 20 条。
- 所有网站启用、以及恢复包含所有网站规则的总开关，都出现明确确认。
- 成功、部分失败都显示正确 toast；成功文案提醒 reload。
- 两主题与 390px 宽度不出现横向滚动、遮挡或低于要求的主要 tap target。
- 总开关暂停时逐条 enabled 状态保持可见；恢复包含启用 `allSites` 规则时取消确认不会改变 state。
- revision conflict、storage error、unsupported schema 都显示可翻译的可操作错误，不按英文错误文本分支。

### 12.3 真实扩展验证

按 [verification.md](../verification.md) 使用一次性本地 HTTP fixture，不把 scratch 脚本提交进测试套件：

1. fixture 返回含 `Content-Security-Policy` 的 HTML，证明没有规则时 `eval/new Function` 被阻止。
2. 在工具页为该 hostname 新增规则，reload 后证明 header 已移除且测试代码可执行。
3. 在同一 document 执行 `history.pushState` 到另一 path，证明用户不需新增路径规则。
4. 停用规则或总暂停，reload 后证明 CSP 恢复。
5. 页面没有任何 ScriptCat 脚本时，证明 header 仍按域名规则移除。
6. `<meta http-equiv="Content-Security-Policy">` fixture 仍受限制，并与帮助文案一致。
7. Chrome/Edge 当前目标版本与 Firefox 136+ 各跑一次；Firefox 重启后规则仍按持久化 state reconcile。
8. 在 light/dark、桌面与 390px 移动视口各检查一次核心流程和 keyboard focus。

DNR 故意失败的“已保存但未应用”路径由第 12.1 节的注入 applier 测试和第 12.2 节的 UI 测试证明；真实
浏览器验证不添加生产环境故障开关。若浏览器手动验证无法观察到该路径，报告必须注明该限制，而不是声称已
完成真实扩展验证。

## 13. 实施顺序与安全暂停点

1. **模型与规范化**：先写失败测试，再实现 `CspRuleStateDAO` 与 `normalizeCspDomain`；验收默认 state、
   round-trip、所有输入边界和 1–100/1,000 上限。此步不注册 service handler，不改变浏览行为。
2. **compiler 与 DNR applier**：先写 ID 所有权、完整 rule shape、合并、空规则、原子失败测试；实现后仍无
   service worker 入口，默认空 state 不改变浏览行为。
3. **service 与 client**：构造函数注入 DAO/compiler/applier/queue，注册 Group methods；验证初始化 reconcile、
   baseRevision 冲突、所有 CRUD、apply error、Retry 和 stateChanged 广播。
4. **工具卡只读状态**：接入 `SettingsLayout` 分类、loading/applied/paused/error/load-error，不开放写操作；
   此步结束可从真实 service worker 读取默认空 state。
5. **新增/编辑/启停/删除**：逐个交付并各自补 UI 测试；任何步骤结束都保持可构建、可测试，失败时不产生
   未确认的成功反馈。
6. **所有网站高级范围**：最后加入 `allSites` 持久化、确认门槛、恢复总开关确认和回归测试，避免高风险能力
   先于安全文案落地。
7. **i18n 与真实扩展验证**：按翻译规范把新增 key 写入 8 个现有 locale 的 `tools` namespace，运行
   `pnpm run lint`、`pnpm run typecheck`、相关 Vitest，再按验证指南跑浏览器矩阵；不要把“新增 locale”误写成
   “补齐 locale”。
8. **商店与发布说明**：明确用户主动、按域名、本地规则、会削弱 CSP；附 UI 截图、不新增权限的说明，并在
   发布前重新核对本规格的 shipped/target 状态。

## 14. 决策记录

### D1. 域名优先，拒绝第一版 URL pattern

触发：PR #1348 的路径/whistle pattern 方案遇到 SPA URL 变化和 domain/subdomain 语义不清。
根因是结构性的：CSP 绑定 document 响应，而不是 SPA 当前显示的 path。选择 canonical domain +
`requestDomains`，拒绝自建 pattern matcher，代价是第一版不能只对某个 path 生效。由域名规范化测试、
compiler 测试与 SPA fixture 强制。

### D2. 总开关只暂停规则，不代表全局移除

触发：cyfung1031 明确反对 Tampermonkey 式单一全局开关，同时又要求能快速停止规则。
选择“总暂停 + 域名清单”；拒绝首屏“Disable CSP everywhere”，代价是第一次使用多一步添加网站。
所有网站能力留在高级范围并二次确认。

### D3. 逻辑规则与 DNR 规则分离

触发：一条规则需支持多域名、同一域名可属于多规则，而浏览器规则配额和 ID 属于全扩展共享资源。
选择保存用户可理解的逻辑规则，再按 action 合并为至多 1 条 owned DNR rule；拒绝一条逻辑规则直接映射
一条 DNR rule，代价是 UI 不能把浏览器 rule ID 当作用户规则 ID。由 ID 2001 所有权和合并测试强制。

### D4. 第一版只移除 CSP 头

触发：讨论提出 modify header、插件转发和云控，但同时担忧产品定位与审核。
选择固定 `removeCspHeaders`，拒绝通用 header 工具、远程规则和优先级 UI，代价是后续 action 需要新的
spec 与迁移。这样保持功能可辨认、权限不扩张，也符合“按实际需要扩充”。

### D5. 保存用户意图，显式暴露 DNR 应用失败

触发：storage 与 DNR 没有跨 API 事务，PR #1348 的 catch/log 会造成 UI 误以为规则已生效。
选择 state 先保存、DNR 后 reconcile、失败持续可见且可 Retry；拒绝吞错或复杂回滚，代价是允许一个明确标记的
“已保存但未应用”状态。service worker 初始化会自动重试。

### D6. Message 只提交操作，使用 revision 防止多页面覆盖

触发：两个 Options 页面或快速连续操作可能基于不同列表快照提交完整 state，后写入的请求会静默覆盖前一个
页面的规则。根因是消息 transport 只负责传输，不提供 state merge 或并发控制。选择 service worker 内串行
执行操作、以 `baseRevision` 拒绝过期请求，并通过 `cspRule/stateChanged` 广播最新 snapshot；拒绝让 client
上传完整 state 后由 service 猜测如何合并，代价是过期表单需要重新读取并由用户重试。这个约束由 service
mutation、revision conflict 和旧广播丢弃测试强制。
