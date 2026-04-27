import { Repo } from "./repo";

export type CSPRuleAction = "remove" | "modify";

export interface CSPRule {
  id: string;
  name: string;
  description: string;
  path: string; // 匹配模式（URL/通配符/正则/域名）
  action: CSPRuleAction; // "remove" 删除CSP头 或 "modify" 修改为指定值
  actionValue?: string; // 当action为modify时的新CSP值
  priority: number; // 优先级，数字越大越先匹配
  enabled: boolean;
  createtime: number;
  updatetime: number;
}

/** CSP 全局配置的存储 key */
const CSP_CONFIG_KEY = "cspConfig";

export interface CSPConfig {
  globalEnabled: boolean; // 全局开关：开启后直接移除所有 URL 的 CSP 头
}

export class CSPRuleDAO extends Repo<CSPRule> {
  constructor() {
    super("cspRule");
  }

  async getAllRules(): Promise<CSPRule[]> {
    const rules = await this.find();
    return rules.sort((a, b) => b.priority - a.priority);
  }

  async getEnabledRules(): Promise<CSPRule[]> {
    const rules = await this.find((_, value) => value.enabled === true);
    return rules.sort((a, b) => b.priority - a.priority);
  }

  async saveRule(rule: CSPRule): Promise<CSPRule> {
    return this._save(rule.id, rule);
  }

  async deleteRule(id: string): Promise<void> {
    return this.delete(id);
  }

  async updateRule(id: string, changes: Partial<CSPRule>): Promise<CSPRule | false> {
    return this.update(id, changes);
  }

  async getCSPConfig(): Promise<CSPConfig> {
    return new Promise((resolve) => {
      chrome.storage.local.get(CSP_CONFIG_KEY, (result) => {
        if (chrome.runtime.lastError) {
          console.error("getCSPConfig error:", chrome.runtime.lastError);
          resolve({ globalEnabled: false });
          return;
        }
        const raw = result?.[CSP_CONFIG_KEY];
        if (raw) {
          try {
            resolve(JSON.parse(raw) as CSPConfig);
            return;
          } catch {
            // ignore
          }
        }
        resolve({ globalEnabled: false });
      });
    });
  }

  async saveCSPConfig(config: CSPConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [CSP_CONFIG_KEY]: JSON.stringify(config) }, () => {
        if (chrome.runtime.lastError) {
          console.error("saveCSPConfig error:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }
}
