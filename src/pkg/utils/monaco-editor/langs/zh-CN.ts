const grantValuePrompts = {
  none: "不申请特殊 GM API 权限，脚本会以接近普通页面脚本的方式运行。",
  unsafeWindow: "访问页面自身的 window 对象，用于和网页原生脚本交互。",
  GM_getValue: "读取脚本持久化存储中的单个值。",
  GM_getValues: "批量读取脚本持久化存储中的多个值。",
  GM_setValue: "写入脚本持久化存储中的单个值。",
  GM_setValues: "批量写入脚本持久化存储中的多个值。",
  GM_deleteValue: "删除脚本持久化存储中的单个值。",
  GM_deleteValues: "批量删除脚本持久化存储中的多个值。",
  GM_listValues: "列出脚本持久化存储中的所有键名。",
  GM_addValueChangeListener: "监听脚本存储值的变化。",
  GM_removeValueChangeListener: "移除脚本存储值变化监听器。",
  GM_xmlhttpRequest: "发起跨域网络请求；请求目标通常需要配合 @connect 声明允许的域名。",
  GM_download:
    "下载文件。支持传入 URL 和文件名，或传入包含 url、name、headers、saveAs 等字段的详情对象，并返回可 abort 的句柄。",
  GM_openInTab: "打开新标签页，并可控制前后台打开等选项。",
  GM_closeInTab: "关闭由脚本打开或管理的标签页。",
  GM_getTab: "读取当前标签页关联的临时数据。",
  GM_saveTab: "保存当前标签页关联的临时数据。",
  GM_getTabs: "读取脚本保存的所有标签页临时数据。",
  GM_notification: "显示浏览器通知，并可处理点击、关闭等回调。",
  GM_closeNotification: "关闭指定的脚本通知。",
  GM_updateNotification: "更新指定的脚本通知内容。",
  GM_setClipboard: "写入系统剪贴板。",
  GM_registerMenuCommand: "注册脚本菜单命令。",
  GM_unregisterMenuCommand: "取消注册脚本菜单命令。",
  CAT_registerMenuInput: "ScriptCat 扩展 API：注册带输入框的脚本菜单命令。",
  CAT_unregisterMenuInput: "ScriptCat 扩展 API：取消注册带输入框的脚本菜单命令。",
  GM_addStyle: "向页面注入 CSS 样式。",
  GM_addElement: "向页面创建并插入元素。",
  GM_getResourceText: "读取 @resource 声明资源的文本内容。",
  GM_getResourceURL: "获取 @resource 声明资源的 URL。",
  GM_cookie: "访问 Cookie API，用于读取、写入或删除 Cookie。",
  CAT_fetchBlob: "ScriptCat 内部扩展 API：读取扩展侧可访问资源并返回 Blob。",
  CAT_fileStorage: "ScriptCat 扩展 API：访问脚本文件存储能力。",
  CAT_userConfig: "ScriptCat 扩展 API：访问脚本用户配置。",
  CAT_scriptLoaded: "ScriptCat 扩展 API：在 @early-start 场景下等待脚本完整加载完成。",
  "window.close": "允许脚本调用 window.close()。",
  "window.focus": "允许脚本调用 window.focus()。",
  "window.onurlchange": "允许脚本监听 URL 变化事件。",
} as const;

