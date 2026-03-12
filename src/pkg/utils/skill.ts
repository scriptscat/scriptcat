import type { SkillMetadata } from "@App/app/service/agent/types";

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
