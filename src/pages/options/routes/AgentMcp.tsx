import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Message,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconDelete, IconEdit, IconEye, IconLink, IconPlus } from "@arco-design/web-react/icon";
import AgentDocLink from "./AgentDocLink";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt } from "@App/app/service/agent/core/types";
import { agentClient } from "@App/pages/store/features/script";

const emptyServer: Omit<MCPServerConfig, "id" | "createtime" | "updatetime"> = {
  name: "",
  url: "",
  apiKey: "",
  headers: {},
  enabled: true,
};

function ServerCard({
  server,
  onEdit,
  onDelete,
  onToggle,
  onTest,
  onDetail,
  testing,
}: {
  server: MCPServerConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onDetail: () => void;
  testing: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default ${
        server.enabled
          ? "tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
          : "tw-bg-[var(--color-bg-3)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.03)] tw-opacity-60"
      }`}
    >
      {/* 顶部区域 */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-4">
        <div className="tw-flex tw-items-center tw-gap-3">
          <div className="tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-xs tw-font-bold tw-shrink-0 tw-bg-[#e8f5e9] tw-text-[#2e7d32]">
            {"MCP"}
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{server.name}</Typography.Text>
            <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0 tw-break-all">
              {server.url}
            </Typography.Text>
          </div>
        </div>
        <Switch size="small" checked={server.enabled} onChange={onToggle} />
      </div>

      {/* 信息区域 */}
      <div className="tw-flex tw-flex-col tw-gap-2 tw-mb-4">
        {server.apiKey && (
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">{"API Key"}</span>
            <Typography.Text type="secondary" className="tw-text-xs tw-font-mono !tw-mb-0">
              {server.apiKey.length > 8
                ? `${server.apiKey.slice(0, 4)}${"*".repeat(8)}${server.apiKey.slice(-4)}`
                : "****"}
            </Typography.Text>
          </div>
        )}
        {server.headers && Object.keys(server.headers).length > 0 && (
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">{"Headers"}</span>
            <Tag size="small">
              {Object.keys(server.headers).length} {"custom"}
            </Tag>
          </div>
        )}
      </div>

      {/* 操作栏 */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconEye />} onClick={onDetail}>
          {t("agent_mcp_detail")}
        </Button>
        <Button type="text" size="small" icon={<IconLink />} onClick={onTest} loading={testing}>
          {t("agent_mcp_test_connection")}
        </Button>
        <Button type="text" size="small" icon={<IconEdit />} onClick={onEdit}>
          {t("agent_model_edit")}
        </Button>
        <Popconfirm title={t("agent_model_delete_confirm")} onOk={onDelete}>
          <Button type="text" size="small" status="danger" icon={<IconDelete />}>
            {t("agent_model_delete")}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

// 格式化 JSON Schema 参数概要
function formatSchemaParams(inputSchema: Record<string, unknown>): string[] {
  const properties = inputSchema.properties as Record<string, { description?: string }> | undefined;
  const required = (inputSchema.required as string[]) || [];
  if (!properties) return [];
  return Object.keys(properties).map((name) => (required.includes(name) ? name : `${name}?`));
}

function ServerDetailDrawer({
  server,
  visible,
  onClose,
}: {
  server: MCPServerConfig | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [resources, setResources] = useState<MCPResource[]>([]);
  const [prompts, setPrompts] = useState<MCPPrompt[]>([]);

  useEffect(() => {
    if (!visible || !server) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setTools([]);
      setResources([]);
      setPrompts([]);

      try {
        const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
          agentClient.mcpApi({ action: "listTools", serverId: server.id }).catch(() => [] as MCPTool[]),
          agentClient.mcpApi({ action: "listResources", serverId: server.id }).catch(() => [] as MCPResource[]),
          agentClient.mcpApi({ action: "listPrompts", serverId: server.id }).catch(() => [] as MCPPrompt[]),
        ]);

        if (!cancelled) {
          setTools(toolsResult as MCPTool[]);
          setResources(resourcesResult as MCPResource[]);
          setPrompts(promptsResult as MCPPrompt[]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [visible, server]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Drawer width={520} title={server?.name || ""} visible={visible} onCancel={handleClose} footer={null} unmountOnExit>
      {loading ? (
        <div className="tw-flex tw-items-center tw-justify-center tw-py-16">
          <Spin tip={t("agent_mcp_loading")} />
        </div>
      ) : error ? (
        <div className="tw-py-8">
          <Empty description={error} />
        </div>
      ) : (
        <Tabs defaultActiveTab="tools">
          <Tabs.TabPane key="tools" title={`${t("agent_mcp_tools")} (${tools.length})`}>
            {tools.length === 0 ? (
              <Empty className="tw-py-8" description={t("agent_mcp_no_tools")} />
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-3 tw-py-2">
                {tools.map((tool) => (
                  <div key={tool.name} className="tw-rounded-lg tw-p-3 tw-bg-[var(--color-fill-1)]">
                    <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
                      <Typography.Text className="tw-font-semibold tw-text-sm !tw-mb-0">{tool.name}</Typography.Text>
                    </div>
                    {tool.description && (
                      <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0 tw-block tw-mb-1">
                        {tool.description}
                      </Typography.Text>
                    )}
                    {tool.inputSchema && formatSchemaParams(tool.inputSchema).length > 0 && (
                      <div className="tw-mt-2 tw-flex tw-items-center tw-gap-1 tw-flex-wrap">
                        <span className="tw-text-xs tw-text-[var(--color-text-3)]">
                          {t("agent_mcp_parameters")}
                          {":"}
                        </span>
                        {formatSchemaParams(tool.inputSchema).map((param) => (
                          <Tag key={param} size="small" className="!tw-text-xs">
                            {param}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Tabs.TabPane>

          <Tabs.TabPane key="resources" title={`${t("agent_mcp_resources")} (${resources.length})`}>
            {resources.length === 0 ? (
              <Empty className="tw-py-8" description={t("agent_mcp_no_resources")} />
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-3 tw-py-2">
                {resources.map((resource) => (
                  <div key={resource.uri} className="tw-rounded-lg tw-p-3 tw-bg-[var(--color-fill-1)]">
                    <Typography.Text className="tw-font-semibold tw-text-sm !tw-mb-0">{resource.name}</Typography.Text>
                    <Typography.Text type="secondary" className="tw-text-xs tw-font-mono !tw-mb-0 tw-block">
                      {resource.uri}
                    </Typography.Text>
                    {resource.description && (
                      <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0 tw-block tw-mt-1">
                        {resource.description}
                      </Typography.Text>
                    )}
                    {resource.mimeType && (
                      <Tag size="small" className="tw-mt-1">
                        {resource.mimeType}
                      </Tag>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Tabs.TabPane>

          <Tabs.TabPane key="prompts" title={`${t("agent_mcp_prompts")} (${prompts.length})`}>
            {prompts.length === 0 ? (
              <Empty className="tw-py-8" description={t("agent_mcp_no_prompts")} />
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-3 tw-py-2">
                {prompts.map((prompt) => (
                  <div key={prompt.name} className="tw-rounded-lg tw-p-3 tw-bg-[var(--color-fill-1)]">
                    <Typography.Text className="tw-font-semibold tw-text-sm !tw-mb-0">{prompt.name}</Typography.Text>
                    {prompt.description && (
                      <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0 tw-block tw-mt-1">
                        {prompt.description}
                      </Typography.Text>
                    )}
                    {prompt.arguments && prompt.arguments.length > 0 && (
                      <div className="tw-mt-2 tw-flex tw-items-center tw-gap-1 tw-flex-wrap">
                        <span className="tw-text-xs tw-text-[var(--color-text-3)]">
                          {t("agent_mcp_parameters")}
                          {":"}
                        </span>
                        {prompt.arguments.map((arg) => (
                          <Tag key={arg.name} size="small" className="!tw-text-xs">
                            {arg.required ? arg.name : `${arg.name}?`}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Tabs.TabPane>
        </Tabs>
      )}
    </Drawer>
  );
}

function AgentMcp() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<Omit<MCPServerConfig, "id" | "createtime" | "updatetime">>({
    ...emptyServer,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [headersText, setHeadersText] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalTesting, setModalTesting] = useState(false);
  const [detailServer, setDetailServer] = useState<MCPServerConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadData = useCallback(async () => {
    const list = (await agentClient.mcpApi({ action: "listServers" })) as MCPServerConfig[];
    setServers(list);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = () => {
    setEditingServer({ ...emptyServer });
    setEditingId(null);
    setHeadersText("");
    setModalVisible(true);
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditingServer({
      name: server.name,
      url: server.url,
      apiKey: server.apiKey,
      headers: server.headers,
      enabled: server.enabled,
    });
    setEditingId(server.id);
    setHeadersText(
      server.headers
        ? Object.entries(server.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : ""
    );
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    await agentClient.mcpApi({ action: "removeServer", id });
    loadData();
  };

  const handleToggle = async (server: MCPServerConfig, enabled: boolean) => {
    await agentClient.mcpApi({
      action: "updateServer",
      id: server.id,
      config: { enabled },
    });
    loadData();
  };

  const handleTest = async (server: MCPServerConfig) => {
    setTestingId(server.id);
    try {
      const result = (await agentClient.mcpApi({ action: "testConnection", id: server.id })) as {
        tools: number;
        resources: number;
        prompts: number;
      };
      Message.success(
        `${t("agent_provider_test_success")} - Tools: ${result.tools}, Resources: ${result.resources}, Prompts: ${result.prompts}`
      );
    } catch (e) {
      Message.error(`${t("agent_provider_test_failed")}: ${e}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleModalTest = async () => {
    if (!editingServer.url || !editingServer.name) {
      Message.error(t("agent_mcp_name_url_required"));
      return;
    }
    setModalTesting(true);
    try {
      // 先保存到 SW（新建或更新），再测试连接
      const headers = parseHeaders(headersText);
      let serverId = editingId;
      if (serverId) {
        await agentClient.mcpApi({
          action: "updateServer",
          id: serverId,
          config: {
            name: editingServer.name,
            url: editingServer.url,
            apiKey: editingServer.apiKey,
            headers,
            enabled: editingServer.enabled,
          },
        });
      } else {
        const created = (await agentClient.mcpApi({
          action: "addServer",
          config: {
            name: editingServer.name,
            url: editingServer.url,
            apiKey: editingServer.apiKey,
            headers,
            enabled: editingServer.enabled,
          },
        })) as MCPServerConfig;
        serverId = created.id;
        setEditingId(serverId);
      }
      const result = (await agentClient.mcpApi({ action: "testConnection", id: serverId })) as {
        tools: number;
        resources: number;
        prompts: number;
      };
      Message.success(
        `${t("agent_provider_test_success")} - Tools: ${result.tools}, Resources: ${result.resources}, Prompts: ${result.prompts}`
      );
    } catch (e) {
      Message.error(`${t("agent_provider_test_failed")}: ${e}`);
    } finally {
      setModalTesting(false);
    }
  };

  const handleDetail = (server: MCPServerConfig) => {
    setDetailServer(server);
    setDrawerVisible(true);
  };

  const parseHeaders = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx > 0) {
        headers[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
    return headers;
  };

  const handleModalOk = async () => {
    if (!editingServer.name || !editingServer.url) {
      Message.error(t("agent_mcp_name_url_required"));
      return;
    }

    const headers = parseHeaders(headersText);

    if (editingId) {
      // 编辑
      await agentClient.mcpApi({
        action: "updateServer",
        id: editingId,
        config: {
          name: editingServer.name,
          url: editingServer.url,
          apiKey: editingServer.apiKey,
          headers,
          enabled: editingServer.enabled,
        },
      });
    } else {
      // 新增
      await agentClient.mcpApi({
        action: "addServer",
        config: {
          name: editingServer.name,
          url: editingServer.url,
          apiKey: editingServer.apiKey,
          headers,
          enabled: editingServer.enabled,
        },
      });
    }

    setModalVisible(false);
    loadData();
  };

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card
        title={t("agent_mcp_title")}
        bordered={false}
        extra={
          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={handleAdd}>
              {t("agent_mcp_add_server")}
            </Button>
            <AgentDocLink page="mcp" />
          </Space>
        }
      >
        {servers.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_mcp_no_servers")} />
          </div>
        ) : (
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onEdit={() => handleEdit(server)}
                onDelete={() => handleDelete(server.id)}
                onToggle={(enabled) => handleToggle(server, enabled)}
                onTest={() => handleTest(server)}
                onDetail={() => handleDetail(server)}
                testing={testingId === server.id}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal
        title={editingId ? t("agent_model_edit") : t("agent_mcp_add_server")}
        visible={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        autoFocus={false}
        focusLock
        unmountOnExit
      >
        <Space direction="vertical" size={20} className="tw-w-full">
          {/* 名称 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_model_name")}
            </div>
            <Input
              value={editingServer.name}
              placeholder="My MCP Server"
              onChange={(value) => setEditingServer((prev) => ({ ...prev, name: value }))}
            />
          </div>

          {/* URL */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">{"URL"}</div>
            <Input
              value={editingServer.url}
              placeholder="https://example.com/mcp"
              onChange={(value) => setEditingServer((prev) => ({ ...prev, url: value }))}
            />
          </div>

          {/* API Key */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {"API Key ("}
              {t("agent_mcp_optional")}
              {")"}
            </div>
            <Input.Password
              value={editingServer.apiKey}
              onChange={(value) => setEditingServer((prev) => ({ ...prev, apiKey: value }))}
            />
          </div>

          {/* 自定义 Headers */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_mcp_custom_headers")} {"("}
              {t("agent_mcp_optional")}
              {")"}
            </div>
            <Input.TextArea
              value={headersText}
              placeholder={"X-Custom-Header: value\nAnother-Header: value"}
              autoSize={{ minRows: 2, maxRows: 5 }}
              onChange={(value) => setHeadersText(value)}
            />
          </div>

          {/* 启用 */}
          <div className="tw-flex tw-items-center tw-gap-3">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">{t("agent_mcp_enabled")}</span>
            <Switch
              checked={editingServer.enabled}
              onChange={(checked) => setEditingServer((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>

          {/* 测试连接 */}
          <Button type="outline" icon={<IconLink />} loading={modalTesting} onClick={handleModalTest} long>
            {t("agent_provider_test_connection")}
          </Button>
        </Space>
      </Modal>

      <ServerDetailDrawer server={detailServer} visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </Space>
  );
}

export default AgentMcp;