export default {
  title: "简体中文",
  thisIsAUserScript: "一个用户脚本",
  undefinedPrompt: "未定义的提示符",
  quickfix: "修复 {0} 问题",
  addEslintDisableNextLine: "添加 eslint-disable-next-line 注释",
  addEslintDisable: "添加 eslint-disable 注释",
  declareGlobal: "将 '{0}' 声明为全局变量 (/* global */)",
  removeConnectWildcard: "移除 @connect 通配符，改为 {0}",
  replaceMatchTldWildcardWithInclude: "将 @match 顶级域名通配符改为 @include {0}",
  replaceIncludeWithMatch: "将 @include 改为 @match {0}",
  grantConflict: "@grant none 不能和 GM API 同时使用；请移除 none 或所有 GM API。",
  grantValuePrompts,
  prompt: {
    name: "脚本名称",
    namespace: "脚本命名空间",
    copyright: "脚本的版权信息",
    license: "脚本的开源协议",
    version: "脚本版本",
    description: "脚本描述",
    icon: "脚本图标",
    iconURL: "脚本图标",
    defaulticon: "脚本图标",
    icon64: "64x64 大小的脚本图标",
    icon64URL: "64x64 大小的脚本图标",
    grant: "脚本特殊 Api 权限申请",
    author: "脚本作者",
    "run-at":
      "脚本的运行时间<br>`document-start`：在前端匹配到网址后，以最快的速度注入脚本到页面中<br>`document-end`：DOM 加载完成后注入脚本，此时页面脚本和图像等资源可能仍在加载<br>`document-idle`：所有内容加载完成后注入脚本<br>`document-body`：脚本只会在页面中有 body 元素时才会注入",
    "run-in": "脚本注入的环境",
    homepage: "脚本主页",
    homepageURL: "脚本主页",
    website: "脚本主页",
    background: "后台脚本",
    include: "脚本匹配 url 运行的页面",
    match: "脚本匹配 url 运行的页面",
    exclude: "脚本匹配 url 不运行的页面",
    connect: "获取网站的访问权限",
    resource: "引入资源文件",
    require: "引入外部 js 文件",
    "require-css": "引入外部 css 文件",
    noframes: "表示脚本不运行在 `<frame>` 中",
    compatible: "用于在 GreasyFork 中显示脚本的兼容性支持",
    "inject-into":
      "脚本注入环境<br>`content`：脚本注入到 content 环境<br>`page`：脚本注入到网页环境（默认）<br>注：SC 不支持以 CSP 判断是否需要脚本注入到 content 环境的 `inject-into: auto` 设计。",
    "early-start":
      "配合 `run-at: document-start` 的声明，使用 `early-start` 可以比网页更快地加载并执行脚本，但存在一定性能问题与 GM API 使用限制。（SC 独有）",
    unwrap:
      "让用户脚本不经过沙箱封装，直接注入并运行在页面的原生全局作用域中。<br>脚本可直接访问和修改页面真实的全局变量，但将无法使用 GM.* 等用户脚本特权 API。<br>常用于需要与页面原生脚本深度交互或从普通页面脚本迁移的场景。",
    definition: "ScriptCat 特有功能：一个 `.d.ts` 文件的引用地址，能够自动补全编辑器的提示",
    // https://bbs.tampermonkey.net.cn/thread-3036-1-1.html#%40antifeature%E8%A7%84%E5%88%99
    antifeature: `与脚本市场有关，不受欢迎的功能需要加上此描述值
referral-link：该脚本会修改或重定向到作者的返佣链接
ads：该脚本会在访问的页面上插入广告
payment：该脚本需要付费才能够正常使用
miner：该脚本存在利用用户资源但不为用户产生收益或收益极其微弱的行为
membership：该脚本需要注册会员/关注公众号才能正常使用
tracking：该脚本会追踪你的用户信息`.replace(/\n/g, "<br>"),
    updateURL: "脚本检查更新的 url",
    downloadURL: "脚本更新的下载地址",
    supportURL: "支持站点、bug 反馈页面",
    source: "脚本源码页",
    scriptUrl: "订阅脚本中引用的用户脚本地址",
    storageName: "脚本值存储空间名称，用于让多个脚本共享同一个存储空间",
    tag: "脚本标签，多个标签可用逗号或空格分隔",
    cloudCat: "标记脚本支持导出为 CloudCat 云端脚本包",
    cloudServer: "脚本使用的 CloudCat 云端服务",
    exportValue: "导出为云端脚本时需要导出的脚本存储值",
    exportCookie: "导出为云端脚本时需要导出的 Cookie",
    crontab: `定时脚本 crontab 参考（不适用于云端脚本）
* * * * * * 每秒运行一次
* * * * * 每分钟运行一次
0 */6 * * * 每 6 小时的 0 分执行一次
15 */6 * * * 每 6 小时的 15 分执行一次
* once * * * 每小时运行一次
* * once * * 每天运行一次
* 10 once * * 每天 10:00-10:59 运行一次，若 10:04 已运行，本日 10:05-10:59 不再运行
* 1,3,5 once * * 每天 1/3/5 点运行一次，若 1 点已运行，当天 3、5 点不再运行
* */4 once * * 每隔 4 小时检测并运行一次，若 4 点已运行，当天 8/12/16/20/24 点不再运行
* 10-23 once * * 每天 10:00-23:59 运行一次，若 10:04 已运行，当日 10:05-23:59 不再运行
* once 13 * * 每个月 13 号的每小时运行一次
* once(9-17) * * * 每天 9 时至 17 时期间，每小时执行一次
0,30 once * * * 每小时在 0 分或 30 分中最早命中的那次执行，本小时不再重复
* * once(9-18) * * 每月 9 号至 18 号期间，每天执行一次
* * * * once(1-5) 每周一至周五期间，每周执行一次`.replace(/\n/g, "<br>"),
  },
} as const;
