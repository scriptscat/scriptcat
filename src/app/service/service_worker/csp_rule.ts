import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import LoggerCore from "@App/app/logger/core";
import { uuidv4 } from "@App/pkg/utils/uuid";
import {
  CspRuleStorageError,
  CspRuleStorageReadError,
  CspRuleValidationError,
  DEFAULT_CSP_RULE_STATE,
  type CspRule,
  type CspRuleState,
  type CspRuleTarget,
  validateCspRuleState,
} from "@App/app/repo/csp_rule";
import type { CspRuleStateDAO } from "@App/app/repo/csp_rule";
import { CspDomainError, normalizeCspDomain } from "@App/pkg/utils/csp_domain";
import { type CspRuleApplier, compileCspRules } from "./csp_rule_compiler";

export type { CspRuleApplier } from "./csp_rule_compiler";

export type CspRuleTargetInput = CspRuleTarget;
export type CspRuleCreateInput = {
  baseRevision: number;
  name?: string;
  enabled: boolean;
  target: CspRuleTargetInput;
};
export type CspRuleUpdateInput = {
  baseRevision: number;
  id: string;
  patch: Partial<Pick<CspRule, "name" | "target">>;
};
export type CspRuleEnabledInput = { baseRevision: number; id: string; enabled: boolean };
export type CspRuleDeleteInput = { baseRevision: number; id: string };
export type CspRuleMasterEnabledInput = { baseRevision: number; enabled: boolean };

export type CspApplyStatus =
  | { state: "applied"; revision: number; appliedAt: number }
  | {
      state: "error";
      code: "dnr_apply_failed";
      desiredRevision: number;
      lastAppliedRevision?: number;
      message: string;
    };

export type CspRuleSnapshot = { state: CspRuleState; apply: CspApplyStatus };
export type CspMutationResult = CspRuleSnapshot & { outcome: "applied" | "apply-error" };

export type CspRuleServiceErrorCode =
  | "invalid_input"
  | "not_found"
  | "revision_conflict"
  | "storage_read_failed"
  | "storage_write_failed"
  | "unsupported_schema";

export type CspRuleServiceError = {
  code: CspRuleServiceErrorCode;
  path?: string;
  messageKey?: string;
  snapshot?: CspRuleSnapshot;
};

export function isCspRuleOwner(inIncognitoContext: boolean): boolean {
  return !inIncognitoContext;
}

function serviceError(
  code: CspRuleServiceErrorCode,
  details: Omit<CspRuleServiceError, "code"> = {}
): CspRuleServiceError {
  return { code, ...details };
}

function cloneTarget(target: CspRuleTarget): CspRuleTarget {
  return target.type === "allSites" ? { type: "allSites" } : { type: "domains", domains: [...target.domains] };
}

function sameTarget(left: CspRuleTarget, right: CspRuleTarget): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function defaultRuleName(target: CspRuleTarget): string {
  if (target.type === "allSites") return "All websites";
  return `${target.domains[0]}${target.domains.length > 1 ? ` + ${target.domains.length - 1}` : ""}`;
}

function normalizeRuleName(name: unknown, target: CspRuleTarget, path: string): string {
  if (name === undefined || (typeof name === "string" && name.trim() === "")) return defaultRuleName(target);
  if (typeof name !== "string" || Array.from(name.trim()).length > 80) {
    throw serviceError("invalid_input", { path, messageKey: "rule_name_invalid" });
  }
  return name.trim();
}

function normalizeTarget(target: unknown, path: string): CspRuleTarget {
  if (!target || typeof target !== "object" || !("type" in target)) {
    throw serviceError("invalid_input", { path, messageKey: "target_invalid" });
  }
  const input = target as { type?: unknown; domains?: unknown };
  if (input.type === "allSites") return { type: "allSites" };
  if (input.type !== "domains" || !Array.isArray(input.domains)) {
    throw serviceError("invalid_input", { path, messageKey: "target_invalid" });
  }
  if (input.domains.length === 0) {
    throw serviceError("invalid_input", { path: `${path}.domains`, messageKey: "domain_required" });
  }
  const domains: string[] = [];
  for (const [index, domain] of input.domains.entries()) {
    try {
      if (typeof domain !== "string") throw new CspDomainError("domain_invalid");
      const normalized = normalizeCspDomain(domain);
      if (!domains.includes(normalized)) domains.push(normalized);
    } catch (error) {
      const messageKey = error instanceof CspDomainError ? error.messageKey : "domain_invalid";
      throw serviceError("invalid_input", { path: `${path}.domains[${index}]`, messageKey });
    }
  }
  return { type: "domains", domains };
}

function validateBaseRevision(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw serviceError("invalid_input", { path: "baseRevision", messageKey: "revision_invalid" });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "DNR update failed";
}

