import type { SkillScriptMetadata, SkillScriptParam } from "@App/app/service/agent/core/types";

// 解析 ==SkillScript== 元数据头
export function parseSkillScriptMetadata(code: string): SkillScriptMetadata | null {
  const match = code.match(/\/\/\s*==SkillScript==([\s\S]*?)\/\/\s*==\/SkillScript==/);
  if (!match) return null;

  const block = match[1];
  const lines = block.split("\n");

  let name = "";
  let description = "";
  const params: SkillScriptParam[] = [];
  const grants: string[] = [];
  const requires: string[] = [];
  let timeout: number | undefined;

  for (const line of lines) {
    const trimmed = line.replace(/^\/\/\s*/, "").trim();
    if (!trimmed.startsWith("@")) continue;

    const atMatch = trimmed.match(/^@(\w+)\s*(.*)/);
    if (!atMatch) continue;

    const [, key, value] = atMatch;
    const val = value.trim();

    switch (key) {
      case "name":
        name = val;
        break;
      case "description":
        description = val;
        break;
      case "param":
        {
          const param = parseParam(val);
          if (param) params.push(param);
        }
        break;
      case "grant":
        if (val) grants.push(val);
        break;
      case "require":
        if (val) requires.push(val);
        break;
      case "timeout": {
        const n = Number(val);
        if (Number.isFinite(n) && n > 0) timeout = n;
        break;
      }
    }
  }

  if (!name) return null;

  return { name, description, params, grants, requires, ...(timeout !== undefined ? { timeout } : {}) };
}

// 解析 @param 行: name type [required] description
// type 支持 string|number|boolean，支持 enum [val1,val2]
function parseParam(raw: string): SkillScriptParam | null {
  // 匹配: paramName type [required] description
  // 或: paramName type[val1,val2] [required] description
  const match = raw.match(/^(\w+)\s+(string|number|boolean)(\[[^\]]*\])?\s*(.*)/);
  if (!match) return null;

  const [, name, type, enumPart, rest] = match;

  let enumValues: string[] | undefined;
  if (enumPart) {
    // 解析 [val1,val2]
    const inner = enumPart.slice(1, -1).trim();
    if (inner) {
      enumValues = inner.split(",").map((v) => v.trim());
    }
  }

  // rest 可能以 [required] 开头
  let required = false;
  let description = rest.trim();
  if (description.startsWith("[required]")) {
    required = true;
    description = description.slice("[required]".length).trim();
  }

  return {
    name,
    type: type as SkillScriptParam["type"],
    required,
    description,
    ...(enumValues ? { enum: enumValues } : {}),
  };
}

// 获取 Skill Script 脚本体（去掉元数据头）
export function getSkillScriptBody(code: string): string {
  return code.replace(/\/\/\s*==SkillScript==[\s\S]*?\/\/\s*==\/SkillScript==\s*/, "").trim();
}
