/**
 * URL 模式匹配工具类
 *
 * 参考 wproxy/whistle 的匹配模式规范：
 * https://wproxy.org/docs/rules/pattern.html
 *
 * 支持四种模式类型：exact（精确匹配）、wildcard（通配符）、regex（正则）、domain（域名）
 *
 * 域名通配符：star 匹配单段，starstar.domain 匹配多级子域，starstarstar.domain 匹配根域+多级子域
 * 协议通配符：http* 中 star 匹配任意字母或冒号
 * 路径通配符（需 ^ 前缀）：star 单级路径，starstar 多级路径，starstarstar 任意字符
 */

// ============================================================
// 类型定义
// ============================================================

export type PatternType = "exact" | "wildcard" | "regex" | "domain";

export interface PatternValidationResult {
  valid: boolean;
  type: PatternType;
  error?: string;
}

export interface PatternExample {
  type: PatternType;
  pattern: string;
  description: string;
}

export interface DeclarativeNetRequestFilter {
  urlFilter?: string;
  regexFilter?: string;
}

// ============================================================
// 常量
// ============================================================

const REGEX_DELIMITER = "/";

// ============================================================
// 核心函数
// ============================================================

/**
 * 自动识别模式类型
 */
export function parsePatternType(pattern: string): PatternType {
  const trimmed = pattern.trim();

  if (isRegexPattern(trimmed)) {
    return "regex";
  }

  // 域名模式优先于通配符（*.example.com、**.example.com、***.example.com 是域名模式）
  if (isDomainPattern(trimmed)) {
    return "domain";
  }

  if (isWildcardPattern(trimmed)) {
    return "wildcard";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return "exact";
  }

  return "exact";
}

/**
 * 测试 URL 是否匹配模式
 */
export function patternMatch(pattern: string, url: string): boolean {
  if (!pattern || !url) {
    return false;
  }

  const type = parsePatternType(pattern);

  try {
    switch (type) {
      case "exact":
        return matchExact(pattern.trim(), url);
      case "wildcard":
        return matchWildcard(pattern.trim(), url);
      case "regex":
        return matchRegex(pattern.trim(), url);
      case "domain":
        return matchDomain(pattern.trim(), url);
      default:
        return false;
    }
  } catch (e) {
    console.warn(`[PatternMatcher] 匹配出错 (${type}):`, e);
    return false;
  }
}

/**
 * 将模式转换为 Chrome declarativeNetRequest API 的 urlFilter 或 regexFilter 格式
 */
export function toDeclarativeNetRequestFilter(pattern: string): DeclarativeNetRequestFilter {
  if (!pattern) {
    throw new Error("[PatternMatcher] 模式不能为空");
  }

  const trimmed = pattern.trim();
  const type = parsePatternType(trimmed);

  switch (type) {
    case "regex":
      return toRegexFilter(trimmed);
    case "wildcard":
      return toUrlFilter(trimmed);
    case "domain":
      return domainToUrlFilter(trimmed);
    case "exact":
      return exactToUrlFilter(trimmed);
    default:
      throw new Error(`[PatternMatcher] 不支持的模式类型: ${type}`);
  }
}

/**
 * 验证模式语法是否正确
 */
