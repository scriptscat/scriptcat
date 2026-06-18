import { useTranslation } from "react-i18next";
import {
  Plug,
  Eye,
  Pencil,
  Trash2,
  Wrench,
  FileText,
  MessageSquareQuote,
  Link as LinkIcon,
  KeyRound,
  List,
} from "lucide-react";
import type { MCPServerConfig } from "@App/app/service/agent/core/types";
import { Switch } from "@App/pages/components/ui/switch";
import { cn } from "@App/pkg/utils/cn";
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

  const headerCount = server.headers ? Object.keys(server.headers).length : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-[18px]",
        !server.enabled && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-success-bg">
          <Plug className="size-5 text-success-fg" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{server.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <LinkIcon className="size-3 shrink-0" />
            <span className="truncate font-mono">{server.url}</span>
          </span>
        </div>
        <Switch data-testid="mcp-toggle" checked={server.enabled} onCheckedChange={(v) => onToggle(v)} />
        <AgentCardMenu items={menuItems} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
        {server.apiKey && (
          <CapabilityTag tone="muted" icon={KeyRound}>
            {t("agent:mcp_has_key")}
          </CapabilityTag>
        )}
        {headerCount > 0 && (
          <CapabilityTag tone="muted" icon={List}>
            {t("agent:mcp_headers_count", { count: headerCount })}
          </CapabilityTag>
        )}
      </div>

      {status === "connected" && !!(testState?.tools || testState?.resources || testState?.prompts) && (
        <div className="flex flex-wrap items-center gap-2">
          {!!testState?.tools && (
            <CapabilityTag tone="blue" icon={Wrench}>
              {testState.tools} {t("agent:mcp_tools")}
            </CapabilityTag>
          )}
          {!!testState?.resources && (
            <CapabilityTag tone="green" icon={FileText}>
              {testState.resources} {t("agent:mcp_resources")}
            </CapabilityTag>
          )}
          {!!testState?.prompts && (
            <CapabilityTag tone="violet" icon={MessageSquareQuote}>
              {testState.prompts} {t("agent:mcp_prompts")}
            </CapabilityTag>
          )}
        </div>
      )}
    </div>
  );
}
