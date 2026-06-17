import { useTranslation } from "react-i18next";
import { Plug, Eye, Pencil, Trash2, Wrench, FileText, MessageSquare } from "lucide-react";
import type { MCPServerConfig } from "@App/app/service/agent/core/types";
import { Switch } from "@App/pages/components/ui/switch";
import { AgentCardMenu, type AgentCardMenuItem } from "../_agent/AgentCardMenu";
import { StatusDot, CapabilityTag } from "../_agent/tags";

export type McpTestState = {
  status: "connected" | "failed" | "untested";
  tools?: number;
  resources?: number;
  prompts?: number;
};

export function McpCard({
  server,
  testState,
  onEdit,
  onDelete,
  onTest,
  onToggle,
  onDetail,
}: {
  server: MCPServerConfig;
  testState?: McpTestState;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onDetail: () => void;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const menuItems: AgentCardMenuItem[] = [
    { key: "detail", label: t("agent:mcp_detail"), icon: Eye, onSelect: onDetail },
    { key: "test", label: t("agent:mcp_test_connection"), icon: Plug, onSelect: onTest },
    { key: "edit", label: t("common:edit"), icon: Pencil, onSelect: onEdit },
    { key: "delete", label: t("common:delete"), icon: Trash2, danger: true, onSelect: onDelete },
  ];

  const status = testState?.status ?? "untested";
  const statusTone = status === "connected" ? "success" : status === "failed" ? "error" : "muted";
  const statusLabel =
    status === "connected"
      ? t("agent:mcp_status_connected")
      : status === "failed"
        ? t("agent:mcp_status_failed")
        : t("agent:mcp_status_untested");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-[18px]">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-success-bg">
          <Plug className="size-[18px] text-success-fg" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{server.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{server.url}</span>
        </div>
        <Switch data-testid="mcp-toggle" checked={server.enabled} onCheckedChange={(v) => onToggle(v)} />
        <AgentCardMenu items={menuItems} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
        {status === "connected" && (
          <>
            <CapabilityTag tone="blue" icon={Wrench}>
              {t("agent:mcp_tools")} {testState?.tools ?? 0}
            </CapabilityTag>
            <CapabilityTag tone="violet" icon={FileText}>
              {t("agent:mcp_resources")} {testState?.resources ?? 0}
            </CapabilityTag>
            <CapabilityTag tone="orange" icon={MessageSquare}>
              {t("agent:mcp_prompts")} {testState?.prompts ?? 0}
            </CapabilityTag>
          </>
        )}
      </div>
    </div>
  );
}
