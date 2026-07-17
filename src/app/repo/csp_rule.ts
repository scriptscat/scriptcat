import { normalizeCspDomain } from "@App/pkg/utils/csp_domain";
import { Repo } from "./repo";

export const CSP_RULE_SCHEMA_VERSION = 1 as const;
export const MAX_CSP_RULES = 100;
export const MAX_CSP_DOMAINS_PER_RULE = 100;
export const MAX_CSP_UNIQUE_DOMAINS = 1000;

export type CspRuleTarget = { type: "domains"; domains: string[] } | { type: "allSites" };

export type CspRuleAction = { type: "removeCspHeaders" };

export type CspRule = {
  id: string;
  name: string;
  enabled: boolean;
  target: CspRuleTarget;
  action: CspRuleAction;
  createdAt: number;
  updatedAt: number;
};

export type CspRuleState = {
  schemaVersion: typeof CSP_RULE_SCHEMA_VERSION;
  revision: number;
  masterEnabled: boolean;
  rules: CspRule[];
};

export class CspRuleValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly messageKey: string
  ) {
    super(messageKey);
    this.name = "CspRuleValidationError";
  }
}

export class CspRuleStorageError extends Error {
  constructor() {
    super("storage_write_failed");
    this.name = "CspRuleStorageError";
  }
}

export const DEFAULT_CSP_RULE_STATE: CspRuleState = {
  schemaVersion: CSP_RULE_SCHEMA_VERSION,
  revision: 0,
  masterEnabled: true,
  rules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateTarget(target: unknown, path: string): target is CspRuleTarget {
  if (!isRecord(target) || (target.type !== "domains" && target.type !== "allSites")) {
    throw new CspRuleValidationError(path, "target_invalid");
  }
  if (target.type === "allSites") return true;
  if (!Array.isArray(target.domains) || target.domains.length < 1 || target.domains.length > MAX_CSP_DOMAINS_PER_RULE) {
    throw new CspRuleValidationError(`${path}.domains`, "domain_count_invalid");
  }
  const domains = new Set<string>();
  for (const [index, domain] of target.domains.entries()) {
    if (typeof domain !== "string" || normalizeCspDomain(domain) !== domain) {
      throw new CspRuleValidationError(`${path}.domains[${index}]`, "domain_invalid");
    }
    if (domains.has(domain)) throw new CspRuleValidationError(`${path}.domains[${index}]`, "domain_duplicate");
    domains.add(domain);
  }
  return true;
}

export function validateCspRuleState(value: unknown): asserts value is CspRuleState {
  if (!isRecord(value) || value.schemaVersion !== CSP_RULE_SCHEMA_VERSION) {
    throw new CspRuleValidationError("schemaVersion", "unsupported_schema");
  }
  const revision = value.revision;
  const masterEnabled = value.masterEnabled;
  const rules = value.rules;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    throw new CspRuleValidationError("revision", "revision_invalid");
  }
  if (typeof masterEnabled !== "boolean") {
    throw new CspRuleValidationError("masterEnabled", "boolean_invalid");
  }
  if (!Array.isArray(rules) || rules.length > MAX_CSP_RULES) {
    throw new CspRuleValidationError("rules", "rule_count_invalid");
  }

  const ids = new Set<string>();
  const uniqueDomains = new Set<string>();
  for (const [index, rawRule] of rules.entries()) {
    const path = `rules[${index}]`;
    if (!isRecord(rawRule)) throw new CspRuleValidationError(path, "rule_invalid");
    const rule = rawRule;
    const target = rule.target;
    if (typeof rule.id !== "string" || !rule.id || ids.has(rule.id)) {
      throw new CspRuleValidationError(`${path}.id`, "rule_id_invalid");
    }
    ids.add(rule.id);
    if (typeof rule.name !== "string" || !rule.name.trim() || Array.from(rule.name).length > 80) {
      throw new CspRuleValidationError(`${path}.name`, "rule_name_invalid");
    }
    if (typeof rule.enabled !== "boolean") throw new CspRuleValidationError(`${path}.enabled`, "boolean_invalid");
    if (!isRecord(rule.action) || rule.action.type !== "removeCspHeaders") {
      throw new CspRuleValidationError(`${path}.action`, "action_invalid");
    }
    if (
      typeof rule.createdAt !== "number" ||
      !Number.isFinite(rule.createdAt) ||
      !Number.isInteger(rule.createdAt) ||
      rule.createdAt < 0
    ) {
      throw new CspRuleValidationError(`${path}.createdAt`, "timestamp_invalid");
    }
    if (
      typeof rule.updatedAt !== "number" ||
      !Number.isFinite(rule.updatedAt) ||
      !Number.isInteger(rule.updatedAt) ||
      rule.updatedAt < 0
    ) {
      throw new CspRuleValidationError(`${path}.updatedAt`, "timestamp_invalid");
    }
    validateTarget(target, `${path}.target`);
    if (isRecord(target) && target.type === "domains" && Array.isArray(target.domains)) {
      for (const domain of target.domains) uniqueDomains.add(domain);
    }
  }
  if (uniqueDomains.size > MAX_CSP_UNIQUE_DOMAINS) {
    throw new CspRuleValidationError("rules", "unique_domain_count_invalid");
  }
}

export class CspRuleStateDAO extends Repo<CspRuleState> {
  constructor() {
    super("csp_rule");
  }

  getState(): Promise<CspRuleState | undefined> {
    return this.get("state");
  }

  async saveState(state: CspRuleState): Promise<CspRuleState> {
    validateCspRuleState(state);
    try {
      await this._save("state", state);
      const saved = await this.getState();
      if (!saved || JSON.stringify(saved) !== JSON.stringify(state)) throw new CspRuleStorageError();
      return saved;
    } catch (error) {
      if (error instanceof CspRuleStorageError) throw error;
      throw new CspRuleStorageError();
    }
  }
}