export class CspRuleService {
  private readonly logger = LoggerCore.getInstance().logger({ service: "cspRuleService" });
  private confirmedState: CspRuleState | undefined;
  private applyStatus: CspApplyStatus | undefined;
  private ready: Promise<void> = Promise.resolve();
  private mutationQueue: Promise<void> = Promise.resolve();
  private initializationError: CspRuleServiceError | undefined;

  constructor(
    private readonly group: Group,
    private readonly messageQueue: IMessageQueue,
    private readonly stateDAO: CspRuleStateDAO,
    private readonly compiler: typeof compileCspRules = compileCspRules,
    private readonly applier: CspRuleApplier
  ) {}

  init() {
    this.group.on("getState", () => this.getState());
    this.group.on("createRule", (input: CspRuleCreateInput) => this.createRule(input));
    this.group.on("updateRule", (input: CspRuleUpdateInput) => this.updateRule(input));
    this.group.on("deleteRule", (input: CspRuleDeleteInput) => this.deleteRule(input));
    this.group.on("setRuleEnabled", (input: CspRuleEnabledInput) => this.setRuleEnabled(input));
    this.group.on("setMasterEnabled", (input: CspRuleMasterEnabledInput) => this.setMasterEnabled(input));
    this.group.on("retryApply", () => this.retryApply());
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.initializationError = undefined;
    let state: CspRuleState;
    try {
      state = (await this.stateDAO.getState()) ?? { ...DEFAULT_CSP_RULE_STATE, rules: [] };
      validateCspRuleState(state);
    } catch (error) {
      if (error instanceof CspRuleValidationError) {
        try {
          await this.applier.apply([]);
        } catch {
          // 清理失败时保留原数据，并让 retryApply 重新执行清理。
        }
        this.initializationError = serviceError("unsupported_schema", {
          path: error.path,
          messageKey: error.messageKey,
        });
      } else if (error instanceof CspRuleStorageReadError) {
        this.initializationError = serviceError("storage_read_failed");
      } else {
        this.initializationError = serviceError("storage_write_failed");
      }
      return;
    }
    this.confirmedState = state;
    await this.reconcile(state);
  }

  private async waitUntilReady(): Promise<void> {
    await this.ready;
    if (this.initializationError) throw this.initializationError;
  }

