import { CSPRuleDAO, type CSPRule } from "@App/app/repo/cspRule";
import type Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import { toDeclarativeNetRequestFilter } from "@App/pkg/utils/patternMatcher";

const CSP_RULE_ID_START = 10000;
const MAX_DYNAMIC_RULES = 5000;

export class CSPInterceptorService {
  private logger: Logger;
  private cspRuleDAO: CSPRuleDAO;
  private enabledRules: CSPRule[] = [];
  private globalEnabled: boolean = false;
  private initialized: boolean = false;
  private ruleIdCounter: number = CSP_RULE_ID_START;

  constructor() {
    this.logger = LoggerCore.logger().with({ service: "cspInterceptor" });
    this.cspRuleDAO = new CSPRuleDAO();
  }

  /**
   * 初始化拦截器
   * 加载已有的启用规则并注册到 Chrome DNR
   */
  async init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // 清除历史遗留的脏数据
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const cspRuleIds = existingRules
        .filter((rule) => rule.id >= CSP_RULE_ID_START && rule.id < CSP_RULE_ID_START + MAX_DYNAMIC_RULES)
        .map((rule) => rule.id);
      if (cspRuleIds.length > 0) {
        this.logger.info("cleaning up legacy CSP dynamic rules", { count: cspRuleIds.length });
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: cspRuleIds,
        });
      }
    } catch (e) {
      this.logger.warn("failed to cleanup legacy CSP rules", { error: String(e) });
    }

    // 加载全局配置和已有规则
    const config = await this.cspRuleDAO.getCSPConfig();
    this.globalEnabled = config.globalEnabled;
    this.enabledRules = await this.cspRuleDAO.getEnabledRules();
    this.logger.info("csp interceptor initialized", {
      globalEnabled: this.globalEnabled,
      ruleCount: this.enabledRules.length,
    });

    await this.updateDeclarativeRules();
  }

  /**
   * 更新启用的规则列表并重新注册 DNR 规则
   * 由 CSPRuleService 在规则变更时直接调用
   */
  async updateRules(enabledRules: CSPRule[]) {
    this.enabledRules = enabledRules;
    this.logger.info("csp rules updated", { ruleCount: enabledRules.length });
    await this.updateDeclarativeRules();
  }

  /**
   * 更新全局开关状态
   */
  async updateGlobalEnabled(enabled: boolean) {
    this.globalEnabled = enabled;
    this.logger.info("csp global enabled changed", { globalEnabled: enabled });
    await this.updateDeclarativeRules();
  }

  private async updateDeclarativeRules() {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const existingRuleIds = existingRules
        .filter((rule) => rule.id >= CSP_RULE_ID_START && rule.id < CSP_RULE_ID_START + MAX_DYNAMIC_RULES)
        .map((rule) => rule.id);

      this.logger.info("updating declarative rules", {
        removeCount: existingRuleIds.length,
        globalEnabled: this.globalEnabled,
        enabledCount: this.enabledRules.length,
      });

      const newRules: chrome.declarativeNetRequest.Rule[] = [];
      this.ruleIdCounter = CSP_RULE_ID_START;

      // 全局模式：注册一条全量移除规则
      if (this.globalEnabled) {
        newRules.push({
          id: this.ruleIdCounter++,
          priority: 9999,
          action: {
            type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            responseHeaders: [
              {
                header: "Content-Security-Policy",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "Content-Security-Policy-Report-Only",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "X-Content-Security-Policy",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "X-WebKit-CSP",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
            ],
          },
          condition: {
            urlFilter: "*",
            resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
          },
        });
        // 全局模式下不需要注册具体规则
      } else {
        // 规则模式：按优先级注册各规则
        const sortedRules = [...this.enabledRules].sort((a, b) => b.priority - a.priority);

        for (const rule of sortedRules) {
          const dnrRules = this.convertToDeclarativeRule(rule);
          if (dnrRules) {
            for (const dnrRule of dnrRules) {
              if (newRules.length >= MAX_DYNAMIC_RULES) {
                this.logger.warn("max dynamic rules limit reached", { limit: MAX_DYNAMIC_RULES });
                break;
              }
              newRules.push(dnrRule);
            }
          }
          if (newRules.length >= MAX_DYNAMIC_RULES) {
            break;
          }
        }
      }

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: newRules,
      });

      this.logger.info("declarative rules updated successfully", {
        addedCount: newRules.length,
      });
    } catch (e) {
      this.logger.error("failed to update declarative rules", { error: String(e) });
    }
  }

  private convertToDeclarativeRule(rule: CSPRule): chrome.declarativeNetRequest.Rule[] | null {
    if (!rule.enabled) {
      return null;
    }

    const conditions = this.buildConditions(rule.path);
    if (conditions.length === 0) {
      this.logger.warn("could not build condition for rule", { ruleName: rule.name, path: rule.path });
      return null;
    }

    const dnrRules: chrome.declarativeNetRequest.Rule[] = [];

    for (const condition of conditions) {
      const ruleId = this.ruleIdCounter++;
      // Chrome DNR 要求 priority >= 1
      const dnrPriority = Math.max(1, rule.priority);

      if (rule.action === "remove") {
        dnrRules.push({
          id: ruleId,
          priority: dnrPriority,
          action: {
            type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            responseHeaders: [
              {
                header: "Content-Security-Policy",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "Content-Security-Policy-Report-Only",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "X-Content-Security-Policy",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "X-WebKit-CSP",
                operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
            ],
          },
          condition: {
            ...condition,
            resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
          },
        });
      } else if (rule.action === "modify" && rule.actionValue) {
        dnrRules.push({
          id: ruleId,
          priority: dnrPriority,
          action: {
            type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            responseHeaders: [
              {
                header: "Content-Security-Policy",
                operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
                value: rule.actionValue,
              },
            ],
          },
          condition: {
            ...condition,
            resourceTypes: ["main_frame", "sub_frame"] as chrome.declarativeNetRequest.ResourceType[],
          },
        });
      }
    }

    return dnrRules;
  }

  private buildConditions(pattern: string): Partial<chrome.declarativeNetRequest.RuleCondition>[] {
    const conditions: Partial<chrome.declarativeNetRequest.RuleCondition>[] = [];

    try {
      const filter = toDeclarativeNetRequestFilter(pattern);

      if (filter.regexFilter) {
        conditions.push({
          regexFilter: filter.regexFilter,
        });
        this.logger.debug("using regex filter", { pattern, regexFilter: filter.regexFilter });
      } else if (filter.urlFilter) {
        conditions.push({
          urlFilter: filter.urlFilter,
        });
        this.logger.debug("using url filter", { pattern, urlFilter: filter.urlFilter });
      }
    } catch (e) {
      this.logger.warn("invalid pattern", { pattern, error: String(e) });
    }

    return conditions;
  }
}
