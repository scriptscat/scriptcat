import type { SkillMetadata } from "@App/app/service/agent/types";
import { loadAsyncJSZip } from "./jszip-x";

// 解析 SKILL.md 内容：YAML frontmatter + markdown body
export function parseSkillMd(content: string): { metadata: SkillMetadata; prompt: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return null;

  const [, frontmatter, body] = match;

  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    // 解析 key: value 格式
    const kvMatch = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, rawValue] = kvMatch;
    // 去除引号
    const value = rawValue.replace(/^["']|["']$/g, "").trim();

    switch (key) {
      case "name":
        name = value;
        break;
      case "description":
        description = value;
        break;
    }
  }

  if (!name) return null;

  return {
    metadata: { name, description },
    prompt: body.trim(),
  };
}

// 解析 Skill ZIP 包：提取 SKILL.md、tools/*.js、references/*
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

  // 查找 SKILL.md：根目录或第一层子目录
  let skillMdPath = "";
  let prefix = "";
  for (const path of Object.keys(files)) {
    const normalized = path.replace(/\\/g, "/");
    if (normalized === "SKILL.md" || normalized.endsWith("/SKILL.md")) {
      const parts = normalized.split("/");
      if (parts.length === 1) {
        // 根目录
        skillMdPath = path;
        prefix = "";
        break;
      } else if (parts.length === 2) {
        // 一层子目录
        skillMdPath = path;
        prefix = parts[0] + "/";
        break;
      }
    }
  }

  if (!skillMdPath) {
    throw new Error("ZIP 包中未找到 SKILL.md");
  }

  const skillMd: string = await files[skillMdPath].async("string");

  // 提取 tools/*.js
  const scripts: Array<{ name: string; code: string }> = [];
  const toolsDir = prefix + "tools/";
  for (const [path, file] of Object.entries(files)) {
    if ((file as any).dir) continue;
    const normalized = path.replace(/\\/g, "/");
    if (normalized.startsWith(toolsDir) && normalized.endsWith(".js")) {
      const name = normalized.slice(toolsDir.length);
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
