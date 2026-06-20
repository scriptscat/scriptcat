import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";

// Agent 各管理页对应的文档深链路径(对齐 v1.4-agent 的 DOC_PATHS),用于页头「文档」按钮直达对应文档页而非站点根。
const DOC_PATHS = {
  provider: "agent-model",
  skills: "agent-skill-install",
  mcp: "agent-mcp",
  tasks: "agent-task",
  opfs: "agent-opfs",
  settings: "agent",
} as const;

export type AgentDocPage = keyof typeof DOC_PATHS;

// 按当前界面语言拼出文档深链:`<站点><语言段>/docs/dev/agent/<path>`。
export function agentDocUrl(page: AgentDocPage): string {
  return `${DocumentationSite}${localePath}/docs/dev/agent/${DOC_PATHS[page]}`;
}
