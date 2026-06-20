import { useEffect } from "react";
import type { SkillRecord } from "@App/app/service/agent/core/types";
import { agentClient } from "@App/pages/store/features/script";
import { createPreloadableQuery } from "@App/pages/preloadable-query";
import { loadSkillDetail, type SkillDetail } from "./skill_detail";

const skillDetailQuery = createPreloadableQuery<string, SkillDetail | null>({
  key: (name) => name,
  load: async (name, signal) => {
    const detail = await loadSkillDetail(name);
    if (signal.aborted) throw new DOMException("Skill detail preload aborted", "AbortError");
    return detail;
  },
});

const skillConfigQuery = createPreloadableQuery<SkillRecord | null, Record<string, unknown>>({
  key: (skill) => (skill ? `${skill.name}:${skill.updatetime ?? 0}` : ""),
  load: async (skill, signal) => {
    if (!skill?.config) return {};

    let saved: Record<string, unknown> = {};
    try {
      saved = await agentClient.getSkillConfigValues(skill.name);
    } catch {
      // 读取失败时沿用字段默认值，保持配置弹窗可用。
    }
    if (signal.aborted) throw new DOMException("Skill config preload aborted", "AbortError");

    const values: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(skill.config)) {
      values[key] = saved[key] !== undefined ? saved[key] : (field.default ?? "");
    }
    return values;
  },
});

export function preloadSkillDetail(name: string): Promise<SkillDetail | null> {
  return skillDetailQuery.preload(name);
}

export function invalidateSkillDetail(name?: string) {
  skillDetailQuery.invalidate(name);
}

export function preloadSkillConfig(skill: SkillRecord): Promise<Record<string, unknown>> {
  return skillConfigQuery.preload(skill);
}

export function invalidateSkillConfig(skill?: SkillRecord) {
  skillConfigQuery.invalidate(skill);
}

export function useSkillConfigPreload(skill: SkillRecord | null, enabled: boolean) {
  const query = skillConfigQuery.useQuery(skill, { enabled });

  useEffect(() => {
    if (!skill) return;
    return () => invalidateSkillConfig(skill);
  }, [skill]);

  return query;
}
