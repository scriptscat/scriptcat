import {
  Button,
  Card,
  Empty,
  Input,
  Message,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconDelete, IconEdit, IconLink, IconPlus } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { MCPServerConfig } from "@App/app/service/agent/types";
import { MCPServerRepo } from "@App/app/repo/mcp_server_repo";
import { uuidv4 } from "@App/pkg/utils/uuid";

const mcpServerRepo = new MCPServerRepo();

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
}: {
  server: MCPServerConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
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
            MCP
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
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">API Key</span>
            <Typography.Text type="secondary" className="tw-text-xs tw-font-mono !tw-mb-0">
              {server.apiKey.length > 8
                ? `${server.apiKey.slice(0, 4)}${"*".repeat(8)}${server.apiKey.slice(-4)}`
                : "****"}
            </Typography.Text>
          </div>
        )}
        {server.headers && Object.keys(server.headers).length > 0 && (
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">Headers</span>
            <Tag size="small">{Object.keys(server.headers).length} custom</Tag>
          </div>
        )}
      </div>

      {/* 操作栏 */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconLink />} onClick={onTest}>
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

function AgentMcp() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<Omit<MCPServerConfig, "id" | "createtime" | "updatetime">>({
    ...emptyServer,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [headersText, setHeadersText] = useState("");

  const loadData = useCallback(async () => {
    const list = await mcpServerRepo.listServers();
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
    await mcpServerRepo.removeServer(id);
    loadData();
  };

  const handleToggle = async (server: MCPServerConfig, enabled: boolean) => {
    await mcpServerRepo.saveServer({ ...server, enabled, updatetime: Date.now() });
    loadData();
  };

  const handleTest = async (server: MCPServerConfig) => {
    try {
      // 直接用 fetch 发 initialize 请求测试连接
      const response = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : {}),
          ...(server.headers || {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "ScriptCat", version: "1.0.0" },
          },
        }),
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result) {
          const serverInfo = json.result.serverInfo;
          Message.success(
            `${t("agent_provider_test_success")}${serverInfo ? ` - ${serverInfo.name} ${serverInfo.version || ""}` : ""}`
          );
        } else if (json.error) {
          Message.error(`${t("agent_provider_test_failed")}: ${json.error.message}`);
        }
      } else {
        Message.error(`${t("agent_provider_test_failed")}: ${response.status}`);
      }
    } catch (e) {
      Message.error(`${t("agent_provider_test_failed")}: ${e}`);
    }
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
    const now = Date.now();

    if (editingId) {
      // 编辑
      const existing = servers.find((s) => s.id === editingId);
      if (existing) {
        await mcpServerRepo.saveServer({
          ...existing,
          name: editingServer.name,
          url: editingServer.url,
          apiKey: editingServer.apiKey,
          headers,
          enabled: editingServer.enabled,
          updatetime: now,
        });
      }
    } else {
      // 新增
      await mcpServerRepo.saveServer({
        id: uuidv4(),
        name: editingServer.name,
        url: editingServer.url,
        apiKey: editingServer.apiKey,
        headers,
        enabled: editingServer.enabled,
        createtime: now,
        updatetime: now,
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
          <Button type="primary" icon={<IconPlus />} onClick={handleAdd}>
            {t("agent_mcp_add_server")}
          </Button>
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
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">URL</div>
            <Input
              value={editingServer.url}
              placeholder="https://example.com/mcp"
              onChange={(value) => setEditingServer((prev) => ({ ...prev, url: value }))}
            />
          </div>

          {/* API Key */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              API Key ({t("agent_mcp_optional")})
            </div>
            <Input.Password
              value={editingServer.apiKey}
              onChange={(value) => setEditingServer((prev) => ({ ...prev, apiKey: value }))}
            />
          </div>

          {/* 自定义 Headers */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_mcp_custom_headers")} ({t("agent_mcp_optional")})
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
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">
              {t("agent_mcp_enabled")}
            </span>
            <Switch
              checked={editingServer.enabled}
              onChange={(checked) => setEditingServer((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}

export default AgentMcp;
