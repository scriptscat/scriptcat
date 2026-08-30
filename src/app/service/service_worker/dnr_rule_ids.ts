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
 * | dynamic  | 1000 + idx      | .user.js / .cat.md 安装重定向（script.ts）        |
 * | dynamic  | 2001 - 2520     | 预留给 PR #1264，尚未落地                         |
 * | session  | 999             | GM_xhr 请求标记头清理（gm_api/mv3_utils.ts）      |
 * | session  | > 10000         | GM_xhr 单次请求头改写（gm_api/dnr_id_controller.ts） |
 *
 * 用户网络规则因此从 1_000_000 起分配：既避开上面全部区段，也避开 `1000 + idx` 随安装
 * 入口增加而向上生长的空间。
 */

export const USER_RULE_ID_MIN = 1_000_000;
export const USER_RULE_ID_MAX = 1_099_999;

/** 保留段容量即用户规则条数的结构性上界；真正的上界是浏览器动态规则配额，两者中前者更大。 */
export const MAX_USER_RULES = USER_RULE_ID_MAX - USER_RULE_ID_MIN + 1;

/**
 * ScriptCat 自身注册的规则统一使用的优先级。
 *
 * DNR 先比 priority，只有 priority 相同才按 allow > block > upgradeScheme > redirect 的动作序裁决。
 * 用户规则的优先级由列表位次映射，上界是 MAX_USER_RULES，严格低于此值，因此用户的 block 规则
 * 不可能抢在 .user.js 安装重定向或 GM_xhr 头改写之前生效。
 */
export const INTERNAL_DNR_PRIORITY = 1_000_000;

export function isUserRuleId(id: number): boolean {
  return id >= USER_RULE_ID_MIN && id <= USER_RULE_ID_MAX;
}
