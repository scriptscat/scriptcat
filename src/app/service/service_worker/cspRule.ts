import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { CSPRuleDAO, type CSPRule, type CSPConfig } from "@App/app/repo/cspRule";
import type Logger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import { v4 as uuidv4 } from "uuid";

export class CSPRuleService {
  private logger: Logger;
  private cspRuleDAO: CSPRuleDAO;

  /** 规则变更回调，用于直接通知拦截器更新 DNR 规则 */
  private onRulesChanged?: (enabledRules: CSPRule[]) => Promise<void>;

  /** 全局开关变更回调 */
  private onGlobalEnabledChanged?: (enabled: boolean) => Promise<void>;

  constructor(
    private group: Group,
    private mq: IMessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "cspRule" });
    this.cspRuleDAO = new CSPRuleDAO();
  }

  /**
   * 设置规则变更回调
   */
  setOnRulesChanged(callback: (enabledRules: CSPRule[]) => Promise<void>) {
    this.onRulesChanged = callback;
  }

  /**
   * 设置全局开关变更回调
   */
  setOnGlobalEnabledChanged(callback: (enabled: boolean) => Promise<void>) {
    this.onGlobalEnabledChanged = callback;
  }

  private async notifyRulesChanged() {
    const enabledRules = await this.getEnabledRules();
    if (this.onRulesChanged) {
      try {
        await this.onRulesChanged(enabledRules);
      } catch (e) {
        this.logger.error("failed to notify interceptor", { error: String(e) });
      }
    }
    this.mq.publish<CSPRule[]>("cspRulesChanged", enabledRules);
  }

  async getAllRules(): Promise<CSPRule[]> {
    const rules = await this.cspRuleDAO.getAllRules();
    const validRules: CSPRule[] = [];
    for (const rule of rules) {
      if (rule && rule.id && rule.name && rule.path && rule.action && typeof rule.priority === "number") {
        validRules.push(rule);
      } else {
        this.logger.warn("removing invalid legacy CSP rule", { rule });
        if (rule && rule.id) {
          await this.cspRuleDAO.deleteRule(rule.id).catch(() => {});
        }
      }
    }
    return validRules.sort((a, b) => b.priority - a.priority);
  }

  async getEnabledRules(): Promise<CSPRule[]> {
    return this.cspRuleDAO.getEnabledRules();
  }

  async getCSPConfig(): Promise<CSPConfig> {
    return this.cspRuleDAO.getCSPConfig();
  }

  async toggleGlobal(params: { enabled: boolean }): Promise<CSPConfig> {
    const config = await this.cspRuleDAO.getCSPConfig();
    config.globalEnabled = params.enabled;
    await this.cspRuleDAO.saveCSPConfig(config);
    this.logger.info("toggle csp global", { enabled: params.enabled });
    if (this.onGlobalEnabledChanged) {
      try {
        await this.onGlobalEnabledChanged(params.enabled);
      } catch (e) {
        this.logger.error("failed to notify interceptor about global change", { error: String(e) });
      }
    }
    return config;
  }

  /**
   * 获取当前所有规则中最大的 priority 值
   */
  private async getMaxPriority(): Promise<number> {
    const rules = await this.cspRuleDAO.getAllRules();
    if (rules.length === 0) return 0;
    return Math.max(...rules.map((r) => r.priority));
  }

  /**
   * 确保不与已有规则 priority 冲突，冲突时自动递增
   */
  private async resolvePriority(priority: number, excludeId?: string): Promise<number> {
    const rules = await this.cspRuleDAO.getAllRules();
    const usedPriorities = new Set(rules.filter((r) => r.id !== excludeId).map((r) => r.priority));
    let resolved = priority;
    while (usedPriorities.has(resolved)) {
      resolved += 1;
    }
    return resolved;
  }

  async createRule(rule: Omit<CSPRule, "id" | "createtime" | "updatetime">): Promise<CSPRule> {
    const now = Date.now();
    const resolvedPriority = await this.resolvePriority(rule.priority);
    const newRule: CSPRule = {
      ...rule,
      id: uuidv4(),
      priority: resolvedPriority,
      createtime: now,
      updatetime: now,
    };
    await this.cspRuleDAO.saveRule(newRule);
    this.logger.info("create csp rule", { name: rule.name, id: newRule.id, priority: newRule.priority });
    await this.notifyRulesChanged();
    return newRule;
  }

  async updateRule(params: { id: string; changes: Partial<CSPRule> }): Promise<CSPRule | false> {
    const { id, changes } = params;
    const resolvedChanges = { ...changes, updatetime: Date.now() };
    if (changes.priority !== undefined) {
      resolvedChanges.priority = await this.resolvePriority(changes.priority, id);
    }
    const result = await this.cspRuleDAO.updateRule(id, resolvedChanges);
    if (result) {
      this.logger.info("update csp rule", { id, priority: result.priority });
      await this.notifyRulesChanged();
    }
    return result;
  }

  async deleteRule(id: string): Promise<void> {
    await this.cspRuleDAO.deleteRule(id);
    this.logger.info("delete csp rule", { id });
    await this.notifyRulesChanged();
  }

  async toggleRule(params: { id: string; enabled: boolean }): Promise<CSPRule | false> {
    return this.updateRule({ id: params.id, changes: { enabled: params.enabled } });
  }

  async reorderRules(ruleIds: string[]): Promise<void> {
    const rules = await this.cspRuleDAO.getAllRules();
    for (let i = 0; i < ruleIds.length; i++) {
      const rule = rules.find((r) => r.id === ruleIds[i]);
      if (rule) {
        rule.priority = ruleIds.length - i;
        await this.cspRuleDAO.saveRule(rule);
      }
    }
    await this.notifyRulesChanged();
  }

  init() {
    this.group.on("getAllRules", this.getAllRules.bind(this));
    this.group.on("getEnabledRules", this.getEnabledRules.bind(this));
    this.group.on("getCSPConfig", this.getCSPConfig.bind(this));
    this.group.on("toggleGlobal", this.toggleGlobal.bind(this));
    this.group.on("createRule", this.createRule.bind(this));
    this.group.on("updateRule", this.updateRule.bind(this));
    this.group.on("deleteRule", this.deleteRule.bind(this));
    this.group.on("toggleRule", this.toggleRule.bind(this));
    this.group.on("reorderRules", this.reorderRules.bind(this));
  }
}
