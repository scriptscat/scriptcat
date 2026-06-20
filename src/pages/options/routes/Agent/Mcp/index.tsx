import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Plug } from "lucide-react";
import { notify } from "@App/pages/components/ui/toast";
import { Button } from "@App/pages/components/ui/button";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { agentClient } from "@App/pages/store/features/script";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt } from "@App/app/service/agent/core/types";
import { AgentPageHeader } from "../components/AgentPageHeader";
import { agentDocUrl } from "../components/agentDocs";
import { AgentEmptyState } from "../components/AgentEmptyState";
import { CountBar, type CountBarSegment } from "../components/CountBar";
import { McpCard, type McpTestState } from "./McpCard";
import { McpFormDialog, type McpServerInput, type McpModalTestResult } from "./McpFormDialog";
import { McpDetailSheet } from "./McpDetailSheet";

type TestCount = { tools: number; resources: number; prompts: number };

export default function AgentMcp() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
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
    notify.success(t("common:save_success"));
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
      notify.success(t("agent:provider_test_success"));
    } catch (e) {
      setTestStates((s) => ({ ...s, [server.id]: { status: "failed" } }));
      notify.error(`${t("agent:provider_test_failed")}: ${e}`);
    }
  };

  const handleToggle = async (server: MCPServerConfig, enabled: boolean) => {
    await agentClient.mcpApi({ action: "updateServer", id: server.id, config: { enabled } });
    await reload();
  };

  const handleDelete = async (server: MCPServerConfig) => {
    await agentClient.mcpApi({ action: "removeServer", id: server.id });
    notify.success(t("common:delete_success"));
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

  const connectedCount = servers.filter((s) => testStates[s.id]?.status === "connected").length;
  const toolsTotal = servers.reduce((sum, s) => sum + (testStates[s.id]?.tools ?? 0), 0);

  // 计数摘要:桌面三段(服务/已连接/工具),移动两段(服务/已连接)
  const countSegments: CountBarSegment[] = [
    { label: t("agent:mcp_count_servers", { count: servers.length }) },
    { label: t("agent:mcp_count_connected", { count: connectedCount }), tone: "success" },
    ...(isMobile ? [] : [{ label: t("agent:mcp_count_tools", { count: toolsTotal }), tone: "primary" as const }]),
  ];

  const addBtn = (
    <Button data-testid="mcp-add" onClick={handleAdd}>
      <Plus className="size-4" />
      {t("agent:mcp_add_server")}
    </Button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* 桌面端 64px 页头;移动端由全局 MobileHeader 承担☰/抽屉,本页头不渲染以避免双头部 */}
      {!isMobile && (
        <AgentPageHeader
          icon={Plug}
          title={t("agent:mcp_title")}
          subtitle={t("agent:mcp_subtitle")}
          docHref={agentDocUrl("mcp")}
          docLabel={t("agent:mcp_docs")}
          actions={addBtn}
        />
      )}
      <div className="scrollbar-custom flex-1 overflow-y-auto px-4 py-4 md:px-7 md:py-[22px]">
        {!loading && servers.length === 0 ? (
          <AgentEmptyState
            icon={Plug}
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
          <div className="flex flex-col gap-4">
            {/* 移动端页内顶行:页名 + 添加(全局 MobileHeader 不含页名/页面操作) */}
            {isMobile && (
              <div className="flex items-center justify-between">
                <span data-testid="mcp-mobile-title" className="text-lg font-semibold text-foreground">
                  {t("agent:mcp_title")}
                </span>
                <Button data-testid="mcp-add" size="icon" onClick={handleAdd} aria-label={t("agent:mcp_add_server")}>
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
            {!loading && <CountBar segments={countSegments} />}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