  private snapshot(): CspRuleSnapshot {
    if (!this.confirmedState || !this.applyStatus) throw serviceError("storage_write_failed");
    return { state: this.confirmedState, apply: this.applyStatus };
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(() => this.stateDAO.runExclusive(operation));
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async reconcile(state: CspRuleState): Promise<CspApplyStatus> {
    try {
      await this.applier.apply(this.compiler(state));
      const applied: CspApplyStatus = { state: "applied", revision: state.revision, appliedAt: Date.now() };
      this.applyStatus = applied;
      return applied;
    } catch (error) {
      const previous = this.applyStatus;
      const failed: CspApplyStatus = {
        state: "error",
        code: "dnr_apply_failed",
        desiredRevision: state.revision,
        lastAppliedRevision: previous?.state === "applied" ? previous.revision : previous?.lastAppliedRevision,
        message: errorMessage(error),
      };
      this.applyStatus = failed;
      return failed;
    }
  }

  private async getState(): Promise<CspRuleSnapshot> {
    await this.waitUntilReady();
    return this.snapshot();
  }

  private async currentForMutation(baseRevision: unknown): Promise<CspRuleState> {
    await this.waitUntilReady();
    validateBaseRevision(baseRevision);
    let persisted: CspRuleState | undefined;
    try {
      persisted = await this.stateDAO.getState();
      if (persisted) validateCspRuleState(persisted);
    } catch (error) {
      if (error instanceof CspRuleValidationError) {
        throw serviceError("unsupported_schema", { path: error.path, messageKey: error.messageKey });
      }
      if (error instanceof CspRuleStorageReadError) throw serviceError("storage_read_failed");
      throw serviceError("storage_write_failed");
    }
    if (persisted) this.confirmedState = persisted;
    const current = this.confirmedState!;
    if (baseRevision !== current.revision) {
      throw serviceError("revision_conflict", { snapshot: this.snapshot() });
    }
    return current;
  }

  private async saveAndApply(state: CspRuleState): Promise<CspMutationResult> {
    let saved: CspRuleState;
    try {
      saved = await this.stateDAO.saveState(state);
      validateCspRuleState(saved);
      if (JSON.stringify(saved) !== JSON.stringify(state)) throw new CspRuleStorageError();
    } catch (error) {
      if (error instanceof CspRuleValidationError) {
        throw serviceError("storage_write_failed", { path: error.path, messageKey: error.messageKey });
      }
      throw serviceError("storage_write_failed");
    }
    this.confirmedState = saved;
    const apply = await this.reconcile(saved);
    const snapshot = this.snapshot();
    this.publishStateChanged(snapshot);
    return { ...snapshot, outcome: apply.state === "applied" ? "applied" : "apply-error" };
  }

  private publishStateChanged(snapshot: CspRuleSnapshot): void {
    try {
      this.messageQueue.publish("cspRule/stateChanged", snapshot);
    } catch (error) {
      this.logger.warn("发布 CSP 规则状态失败", { error: String(error) });
    }
  }

  private async createRule(input: CspRuleCreateInput): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      if (typeof input?.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      const target = normalizeTarget(input.target, "target");
      const name = normalizeRuleName(input.name, target, "name");
      const now = Date.now();
      const rule: CspRule = {
        id: uuidv4(),
        name,
        enabled: input.enabled,
        target,
        action: { type: "removeCspHeaders" },
        createdAt: now,
        updatedAt: now,
      };
      const state: CspRuleState = { ...current, revision: current.revision + 1, rules: [...current.rules, rule] };
      try {
        validateCspRuleState(state);
      } catch (error) {
        if (error instanceof CspRuleValidationError) {
          throw serviceError("invalid_input", { path: error.path, messageKey: error.messageKey });
        }
        throw error;
      }
      return this.saveAndApply(state);
    });
  }

  private async updateRule(input: CspRuleUpdateInput): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const index = current.rules.findIndex((rule) => rule.id === input?.id);
      if (index < 0) throw serviceError("not_found", { path: "id", messageKey: "rule_not_found" });
      const patch = input.patch;
      if (!patch || Object.keys(patch).length === 0) {
        throw serviceError("invalid_input", { path: "patch", messageKey: "patch_empty" });
      }
      for (const key of Object.keys(patch)) {
        if (key !== "name" && key !== "target") {
          throw serviceError("invalid_input", { path: `patch.${key}`, messageKey: "patch_field_invalid" });
        }
      }
      const oldRule = current.rules[index];
      const target =
        patch.target === undefined ? cloneTarget(oldRule.target) : normalizeTarget(patch.target, "patch.target");
      const name = normalizeRuleName(patch.name === undefined ? oldRule.name : patch.name, target, "patch.name");
      if (name === oldRule.name && sameTarget(target, oldRule.target)) {
        return { ...this.snapshot(), outcome: this.applyStatus?.state === "applied" ? "applied" : "apply-error" };
      }
      const rules = [...current.rules];
      rules[index] = { ...oldRule, name, target, updatedAt: Date.now() };
      const state: CspRuleState = { ...current, revision: current.revision + 1, rules };
      try {
        validateCspRuleState(state);
      } catch (error) {
        if (error instanceof CspRuleValidationError) {
          throw serviceError("invalid_input", { path: error.path, messageKey: error.messageKey });
        }
        throw error;
      }
      return this.saveAndApply(state);
    });
  }

  private async deleteRule(input: CspRuleDeleteInput): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      if (!current.rules.some((rule) => rule.id === input?.id)) {
        throw serviceError("not_found", { path: "id", messageKey: "rule_not_found" });
      }
      const state: CspRuleState = {
        ...current,
        revision: current.revision + 1,
        rules: current.rules.filter((rule) => rule.id !== input.id),
      };
      return this.saveAndApply(state);
    });
  }

  private async setRuleEnabled(input: CspRuleEnabledInput): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      const index = current.rules.findIndex((rule) => rule.id === input?.id);
      if (index < 0) throw serviceError("not_found", { path: "id", messageKey: "rule_not_found" });
      if (typeof input.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      if (current.rules[index].enabled === input.enabled) {
        return { ...this.snapshot(), outcome: this.applyStatus?.state === "applied" ? "applied" : "apply-error" };
      }
      const rules = [...current.rules];
      rules[index] = { ...rules[index], enabled: input.enabled, updatedAt: Date.now() };
      return this.saveAndApply({ ...current, revision: current.revision + 1, rules });
    });
  }

  private async setMasterEnabled(input: CspRuleMasterEnabledInput): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const current = await this.currentForMutation(input?.baseRevision);
      if (typeof input.enabled !== "boolean") {
        throw serviceError("invalid_input", { path: "enabled", messageKey: "boolean_invalid" });
      }
      if (current.masterEnabled === input.enabled) {
        return { ...this.snapshot(), outcome: this.applyStatus?.state === "applied" ? "applied" : "apply-error" };
      }
      return this.saveAndApply({ ...current, masterEnabled: input.enabled, revision: current.revision + 1 });
    });
  }

  private async retryApply(): Promise<CspMutationResult> {
    return this.enqueue(async () => {
      const recoveringInitialization = this.initializationError !== undefined;
      if (recoveringInitialization) {
        await this.initialize();
        await this.waitUntilReady();
      } else {
        await this.waitUntilReady();
      }
      const state = this.confirmedState!;
      const apply = recoveringInitialization ? this.applyStatus! : await this.reconcile(state);
      const snapshot = this.snapshot();
      this.publishStateChanged(snapshot);
      return { ...snapshot, outcome: apply.state === "applied" ? "applied" : "apply-error" };
    });
  }
}
