import { SkillRepo } from "@App/app/repo/skill_repo";
import type { SkillRecord, SkillReference, SkillScriptRecord } from "@App/app/service/agent/core/types";

const skillRepo = new SkillRepo();

export interface SkillDetail {
  record: SkillRecord; // 含 prompt 与 config schema
  scripts: SkillScriptRecord[]; // 随包脚本（含完整代码）
  references: SkillReference[]; // 参考资料
}

/** 读取单个 Skill 的完整详情（提示词 + 工具代码 + 参考资料），供详情弹窗使用 */
export async function loadSkillDetail(name: string): Promise<SkillDetail | null> {
  const record = await skillRepo.getSkill(name);
  if (!record) return null;
  const [scripts, references] = await Promise.all([
    skillRepo.getSkillScripts(name),
    skillRepo.getSkillReferences(name),
  ]);
  return { record, scripts, references };
}
