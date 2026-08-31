/**
 * declarativeNetRequest 规则 ID 与 priority 的全仓登记表。
 *
 * 动态规则与会话规则的 ID 各自独立，但在匹配阶段共同参与裁决，因此两类 ID 都登记在此，
 * 新增规则前先在这里占位，避免再出现「两个功能撞同一个写死 ID」。当前占用：
 *
 * | 作用域   | ID              | 用途                                              |
 * | -------- | --------------- | ------------------------------------------------- |
 * | dynamic  | 1               | 安装重定向规则集的整体清理位（script.ts）         |
 * | dynamic  | 2               | 单次安装失败后放行该 URL（script.ts）             |
 * | session  | 1000 - 1099     | .user.js / .cat.md 安装重定向（script.ts）        |
 * | session  | 1100 - 1199     | 上面每条重定向对应的请求阶段守卫（script.ts）     |
 * | dynamic  | 2001 - 2520     | 预留给 PR #1264，尚未落地                         |
 * | session  | 999             | GM_xhr 请求标记头清理（gm_api/mv3_utils.ts）      |
 * | session  | > 10000         | GM_xhr 单次请求头改写（gm_api/dnr_id_controller.ts） |
 *
 * 用户网络规则因此从 1_000_000 起分配：既避开上面全部区段，也避开安装入口随版本增加而
 * 向上生长的空间。
 */

export const USER_RULE_ID_MIN = 1_000_000;
export const USER_RULE_ID_MAX = 1_099_999;

/** 保留段容量即用户规则条数的结构性上界；真正的上界是浏览器动态规则配额，两者中前者更大。 */
export const MAX_USER_RULES = USER_RULE_ID_MAX - USER_RULE_ID_MIN + 1;

/** 安装重定向按条件下标依次占位。 */
export const INSTALL_REDIRECT_RULE_ID_MIN = 1000;
export const INSTALL_REDIRECT_RULE_ID_MAX = 1099;

/** 请求阶段守卫与安装重定向一一对应，用同一个下标，段与段之间留出等宽空间。 */
export const INSTALL_GUARD_RULE_ID_MIN = 1100;
export const INSTALL_GUARD_RULE_ID_MAX = 1199;

/**
 * ScriptCat 自身注册的规则统一使用的优先级。
 *
 * DNR 先比 priority，只有 priority 相同才按 allow > block > upgradeScheme > redirect 的动作序裁决。
 * 用户规则的优先级由列表位次映射，上界是 MAX_USER_RULES，严格低于此值，因此在同一个裁决阶段里
 * 用户规则不可能抢在 .user.js 安装重定向或 GM_xhr 头改写之前生效。
 */
export const INTERNAL_DNR_PRIORITY = 1_000_000;

/**
 * 请求阶段守卫的优先级：严格高于用户段、严格低于 INTERNAL_DNR_PRIORITY。
 *
 * 两侧的边界都是必需的。高于用户段，用户的 block 才压不过它；低于安装重定向，重定向才仍然
 * 「优先级高于所有命中的 allow」而得以执行——DNR 只把优先级高于命中 allow 的规则纳入裁决，
 * 若守卫与重定向同级，同级动作序 allow > redirect 会让安装页反而打不开。
 */
export const INTERNAL_DNR_GUARD_PRIORITY = INTERNAL_DNR_PRIORITY - 1;

export function isUserRuleId(id: number): boolean {
  return id >= USER_RULE_ID_MIN && id <= USER_RULE_ID_MAX;
}

/**
 * 为每条安装重定向条件生成一条请求阶段的 allow 规则。
 *
 * Chrome ≥128 上安装重定向带 Content-Type 响应头条件，只能在响应头阶段裁决；而用户的 block
 * 在请求阶段就短路了请求，响应根本不存在，跨阶段无从比较 priority——运行时验证已观察到用户
 * 的一条 block 规则使 `.user.js` 导航变成 ERR_BLOCKED_BY_CLIENT。守卫在请求阶段先放行同一批
 * 请求，使其活到响应阶段交由重定向裁决。代价是用户规则不再能作用于 `.user.js` 请求本身。
 *
 * 条件逐字取自传入的重定向条件（调用方须在附加 responseHeaders 之前调用），守卫因此不会豁免
 * 比重定向更宽的请求。
 */
export function buildInstallGuardRules(
  conditions: chrome.declarativeNetRequest.RuleCondition[]
): chrome.declarativeNetRequest.Rule[] {
  return conditions.map((condition, idx) => ({
    id: INSTALL_GUARD_RULE_ID_MIN + idx,
    priority: INTERNAL_DNR_GUARD_PRIORITY,
    action: { type: "allow" as chrome.declarativeNetRequest.RuleActionType },
    condition: { ...condition },
  }));
}