export function validatePattern(pattern: string): PatternValidationResult {
  if (!pattern || !pattern.trim()) {
    return { valid: false, type: "exact", error: "模式不能为空" };
  }

  const trimmed = pattern.trim();
  const type = parsePatternType(trimmed);

  try {
    switch (type) {
      case "regex":
        return validateRegex(trimmed);
      case "wildcard":
        return validateWildcard(trimmed);
      case "domain":
        return validateDomain(trimmed);
      case "exact":
        return validateExact(trimmed);
      default:
        return { valid: false, type, error: `未知的模式类型: ${type}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, type, error: message };
  }
}

/**
 * 返回各类型模式的示例（参考 wproxy 规范）
 */
export function getPatternExamples(): PatternExample[] {
  return [
    {
      type: "domain",
      pattern: "example.com",
      description: "域名匹配：匹配 example.com 及其所有子域名",
    },
    {
      type: "domain",
      pattern: "*.example.com",
      description: "域名匹配：仅匹配子域名（api.example.com、shop.example.com）",
    },
    {
      type: "domain",
      pattern: "**.example.com",
      description: "域名匹配：匹配多级子域名（a.b.example.com）",
    },
    {
      type: "domain",
      pattern: "***.example.com",
      description: "域名匹配：同时匹配根域名和多级子域名",
    },
    {
      type: "wildcard",
      pattern: "*",
      description: "全局通配：匹配所有 URL",
    },
    {
      type: "wildcard",
      pattern: "*://*.example.com/*",
      description: "通配符：协议不限，匹配 example.com 的子域名下所有路径",
    },
    {
      type: "wildcard",
      pattern: "https://*.example.com:8080/api/*",
      description: "通配符：匹配指定协议、端口和路径前缀",
    },
    {
      type: "wildcard",
      pattern: "http*://test.abc**.com",
      description: "通配符：协议中 * 匹配字母/冒号，**. 匹配多级子域",
    },
    {
      type: "wildcard",
      pattern: "^http://*.example.com/data/*/result?q=*",
      description: "路径通配（需 ^ 前缀）：路径中 * 匹配单级，参数中 * 匹配单参数值",
    },
    {
      type: "wildcard",
      pattern: "^http://**.example.com/data/**file",
      description: "路径通配（需 ^ 前缀）：** 匹配多级路径",
    },
    {
      type: "regex",
      pattern: "/^https:\\/\\/(www\\.)?example\\.com\\/api\\/.*/",
      description: "正则表达式：完整正则匹配",
    },
    {
      type: "regex",
      pattern: "/\\.test\\./i",
      description: "正则表达式：忽略大小写匹配 .test.",
    },
    {
      type: "exact",
      pattern: "https://www.example.com/page",
      description: "精确匹配：完全匹配指定 URL",
    },
  ];
}

// ============================================================
// 内部辅助函数 - 模式类型识别
// ============================================================

function isRegexPattern(pattern: string): boolean {
  if (pattern.length < 3 || pattern[0] !== REGEX_DELIMITER) {
    return false;
  }
  const lastSlash = pattern.lastIndexOf(REGEX_DELIMITER);
  if (lastSlash <= 0) {
    return false;
  }
  const flags = pattern.substring(lastSlash + 1);
  if (flags && !/^[gimsuyv]+$/.test(flags)) {
    return false;
  }
  const body = pattern.substring(1, lastSlash);
  if (!body) {
    return false;
  }
  return true;
}

function isWildcardPattern(pattern: string): boolean {
  if (!/[*?]/.test(pattern)) {
    return false;
  }
  if (isRegexPattern(pattern)) {
    return false;
  }
  return true;
}

function isDomainPattern(pattern: string): boolean {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(pattern)) {
    return false;
  }
  // 支持 **. 或 ***. 或 *. 前缀 + 域名 + 可选端口
  const domainRegex =
    /^(\*\*\*\.|\*\*\.|\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(:\d+)?$/;
  return domainRegex.test(pattern);
}

// ============================================================
// 内部辅助函数 - 匹配逻辑
// ============================================================

function matchExact(pattern: string, url: string): boolean {
  return pattern === url;
}

/**
 * 通配符匹配（参考 wproxy 规范）
 *
 * 域名通配符：star.domain 单级子域，starstar.domain 多级子域，starstarstar.domain 根域+多级子域
 * 协议通配符：http* 中 star 匹配任意字母或冒号
 * 路径通配符（需 ^ 前缀）：star 单级路径，starstar 多级路径，starstarstar 任意字符
 */
function matchWildcard(pattern: string, url: string): boolean {
  // 全局通配符
  if (pattern === "*" || pattern === "*://*") {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const urlProtocol = parsedUrl.protocol + "//";
  const urlHost = parsedUrl.hostname.toLowerCase();
  const urlPort = parsedUrl.port;
  const urlPath = parsedUrl.pathname;
  const urlSearch = parsedUrl.search;

  // 解析模式
  let protoPart = "";
  let hostPart = "";
  let pathPart = "";
  let hasPathWildcard = false;

  // 检查 ^ 前缀（路径通配符声明）
  const hasPathPrefix = pattern.startsWith("^");
  let workingPattern = hasPathPrefix ? pattern.substring(1) : pattern;

  // 提取协议部分
  const protoMatch = /^([a-zA-Z]*\*?[a-zA-Z]*:\/\/)/.exec(workingPattern);
  if (protoMatch) {
    protoPart = protoMatch[1];
    workingPattern = workingPattern.substring(protoPart.length);
  }

  // 提取域名和路径
  const firstSlash = workingPattern.indexOf("/");
  if (firstSlash >= 0) {
    hostPart = workingPattern.substring(0, firstSlash);
    pathPart = workingPattern.substring(firstSlash);
    if (/\*/.test(pathPart)) {
      hasPathWildcard = true;
    }
  } else {
    hostPart = workingPattern;
    pathPart = "/";
  }

  // 1. 匹配协议
  if (protoPart) {
    if (protoPart.includes("*")) {
      // 协议中 * 匹配任意字母或冒号
      const protoRegex = "^" + protoPart.replace(/\*/g, "[a-z:]*") + "$";
      if (!new RegExp(protoRegex, "i").test(urlProtocol)) {
        return false;
      }
    } else {
      if (protoPart !== urlProtocol) {
        return false;
      }
    }
  }

  // 2. 匹配域名（分离端口）
  let patternHost = hostPart;
  let patternPort = "";
  const hostColonIdx = hostPart.lastIndexOf(":");
  if (hostColonIdx >= 0 && /^\d+$/.test(hostPart.substring(hostColonIdx + 1))) {
    patternHost = hostPart.substring(0, hostColonIdx);
    patternPort = hostPart.substring(hostColonIdx + 1);
  }
  if (!matchWildcardHost(patternHost, urlHost)) {
    return false;
  }
  // 匹配端口
  if (patternPort) {
    if (urlPort !== patternPort) {
      return false;
    }
  }

  // 3. 匹配路径
  if (hasPathPrefix) {
    // ^ 前缀路径通配符模式：包含查询字符串
    return matchWildcardPath(pathPart, urlPath, urlSearch);
  }

  if (hasPathWildcard) {
    // 非 ^ 前缀路径通配符：仅匹配 pathname，忽略查询字符串
    return matchWildcardPath(pathPart, urlPath, "");
  }

  // 普通路径匹配
  if (pathPart === "/" || pathPart === "/*") {
    return true;
  }

  // 路径中的 * 匹配单段
  return matchPathSimple(pathPart, urlPath);
}

/**
 * 域名通配符匹配
 */
function matchWildcardHost(patternHost: string, urlHost: string): boolean {
  // ***.domain = 同时匹配根域名 + 多级子域
  if (patternHost.startsWith("***.")) {
    const base = patternHost.substring(4).toLowerCase();
    return urlHost === base || urlHost.endsWith("." + base);
  }

  // **.domain = 匹配根域名和多级子域
  if (patternHost.startsWith("**.")) {
    const base = patternHost.substring(3).toLowerCase();
    return urlHost === base || urlHost.endsWith("." + base);
  }

  // *.domain = 匹配单级子域（不含根域名自身，参考 wproxy 规范）
  if (patternHost.startsWith("*.")) {
    const base = patternHost.substring(2).toLowerCase();
    return urlHost.endsWith("." + base);
  }

  // 无通配符 → 精确匹配
  if (!patternHost.includes("*")) {
    return patternHost.toLowerCase() === urlHost;
  }

  // 混合通配符（如 test.abc**.com）
  // ** 在域名中间 = 匹配零或多级子域
  if (patternHost.includes("**")) {
    // 按段处理：** 段匹配零或多个子域段
    const segments = patternHost.split(".");
    let regexStr = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i > 0) regexStr += "\\.";

      if (seg === "**") {
        // ** 独立段 → 匹配零或多个完整子域段
        regexStr += "((\\.[^.]+)*)?";
      } else if (seg.endsWith("**")) {
        // 段以 ** 结尾（如 abc**）→ 字面量前缀 + 零或多个完整子域段
        const prefix = seg.substring(0, seg.length - 2);
        regexStr += escapeRegex(prefix) + "((\\.[^.]+)*)?";
      } else if (seg.startsWith("**")) {
        // 段以 ** 开头（如 **com）→ 零或多个子域段 + 字面量后缀
        const suffix = seg.substring(2);
        regexStr += "([^.]+(\\.[^.]+)*?\\.)?" + escapeRegex(suffix);
      } else if (seg.includes("**")) {
        // 段中间包含 **（如 a**b）→ 前缀 + 零或多子域 + 后缀
        const idx = seg.indexOf("**");
        const prefix = seg.substring(0, idx);
        const suffix = seg.substring(idx + 2);
        regexStr += escapeRegex(prefix) + "([^.]+(\\.[^.]+)*?\\.?)?" + escapeRegex(suffix);
      } else if (seg === "*") {
        regexStr += "[^.]+";
      } else if (seg.includes("*")) {
        regexStr += seg.replace(/\*/g, "[^.]+");
      } else {
        regexStr += escapeRegex(seg);
      }
    }
    return new RegExp(`^${regexStr}$`, "i").test(urlHost);
  }

  // 单 * 通配符
  const regexStr = patternHost
    .split(".")
    .map((segment) => {
      if (segment === "*") return "[^.]+";
      return escapeRegex(segment);
    })
    .join("\\.");
  return new RegExp(`^${regexStr}$`, "i").test(urlHost);
}

/**
 * 路径通配符匹配（参考 wproxy 路径通配符规则）
 * 需要配合 ^ 前缀使用
 * star 单级路径，starstar 多级路径，starstarstar 任意字符
 */
function matchWildcardPath(patternPath: string, urlPath: string, urlSearch: string): boolean {
  const fullPath = urlPath + urlSearch;

  // 将通配符模式转为正则
  let regexStr = "";

  let i = 0;
  while (i < patternPath.length) {
    if (patternPath[i] === "*" && patternPath[i + 1] === "*" && patternPath[i + 2] === "*") {
      // *** → 任意字符（含 / 和 ?）
      regexStr += ".*";
      i += 3;
    } else if (patternPath[i] === "*" && patternPath[i + 1] === "*") {
      // ** → 多级路径（不含 ?）
      regexStr += "[^?]*";
      i += 2;
    } else if (patternPath[i] === "*") {
      // * → 单级路径（不含 / 和 ?）
      regexStr += "[^?/]*";
      i += 1;
    } else if (patternPath[i] === "?") {
      // ? 在路径模式中是字面量（查询字符串分隔符），不是通配符
      regexStr += escapeRegex("?");
      i += 1;
    } else {
      regexStr += escapeRegex(patternPath[i]);
      i += 1;
    }
  }

  return new RegExp(`^${regexStr}$`).test(fullPath);
}

/**
 * 普通路径匹配（非 ^ 前缀）
 * * 匹配单段（非 / 字符）
 */
function matchPathSimple(patternPath: string, urlPath: string): boolean {
  if (!patternPath.includes("*")) {
    return patternPath === urlPath;
  }

  const segments = patternPath.split("/");
  const urlSegments = urlPath.split("/");

  if (segments.length !== urlSegments.length) {
    return false;
  }

  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "*") {
      if (!urlSegments[i]) {
        return false;
      }
      continue;
    }
    if (segments[i] !== urlSegments[i]) {
      return false;
    }
  }

  return true;
}

/**
 * 域名匹配
 */
function matchDomain(pattern: string, url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const urlHost = parsedUrl.hostname.toLowerCase();
  let domain = pattern.toLowerCase();

  // 去除端口
  const colonIdx = domain.lastIndexOf(":");
  if (colonIdx >= 0) {
    const portPart = domain.substring(colonIdx + 1);
    if (/^\d+$/.test(portPart)) {
      domain = domain.substring(0, colonIdx);
    }
  }

  // ***.example.com → 同时匹配根域名和多级子域
  if (domain.startsWith("***.")) {
    const baseDomain = domain.substring(4);
    return urlHost === baseDomain || urlHost.endsWith("." + baseDomain);
  }

  // **.example.com → 匹配根域名和多级子域
  if (domain.startsWith("**.")) {
    const baseDomain = domain.substring(3);
    return urlHost === baseDomain || urlHost.endsWith("." + baseDomain);
  }

  // *.example.com → 匹配子域名（含自身）
  if (domain.startsWith("*.")) {
    const baseDomain = domain.substring(2);
    return urlHost === baseDomain || urlHost.endsWith("." + baseDomain);
  }

  // example.com → 匹配自身及所有子域名
  return urlHost === domain || urlHost.endsWith("." + domain);
}

/**
 * 正则表达式匹配
 */
function matchRegex(pattern: string, url: string): boolean {
  const parsed = parseRegexPattern(pattern);
  if (!parsed) {
    return false;
  }
  const { body, flags } = parsed;
  return new RegExp(body, flags).test(url);
}

// ============================================================
// 内部辅助函数 - 正则解析
// ============================================================

function parseRegexPattern(pattern: string): { body: string; flags: string } | null {
  if (!isRegexPattern(pattern)) {
    return null;
  }
  const lastSlash = pattern.lastIndexOf(REGEX_DELIMITER);
  const body = pattern.substring(1, lastSlash);
  const flags = pattern.substring(lastSlash + 1);
  try {
    new RegExp(body, flags);
  } catch {
    return null;
  }
  return { body, flags };
}

// ============================================================
// 内部辅助函数 - declarativeNetRequest 转换
// ============================================================

function toRegexFilter(pattern: string): DeclarativeNetRequestFilter {
  const parsed = parseRegexPattern(pattern);
  if (!parsed) {
    throw new Error(`[PatternMatcher] 无效的正则表达式: ${pattern}`);
  }
  return { regexFilter: parsed.body };
}

function toUrlFilter(pattern: string): DeclarativeNetRequestFilter {
  // 全局通配
  if (pattern === "*" || pattern === "*://*") {
    return { urlFilter: "*" };
  }

  let processed = pattern;

  // 去除 ^ 前缀（路径通配符声明，DNR 不需要）
  if (processed.startsWith("^")) {
    processed = processed.substring(1);
  }

  // ***. 前缀 → ||（匹配域名及子域名）
  if (processed.startsWith("***.")) {
    const rest = processed.substring(4);
    const slashIdx = rest.indexOf("/");
    const host = slashIdx >= 0 ? rest.substring(0, slashIdx) : rest;
    const path = slashIdx >= 0 ? rest.substring(slashIdx) : "/*";
    return { urlFilter: `||${host}${path}` };
  }

  // **. 前缀 → ||
  if (processed.startsWith("**.")) {
    const rest = processed.substring(3);
    const slashIdx = rest.indexOf("/");
    const host = slashIdx >= 0 ? rest.substring(0, slashIdx) : rest;
    const path = slashIdx >= 0 ? rest.substring(slashIdx) : "/*";
    return { urlFilter: `||${host}${path}` };
  }

  // 处理协议前缀
  if (processed.startsWith("http://")) {
    processed = "|http://" + processed.substring(7);
  } else if (processed.startsWith("https://")) {
    processed = "|https://" + processed.substring(8);
  } else if (processed.startsWith("*://")) {
    processed = "||" + processed.substring(4);
  } else if (!processed.startsWith("|") && !processed.startsWith("||")) {
    processed = "||" + processed;
  }

  // 路径中的 ** → *（DNR 的 * 本身匹配任意字符）
  processed = processed.replace(/\/\*\*\//g, "/*");
  processed = processed.replace(/\*\*/g, "*");

  // 确保有路径
  if (!processed.includes("/")) {
    processed += "/*";
  }

  return { urlFilter: processed };
}

function domainToUrlFilter(pattern: string): DeclarativeNetRequestFilter {
  let domain = pattern;

  const colonIdx = domain.lastIndexOf(":");
  if (colonIdx >= 0) {
    const portPart = domain.substring(colonIdx + 1);
    if (/^\d+$/.test(portPart)) {
      domain = domain.substring(0, colonIdx);
    }
  }

  // ***. 和 **. 和 *. 都用 || 匹配域名及子域名
  if (domain.startsWith("***.")) {
    domain = domain.substring(4);
  } else if (domain.startsWith("**.")) {
    domain = domain.substring(3);
  } else if (domain.startsWith("*.")) {
    domain = domain.substring(2);
  }

  return { urlFilter: `||${domain}/*` };
}

function exactToUrlFilter(pattern: string): DeclarativeNetRequestFilter {
  return { urlFilter: `|${pattern}|` };
}

// ============================================================
// 内部辅助函数 - 验证
// ============================================================

function validateRegex(pattern: string): PatternValidationResult {
  const parsed = parseRegexPattern(pattern);
  if (!parsed) {
    return {
      valid: false,
      type: "regex",
      error: `无效的正则表达式格式，正确格式: /正则体/标志`,
    };
  }
  return { valid: true, type: "regex" };
}

function validateWildcard(pattern: string): PatternValidationResult {
  if (!pattern) {
    return { valid: false, type: "wildcard", error: "通配符模式不能为空" };
  }
  return { valid: true, type: "wildcard" };
}

function validateDomain(pattern: string): PatternValidationResult {
  if (!pattern) {
    return { valid: false, type: "domain", error: "域名不能为空" };
  }

  let domain = pattern;
  if (domain.startsWith("***.") || domain.startsWith("**.") || domain.startsWith("*.")) {
    const prefixLen = domain.startsWith("***.") ? 4 : domain.startsWith("**.") ? 3 : 2;
    domain = domain.substring(prefixLen);
  }

  const colonIdx = domain.lastIndexOf(":");
  if (colonIdx >= 0) {
    const portPart = domain.substring(colonIdx + 1);
    if (/^\d+$/.test(portPart)) {
      domain = domain.substring(0, colonIdx);
    } else {
      return { valid: false, type: "domain", error: `无效的端口号: ${portPart}` };
    }
  }

  const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  if (!domainRegex.test(domain)) {
    return { valid: false, type: "domain", error: `无效的域名格式: ${domain}` };
  }

  return { valid: true, type: "domain" };
}

function validateExact(pattern: string): PatternValidationResult {
  if (!pattern) {
    return { valid: false, type: "exact", error: "URL 不能为空" };
  }
  return { valid: true, type: "exact" };
}

// ============================================================
// 通用工具函数
// ============================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
