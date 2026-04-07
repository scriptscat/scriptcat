import type { SkillConfigField, SkillMetadata } from "@App/app/service/agent/core/types";
import { parse as parseYaml } from "yaml";
import { loadAsyncJSZip } from "./jszip-x";

// 校验并规范化单个 config 字段
function normalizeConfigField(raw: Record<string, unknown>): SkillConfigField {
  const type = (raw.type as string) || "text";
  const field: SkillConfigField = {
    title: String(raw.title || ""),
    type: type as SkillConfigField["type"],
  };
  if (raw.secret === true) field.secret = true;
  if (raw.required === true) field.required = true;
  if (raw.default !== undefined) field.default = raw.default;
  if (Array.isArray(raw.values)) field.values = raw.values.map(String);
  return field;
}

// 解析 SKILL.cat.md 内容：YAML frontmatter + markdown body
export function parseSkillMd(content: string): { metadata: SkillMetadata; prompt: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return null;

  const [, frontmatter, body] = match;

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(frontmatter);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const name = typeof parsed.name === "string" ? parsed.name : "";
  if (!name) return null;

  const description = typeof parsed.description === "string" ? parsed.description : "";
  const version = typeof parsed.version === "string" ? parsed.version : undefined;

  // 解析 scripts 文件名列表（URL 安装时使用）
  const scripts = Array.isArray(parsed.scripts)
    ? parsed.scripts.filter((s): s is string => typeof s === "string")
    : undefined;

  // 解析 references 文件名列表（URL 安装时使用）
  const references = Array.isArray(parsed.references)
    ? parsed.references.filter((r): r is string => typeof r === "string")
    : undefined;

  // 解析 config 块
  let config: Record<string, SkillConfigField> | undefined;
  if (parsed.config && typeof parsed.config === "object" && !Array.isArray(parsed.config)) {
    const rawConfig = parsed.config as Record<string, unknown>;
    const entries = Object.entries(rawConfig);
    if (entries.length > 0) {
      config = {};
      for (const [key, value] of entries) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          config[key] = normalizeConfigField(value as Record<string, unknown>);
        }
      }
      // 如果解析后没有有效字段，置为 undefined
      if (Object.keys(config).length === 0) config = undefined;
    }
  }

  return {
    metadata: {
      name,
      description,
      ...(version ? { version } : {}),
      ...(scripts?.length ? { scripts } : {}),
      ...(references?.length ? { references } : {}),
      ...(config ? { config } : {}),
    },
    prompt: body.trim(),
  };
}

// 解析 Skill ZIP 包：提取 SKILL.md、scripts/*.js、references/*
export async function parseSkillZip(data: ArrayBuffer): Promise<{
  skillMd: string;
  scripts: Array<{ name: string; code: string }>;
  references: Array<{ name: string; content: string }>;
}> {
  const zip = await loadAsyncJSZip(data);
  const files: Record<string, any> = {};
  // @ts-ignore JSZip forEach
  zip.forEach((relativePath: string, file: any) => {
    files[relativePath] = file;
  });

  // 查找 SKILL.cat.md 或 SKILL.md：根目录或第一层子目录
  let skillMdPath = "";
  let prefix = "";
  const skillFileNames = ["SKILL.cat.md", "SKILL.md"];
  for (const path of Object.keys(files)) {
    const normalized = path.replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() || "";
    if (!skillFileNames.includes(fileName)) continue;
    const parts = normalized.split("/");
    if (parts.length === 1) {
      // 根目录（优先 SKILL.cat.md）
      if (!skillMdPath || fileName === "SKILL.cat.md") {
        skillMdPath = path;
        prefix = "";
      }
    } else if (parts.length === 2 && !skillMdPath) {
      // 一层子目录
      skillMdPath = path;
      prefix = parts[0] + "/";
    }
  }

  if (!skillMdPath) {
    throw new Error("ZIP 包中未找到 SKILL.cat.md 或 SKILL.md");
  }

  const skillMd: string = await files[skillMdPath].async("string");

  // 提取 scripts/*.js
  const scripts: Array<{ name: string; code: string }> = [];
  const scriptsDir = prefix + "scripts/";
  for (const [path, file] of Object.entries(files)) {
    if ((file as any).dir) continue;
    const normalized = path.replace(/\\/g, "/");
    if (normalized.startsWith(scriptsDir) && normalized.endsWith(".js")) {
      const name = normalized.slice(scriptsDir.length);
      if (name && !name.includes("/")) {
        const code: string = await (file as any).async("string");
        scripts.push({ name, code });
      }
    }
  }

  // 提取 references/*
  const references: Array<{ name: string; content: string }> = [];
  const refsDir = prefix + "references/";
  for (const [path, file] of Object.entries(files)) {
    if ((file as any).dir) continue;
    const normalized = path.replace(/\\/g, "/");
    if (normalized.startsWith(refsDir)) {
      const name = normalized.slice(refsDir.length);
      if (name && !name.includes("/")) {
        const content: string = await (file as any).async("string");
        references.push({ name, content });
      }
    }
  }

  return { skillMd, scripts, references };
}
