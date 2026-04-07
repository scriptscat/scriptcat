import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { IconCheck, IconCopy, IconDelete, IconEdit, IconEye, IconImage, IconPlus } from "@arco-design/web-react/icon";
import AgentDocLink from "./AgentDocLink";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { inferContextWindow } from "@App/app/service/agent/core/model_context";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { agentClient } from "@App/pages/store/features/script";
import {
  groupModelsByProvider,
  groupModelIdsByProvider,
  detectProvider,
  detectProviderByModelId,
  supportsVision,
  supportsVisionByModelId,
  supportsImageOutput,
  supportsImageOutputByModelId,
} from "./AgentChat/model_utils";
import ProviderIcon from "./AgentChat/ProviderIcon";

const emptyModel: AgentModelConfig = {
  id: "",
  name: "",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "",
};

function ModelCard({
  model,
  isDefault,
  onEdit,
  onCopy,
  onDelete,
  onSetDefault,
  t,
}: {
  model: AgentModelConfig;
  isDefault: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  t: (key: string) => string;
}) {
  const provider = detectProvider(model);
  const hasVision = supportsVision(model);
  const hasImageOutput = supportsImageOutput(model);
  // 遮蔽 API Key，只显示前4位和后4位
  const maskedKey =
    model.apiKey && model.apiKey.length > 8
      ? `${model.apiKey.slice(0, 4)}${"*".repeat(8)}${model.apiKey.slice(-4)}`
      : "****";

  return (
    <div
      className={`tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default ${
        isDefault
          ? "tw-bg-[rgb(var(--arcoblue-1))] tw-shadow-[0_0_0_1.5px_rgb(var(--arcoblue-6)),0_2px_8px_rgba(0,0,0,0.06)]"
          : "tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
      }`}
    >
      {/* 顶部区域 */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-4">
        <div className="tw-flex tw-items-center tw-gap-3">
          {/* Provider 图标 */}
          <div className="tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-bg-[var(--color-fill-2)]">
            <ProviderIcon providerKey={provider.key} size={22} />
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <div className="tw-flex tw-items-center tw-gap-2">
              <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{model.name}</Typography.Text>
              {isDefault && (
                <Tag size="small" color="arcoblue">
                  {t("agent_model_default_label")}
                </Tag>
              )}
              {hasVision && (
                <Tooltip content={t("agent_model_vision_support") || "Vision"}>
                  <IconEye style={{ fontSize: 14, color: "var(--color-text-3)" }} />
                </Tooltip>
              )}
              {hasImageOutput && (
                <Tooltip content={t("agent_model_image_output") || "Image Output"}>
                  <IconImage style={{ fontSize: 14, color: "var(--color-text-3)" }} />
                </Tooltip>
              )}
            </div>
            <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
              {provider.label}
            </Typography.Text>
          </div>
        </div>
      </div>

      {/* 信息区域 */}
      <div className="tw-flex tw-flex-col tw-gap-2 tw-mb-4">
        <div className="tw-flex tw-items-center tw-gap-2">
          <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-12">{t("agent_provider_model")}</span>
          <Tag className="!tw-rounded-md" size="small">
            {model.model}
          </Tag>
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
          <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-12">{"API Key"}</span>
          <Typography.Text type="secondary" className="tw-text-xs tw-font-mono !tw-mb-0">
            {maskedKey}
          </Typography.Text>
        </div>
      </div>

      {/* 操作栏 - 悬停时更明显 */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        {!isDefault && (
          <Tooltip content={t("agent_model_set_default")}>
            <Button type="text" size="small" icon={<IconCheck />} onClick={onSetDefault}>
              {t("agent_model_set_default")}
            </Button>
          </Tooltip>
        )}
        <Button type="text" size="small" icon={<IconEdit />} onClick={onEdit}>
          {t("agent_model_edit")}
        </Button>
        <Button type="text" size="small" icon={<IconCopy />} onClick={onCopy}>
          {t("agent_model_copy")}
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

function ModelGroupedList({
  models,
  defaultModelId,
  onEdit,
  onCopy,
  onDelete,
  onSetDefault,
  t,
}: {
  models: AgentModelConfig[];
  defaultModelId: string;
  onEdit: (model: AgentModelConfig) => void;
  onCopy: (model: AgentModelConfig) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  t: (key: string) => string;
}) {
  // 按 provider 排序，但所有卡片放在同一个 grid 中
  const sortedModels = useMemo(() => {
    const groups = groupModelsByProvider(models);
    return groups.flatMap((g) => g.models);
  }, [models]);

  return (
    <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
      {sortedModels.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          isDefault={model.id === defaultModelId}
          onEdit={() => onEdit(model)}
          onCopy={() => onCopy(model)}
          onDelete={() => onDelete(model.id)}
          onSetDefault={() => onSetDefault(model.id)}
          t={t}
        />
      ))}
    </div>
  );
}

function FetchedModelSelect({
  availableModels,
  value,
  onChange,
}: {
  availableModels: string[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const groups = useMemo(() => groupModelIdsByProvider(availableModels), [availableModels]);
  const hasMultipleGroups = groups.length > 1;

  const renderModelOption = (id: string, providerKey: string) => (
    <Select.Option key={id} value={id}>
      <span className="tw-inline-flex tw-items-center tw-gap-1.5">
        {!hasMultipleGroups && <ProviderIcon providerKey={providerKey} size={12} />}
        <span>{id}</span>
        {supportsVisionByModelId(id) && (
          <IconEye style={{ fontSize: 12, color: "var(--color-text-4)", flexShrink: 0 }} />
        )}
        {supportsImageOutputByModelId(id) && (
          <IconImage style={{ fontSize: 12, color: "var(--color-text-4)", flexShrink: 0 }} />
        )}
      </span>
    </Select.Option>
  );

  return (
    <Select
      className="tw-flex-1"
      showSearch
      allowClear
      allowCreate
      value={value}
      placeholder="gpt-4o / claude-sonnet-4-20250514"
      onChange={onChange}
      renderFormat={(_option, val) => {
        const valStr = String(val);
        const provider = detectProviderByModelId(valStr);
        return (
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <ProviderIcon providerKey={provider.key} size={12} />
            <span>{valStr}</span>
          </span>
        );
      }}
    >
      {hasMultipleGroups
        ? groups.map((g) => (
            <Select.OptGroup
              key={g.provider.key}
              label={
                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                  <ProviderIcon providerKey={g.provider.key} size={12} />
                  <span>{g.provider.label}</span>
                </span>
              }
            >
              {g.modelIds.map((id) => renderModelOption(id, g.provider.key))}
            </Select.OptGroup>
          ))
        : groups.flatMap((g) => g.modelIds.map((id) => renderModelOption(id, g.provider.key)))}
    </Select>
  );
}

function AgentProvider() {
  const { t } = useTranslation();
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AgentModelConfig>({ ...emptyModel });
  const [isEditing, setIsEditing] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testReply, setTestReply] = useState("");

  // 从 Repo 加载数据
  const loadData = useCallback(async () => {
    const [modelList, defId] = await Promise.all([agentClient.listModels(), agentClient.getDefaultModelId()]);
    setModels(modelList);
    setDefaultModelId(defId);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = () => {
    setEditingModel({ ...emptyModel });
    setIsEditing(false);
    setAvailableModels([]);
    setTestReply("");
    setModalVisible(true);
  };

  const handleEdit = (record: AgentModelConfig) => {
    setEditingModel({ ...record });
    setIsEditing(true);
    // 从模型记录中恢复已缓存的可用模型列表
    setAvailableModels(record.availableModels || []);
    setTestReply("");
    setModalVisible(true);
  };

  const handleCopy = (record: AgentModelConfig) => {
    setEditingModel({ ...record, id: "", name: `${record.name} (Copy)` });
    setIsEditing(false);
    setAvailableModels(record.availableModels || []);
    setTestReply("");
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    await agentClient.removeModel(id);
    if (defaultModelId === id) {
      const remaining = models.filter((m) => m.id !== id);
      await agentClient.setDefaultModelId(remaining[0]?.id || "");
    }
    loadData();
  };

  const handleSetDefault = async (id: string) => {
    await agentClient.setDefaultModelId(id);
    loadData();
  };

  const handleModalOk = async () => {
    if (!editingModel.name || !editingModel.model) {
      Message.error(t("agent_model_name") + " / " + t("agent_provider_model") + " required");
      return;
    }
    if (isEditing) {
      await agentClient.saveModel(editingModel);
    } else {
      const newModel = { ...editingModel, id: uuidv4() };
      await agentClient.saveModel(newModel);
      // 如果是第一个模型，自动设为默认
      if (models.length === 0) {
        await agentClient.setDefaultModelId(newModel.id);
      }
    }
    setModalVisible(false);
    loadData();
  };

  const getDefaultBaseUrl = (provider: string) => {
    switch (provider) {
      case "anthropic":
        return "https://api.anthropic.com";
      case "zhipu":
        return "https://open.bigmodel.cn/api/paas/v4";
      default:
        return "https://api.openai.com/v1";
    }
  };

  const buildProviderRequest = (m: AgentModelConfig) => {
    const baseUrl = m.apiBaseUrl || getDefaultBaseUrl(m.provider);
    const headers: Record<string, string> = {};
    let modelsUrl: string;
    if (m.provider === "anthropic") {
      modelsUrl = `${baseUrl}/v1/models`;
      headers["x-api-key"] = m.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    } else {
      modelsUrl = `${baseUrl}/models`;
      if (m.apiKey) {
        headers["Authorization"] = `Bearer ${m.apiKey}`;
      }
    }
    return { modelsUrl, headers };
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestReply("");
    try {
      const baseUrl = editingModel.apiBaseUrl || getDefaultBaseUrl(editingModel.provider);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let chatUrl: string;
      let body: string;

      if (editingModel.provider === "anthropic") {
        chatUrl = `${baseUrl}/v1/messages`;
        headers["x-api-key"] = editingModel.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
        body = JSON.stringify({
          model: editingModel.model || "claude-sonnet-4-20250514",
          max_tokens: 256,
          messages: [{ role: "user", content: "hi" }],
        });
      } else {
        chatUrl = `${baseUrl}/chat/completions`;
        if (editingModel.apiKey) {
          headers["Authorization"] = `Bearer ${editingModel.apiKey}`;
        }
        const defaultModel = editingModel.provider === "zhipu" ? "glm-4-flash" : "gpt-4o-mini";
        body = JSON.stringify({
          model: editingModel.model || defaultModel,
          max_tokens: 256,
          messages: [{ role: "user", content: "hi" }],
        });
      }

      const resp = await fetch(chatUrl, { method: "POST", headers, body });
      if (!resp.ok) {
        const errText = await resp.text();
        setTestReply(`${t("agent_provider_test_failed")}: ${resp.status} ${errText}`);
        return;
      }
      const json = await resp.json();
      let reply: string;
      if (editingModel.provider === "anthropic") {
        reply = json.content?.[0]?.text || JSON.stringify(json);
      } else {
        reply = json.choices?.[0]?.message?.content || JSON.stringify(json);
      }
      setTestReply(reply);
    } catch (e) {
      setTestReply(`${t("agent_provider_test_failed")}: ${e}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    try {
      const { modelsUrl, headers } = buildProviderRequest(editingModel);
      const resp = await fetch(modelsUrl, { method: "GET", headers });
      if (!resp.ok) {
        Message.error(`${t("agent_model_fetch_failed")}: ${resp.status}`);
        return;
      }
      const json = await resp.json();
      const ids: string[] = (json.data || []).map((item: { id: string }) => item.id);
      setAvailableModels(ids);
      // 更新到编辑中的模型，保存时一起持久化
      setEditingModel((prev) => ({ ...prev, availableModels: ids }));
    } catch (e) {
      Message.error(`${t("agent_model_fetch_failed")}: ${e}`);
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card
        title={t("agent_provider_title")}
        bordered={false}
        extra={
          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={handleAdd}>
              {t("agent_model_add")}
            </Button>
            <AgentDocLink page="provider" />
          </Space>
        }
      >
        {models.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_model_no_models")} />
          </div>
        ) : (
          <ModelGroupedList
            models={models}
            defaultModelId={defaultModelId}
            onEdit={handleEdit}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onSetDefault={handleSetDefault}
            t={t}
          />
        )}
      </Card>

      <Modal
        title={isEditing ? t("agent_model_edit") : t("agent_model_add")}
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
              value={editingModel.name}
              placeholder="GPT-4o / Claude Sonnet"
              onChange={(value) => setEditingModel((prev) => ({ ...prev, name: value }))}
            />
          </div>

          {/* Provider */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_provider_select")}
            </div>
            <Select
              value={editingModel.provider}
              onChange={(value) => setEditingModel((prev) => ({ ...prev, provider: value }))}
              renderFormat={(_option, value) => {
                const labels: Record<string, string> = {
                  openai: "OpenAI",
                  anthropic: "Anthropic",
                  zhipu: "Zhipu (智谱)",
                };
                return (
                  <span className="tw-inline-flex tw-items-center tw-gap-2">
                    <ProviderIcon providerKey={String(value)} size={14} />
                    <span>{labels[String(value)] || String(value)}</span>
                  </span>
                );
              }}
            >
              {[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic" },
                { value: "zhipu", label: "Zhipu (智谱)" },
              ].map((item) => (
                <Select.Option key={item.value} value={item.value}>
                  <span className="tw-inline-flex tw-items-center tw-gap-2">
                    <ProviderIcon providerKey={item.value} size={14} />
                    <span>{item.label}</span>
                  </span>
                </Select.Option>
              ))}
            </Select>
          </div>

          {/* API Base URL */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_provider_api_base_url")}
            </div>
            <Input
              value={editingModel.apiBaseUrl}
              placeholder={getDefaultBaseUrl(editingModel.provider)}
              onChange={(value) => setEditingModel((prev) => ({ ...prev, apiBaseUrl: value }))}
            />
          </div>

          {/* API Key */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">{"API Key"}</div>
            <Input.Password
              value={editingModel.apiKey}
              onChange={(value) => setEditingModel((prev) => ({ ...prev, apiKey: value }))}
            />
          </div>

          {/* 模型 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_provider_model")}
            </div>
            <div className="tw-flex tw-gap-2">
              <FetchedModelSelect
                availableModels={availableModels}
                value={editingModel.model || undefined}
                onChange={(value) => setEditingModel((prev) => ({ ...prev, model: value || "" }))}
              />
              <Button type="outline" loading={fetchingModels} onClick={handleFetchModels}>
                {t("agent_model_fetch")}
              </Button>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_model_max_tokens")}
            </div>
            <InputNumber
              value={editingModel.maxTokens}
              placeholder="16384"
              min={1}
              step={1024}
              onChange={(value) => setEditingModel((prev) => ({ ...prev, maxTokens: value || undefined }))}
            />
          </div>

          {/* Context Window */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_model_context_window")}
            </div>
            <InputNumber
              value={editingModel.contextWindow}
              placeholder={String(inferContextWindow(editingModel.model || ""))}
              min={1}
              step={1024}
              onChange={(value) => setEditingModel((prev) => ({ ...prev, contextWindow: value || undefined }))}
            />
          </div>

          {/* 模型能力 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_model_capabilities")}
            </div>
            <div className="tw-flex tw-gap-6">
              <Checkbox
                checked={editingModel.supportsVision ?? supportsVisionByModelId(editingModel.model)}
                onChange={(checked) => setEditingModel((prev) => ({ ...prev, supportsVision: checked }))}
              >
                {t("agent_model_supports_vision")}
              </Checkbox>
              <Checkbox
                checked={editingModel.supportsImageOutput ?? supportsImageOutputByModelId(editingModel.model)}
                onChange={(checked) => setEditingModel((prev) => ({ ...prev, supportsImageOutput: checked }))}
              >
                {t("agent_model_supports_image_output")}
              </Checkbox>
            </div>
          </div>

          {/* 测试连接 */}
          <div className="tw-flex tw-items-center tw-gap-3 tw-pt-2">
            <div
              className="tw-flex-1 tw-min-w-0 tw-max-h-[4.5em] tw-overflow-y-auto tw-leading-[1.5]"
              style={{ scrollbarWidth: "thin" }}
            >
              {testReply && (
                <Typography.Text
                  className="tw-text-sm tw-break-all"
                  style={{
                    color: testReply.startsWith(t("agent_provider_test_failed") as string)
                      ? "var(--color-danger-6)"
                      : "var(--color-success-6)",
                  }}
                >
                  {testReply}
                </Typography.Text>
              )}
            </div>
            <Button type="outline" loading={testingConnection} onClick={handleTestConnection}>
              {t("agent_provider_test_connection")}
            </Button>
          </div>
        </Space>
      </Modal>
    </Space>
  );
}

export default AgentProvider;
