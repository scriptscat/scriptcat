import {
  Button,
  Card,
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
import { IconCheck, IconDelete, IconEdit, IconPlus } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { AgentModelConfig } from "@App/app/service/agent/types";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import { uuidv4 } from "@App/pkg/utils/uuid";

const agentModelRepo = new AgentModelRepo();

const emptyModel: AgentModelConfig = {
  id: "",
  name: "",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "",
};

// Provider 配色方案
const providerTheme: Record<string, { bg: string; text: string; accent: string; label: string }> = {
  openai: {
    bg: "tw-bg-[#f0fdf4]",
    text: "tw-text-[#16a34a]",
    accent: "#16a34a",
    label: "OpenAI",
  },
  anthropic: {
    bg: "tw-bg-[#fef3e2]",
    text: "tw-text-[#d97706]",
    accent: "#d97706",
    label: "Anthropic",
  },
};

function ModelCard({
  model,
  isDefault,
  onEdit,
  onDelete,
  onSetDefault,
  t,
}: {
  model: AgentModelConfig;
  isDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  t: (key: string) => string;
}) {
  const theme = providerTheme[model.provider] || providerTheme.openai;
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
          {/* Provider 色块标识 */}
          <div
            className={`tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-xs tw-font-bold tw-shrink-0 ${theme.bg} ${theme.text}`}
          >
            {model.provider === "openai" ? "AI" : "An"}
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <div className="tw-flex tw-items-center tw-gap-2">
              <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{model.name}</Typography.Text>
              {isDefault && (
                <Tag size="small" color="arcoblue">
                  {t("agent_model_default_label")}
                </Tag>
              )}
            </div>
            <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
              {theme.label}
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
        <Popconfirm title={t("agent_model_delete_confirm")} onOk={onDelete}>
          <Button type="text" size="small" status="danger" icon={<IconDelete />}>
            {t("agent_model_delete")}
          </Button>
        </Popconfirm>
      </div>
    </div>
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

  // 从 Repo 加载数据
  const loadData = useCallback(async () => {
    const [modelList, defId] = await Promise.all([agentModelRepo.listModels(), agentModelRepo.getDefaultModelId()]);
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
    setModalVisible(true);
  };

  const handleEdit = (record: AgentModelConfig) => {
    setEditingModel({ ...record });
    setIsEditing(true);
    setAvailableModels([]);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    await agentModelRepo.removeModel(id);
    if (defaultModelId === id) {
      const remaining = models.filter((m) => m.id !== id);
      await agentModelRepo.setDefaultModelId(remaining[0]?.id || "");
    }
    loadData();
  };

  const handleSetDefault = async (id: string) => {
    await agentModelRepo.setDefaultModelId(id);
    loadData();
  };

  const handleModalOk = async () => {
    if (!editingModel.name || !editingModel.model) {
      Message.error(t("agent_model_name") + " / " + t("agent_provider_model") + " required");
      return;
    }
    if (isEditing) {
      await agentModelRepo.saveModel(editingModel);
    } else {
      const newModel = { ...editingModel, id: uuidv4() };
      await agentModelRepo.saveModel(newModel);
      // 如果是第一个模型，自动设为默认
      if (models.length === 0) {
        await agentModelRepo.setDefaultModelId(newModel.id);
      }
    }
    setModalVisible(false);
    loadData();
  };

  const buildProviderRequest = (m: AgentModelConfig) => {
    const baseUrl =
      m.apiBaseUrl || (m.provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com");
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
    try {
      const { modelsUrl, headers } = buildProviderRequest(editingModel);
      const resp = await fetch(modelsUrl, { method: "GET", headers });
      if (resp.ok) {
        Message.success(t("agent_provider_test_success")!);
      } else {
        Message.error(`${t("agent_provider_test_failed")}: ${resp.status}`);
      }
    } catch (e) {
      Message.error(`${t("agent_provider_test_failed")}: ${e}`);
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
          <Button type="primary" icon={<IconPlus />} onClick={handleAdd}>
            {t("agent_model_add")}
          </Button>
        }
      >
        {models.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_model_no_models")} />
          </div>
        ) : (
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isDefault={model.id === defaultModelId}
                onEdit={() => handleEdit(model)}
                onDelete={() => handleDelete(model.id)}
                onSetDefault={() => handleSetDefault(model.id)}
                t={t}
              />
            ))}
          </div>
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
            >
              <Select.Option value="openai">{"OpenAI"}</Select.Option>
              <Select.Option value="anthropic">{"Anthropic"}</Select.Option>
            </Select>
          </div>

          {/* API Base URL */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_provider_api_base_url")}
            </div>
            <Input
              value={editingModel.apiBaseUrl}
              placeholder={
                editingModel.provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"
              }
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
              <Select
                className="tw-flex-1"
                showSearch
                allowClear
                allowCreate
                value={editingModel.model || undefined}
                placeholder="gpt-4o / claude-sonnet-4-20250514"
                onChange={(value) => setEditingModel((prev) => ({ ...prev, model: value || "" }))}
              >
                {availableModels.map((id) => (
                  <Select.Option key={id} value={id}>
                    {id}
                  </Select.Option>
                ))}
              </Select>
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

          {/* 测试连接 */}
          <div className="tw-flex tw-justify-end tw-pt-2">
            <Button type="outline" onClick={handleTestConnection}>
              {t("agent_provider_test_connection")}
            </Button>
          </div>
        </Space>
      </Modal>
    </Space>
  );
}

export default AgentProvider;
