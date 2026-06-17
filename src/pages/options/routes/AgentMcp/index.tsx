import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@App/pages/components/ui/button";
import { agentClient } from "@App/pages/store/features/script";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt } from "@App/app/service/agent/core/types";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { McpCard, type McpTestState } from "./McpCard";
import { McpFormDialog, type McpServerInput, type McpModalTestResult } from "./McpFormDialog";
import { McpDetailSheet } from "./McpDetailSheet";

type TestCount = { tools: number; resources: number; prompts: number };

export default function AgentMcp() {
  const { t } = useTranslation(["agent", "common"]);
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testStates, setTestStates] = useState<Record<string, McpTestState>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MCPServerConfig | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailServer, setDetailServer] = useState<MCPServerConfig | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTools, setDetailTools] = useState<MCPTool[]>([]);
  const [detailResources, setDetailResources] = useState<MCPResource[]>([]);
  const [detailPrompts, setDetailPrompts] = useState<MCPPrompt[]>([]);

  const reload = useCallback(async () => {
    const list = (await agentClient.mcpApi({ action: "listServers" })) as MCPServerConfig[];
    setServers(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditing(server);
    setDialogOpen(true);
  };

  const handleSubmit = async (config: McpServerInput) => {
    if (editing) {
      await agentClient.mcpApi({ action: "updateServer", id: editing.id, config });
    } else {
      await agentClient.mcpApi({ action: "addServer", config });
    }
    setDialogOpen(false);
    toast.success(t("common:save_success"));
    await reload();
  };

  // 弹窗内测试连接：先保存（新建或更新）拿到 id，再测试连接
  const handleModalTest = async (config: McpServerInput): Promise<McpModalTestResult> => {
    try {
      let id: string;
      if (editing) {
        await agentClient.mcpApi({ action: "updateServer", id: editing.id, config });
        id = editing.id;
      } else {
        const created = (await agentClient.mcpApi({ action: "addServer", config })) as MCPServerConfig;
        setEditing(created);
        id = created.id;
      }
      const r = (await agentClient.mcpApi({ action: "testConnection", id })) as TestCount;
      setTestStates((s) => ({ ...s, [id]: { status: "connected", ...r } }));
      await reload();
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };

  const handleTest = async (server: MCPServerConfig) => {
    try {
      const r = (await agentClient.mcpApi({ action: "testConnection", id: server.id })) as TestCount;
      setTestStates((s) => ({ ...s, [server.id]: { status: "connected", ...r } }));
      toast.success(t("agent:provider_test_success"));
    } catch (e) {
      setTestStates((s) => ({ ...s, [server.id]: { status: "failed" } }));
      toast.error(`${t("agent:provider_test_failed")}: ${e}`);
    }
  };

  const handleToggle = async (server: MCPServerConfig, enabled: boolean) => {
    await agentClient.mcpApi({ action: "updateServer", id: server.id, config: { enabled } });
    await reload();
  };

  const handleDelete = async (server: MCPServerConfig) => {
    await agentClient.mcpApi({ action: "removeServer", id: server.id });
    toast.success(t("common:delete_success"));
    await reload();
  };

  const handleDetail = async (server: MCPServerConfig) => {
    setDetailServer(server);
    setDetailOpen(true);
    setDetailLoading(true);
    const [tools, resources, prompts] = await Promise.all([
      agentClient.mcpApi({ action: "listTools", serverId: server.id }).catch(() => []),
      agentClient.mcpApi({ action: "listResources", serverId: server.id }).catch(() => []),
      agentClient.mcpApi({ action: "listPrompts", serverId: server.id }).catch(() => []),
    ]);
    setDetailTools(tools as MCPTool[]);
    setDetailResources(resources as MCPResource[]);
    setDetailPrompts(prompts as MCPPrompt[]);
    setDetailLoading(false);
  };

  return (
    <div className="flex h-full flex-col">
      <AgentPageHeader
        icon={Server}
        title={t("agent:mcp_title")}
        subtitle={t("agent:mcp_subtitle")}
        actions={
          <Button data-testid="mcp-add" onClick={handleAdd}>
            <Plus className="size-4" />
            {t("agent:mcp_add_server")}
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        {!loading && servers.length === 0 ? (
          <AgentEmptyState
            icon={Server}
            title={t("agent:mcp_no_servers")}
            description={t("agent:mcp_no_servers_desc")}
            action={
              <Button onClick={handleAdd}>
                <Plus className="size-4" />
                {t("agent:mcp_add_server")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {servers.map((server) => (
              <McpCard
                key={server.id}
                server={server}
                testState={testStates[server.id]}
                onEdit={() => handleEdit(server)}
                onDelete={() => handleDelete(server)}
                onTest={() => handleTest(server)}
                onToggle={(enabled) => handleToggle(server, enabled)}
                onDetail={() => handleDetail(server)}
              />
            ))}
          </div>
        )}
      </div>

      <McpFormDialog
        open={dialogOpen}
        value={editing}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        onTest={handleModalTest}
      />
      <McpDetailSheet
        open={detailOpen}
        server={detailServer}
        onOpenChange={setDetailOpen}
        tools={detailTools}
        resources={detailResources}
        prompts={detailPrompts}
        loading={detailLoading}
      />
    </div>
  );
}
