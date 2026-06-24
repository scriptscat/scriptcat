import { Card, Message, Select, Input, Space, Typography, Alert } from "@arco-design/web-react";
import AgentDocLink from "./AgentDocLink";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import type { SearchEngineConfig } from "@App/app/service/agent/core/tools/search_config";
import { agentClient } from "@App/pages/store/features/script";

const engineTipKeys: Record<SearchEngineConfig["engine"], string> = {
  bing: "agent_search_engine_tip_bing",
  duckduckgo: "agent_search_engine_tip_duckduckgo",
  baidu: "agent_search_engine_tip_baidu",
  google_custom: "agent_search_engine_tip_google",
};

function AgentSettings() {
  const { t } = useTranslation();
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [summaryModelId, setSummaryModelId] = useState("");
  const [searchConfig, setSearchConfig] = useState<SearchEngineConfig>({ engine: "bing" });

  useEffect(() => {
    Promise.all([agentClient.listModels(), agentClient.getSummaryModelId(), agentClient.getSearchConfig()]).then(
      ([m, sid, sc]) => {
        setModels(m);
        setSummaryModelId(sid);
        setSearchConfig(sc);
      }
    );
  }, []);

  const handleSummaryModelChange = useCallback((value: string | undefined) => {
    const id = value || "";
    setSummaryModelId(id);
    agentClient
      .setSummaryModelId(id)
      .then(() => Message.success(t("agent_settings_saved")))
      .catch(() => Message.error(t("agent_settings_save_failed")));
  }, []);

  const handleEngineChange = useCallback(
    (value: string) => {
      const newConfig = { ...searchConfig, engine: value as SearchEngineConfig["engine"] };
      setSearchConfig(newConfig);
      agentClient
        .saveSearchConfig(newConfig)
        .then(() => Message.success(t("agent_settings_saved")))
        .catch(() => Message.error(t("agent_settings_save_failed")));
    },
    [searchConfig]
  );

  const handleGoogleApiKeyChange = useCallback(
    (value: string) => {
      const newConfig = { ...searchConfig, googleApiKey: value };
      setSearchConfig(newConfig);
      agentClient
        .saveSearchConfig(newConfig)
        .then(() => Message.success(t("agent_settings_saved")))
        .catch(() => Message.error(t("agent_settings_save_failed")));
    },
    [searchConfig]
  );

  const handleGoogleCseIdChange = useCallback(
    (value: string) => {
      const newConfig = { ...searchConfig, googleCseId: value };
      setSearchConfig(newConfig);
      agentClient
        .saveSearchConfig(newConfig)
        .then(() => Message.success(t("agent_settings_saved")))
        .catch(() => Message.error(t("agent_settings_save_failed")));
    },
    [searchConfig]
  );

  const engineOptions = [
    { label: "Bing", value: "bing" },
    { label: "DuckDuckGo", value: "duckduckgo" },
    { label: t("agent_search_engine_baidu"), value: "baidu" },
    { label: "Google Custom Search", value: "google_custom" },
  ];

  return (
    <Space direction="vertical" size="medium" style={{ width: "100%" }}>
      <div className="tw-flex tw-items-center tw-gap-2">
        <Typography.Title heading={5} style={{ margin: 0 }}>
          {t("agent_settings_title")}
        </Typography.Title>
        <AgentDocLink page="settings" />
      </div>

      <Card title={t("agent_model_settings")}>
        <Space direction="vertical" size="medium" style={{ width: "100%" }}>
          <div>
            <Typography.Text bold className="tw-block tw-mb-2">
              {t("agent_summary_model")}
            </Typography.Text>
            <Select
              placeholder={t("agent_summary_model_placeholder")}
              value={summaryModelId || undefined}
              onChange={handleSummaryModelChange}
              allowClear
              style={{ width: 300 }}
            >
              {models.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  {m.name || m.model}
                </Select.Option>
              ))}
            </Select>
            <Typography.Text type="secondary" className="tw-block tw-mt-1" style={{ fontSize: 12 }}>
              {t("agent_summary_model_desc")}
            </Typography.Text>
          </div>
        </Space>
      </Card>

      <Card title={t("agent_search_settings")}>
        <Space direction="vertical" size="medium" style={{ width: "100%" }}>
          <div>
            <Typography.Text bold className="tw-block tw-mb-2">
              {t("agent_search_engine")}
            </Typography.Text>
            <Select value={searchConfig.engine} onChange={handleEngineChange} style={{ width: 300 }}>
              {engineOptions.map((o) => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
            <Alert
              className="tw-mt-2"
              type="info"
              content={t(engineTipKeys[searchConfig.engine])}
              closable={false}
              style={{ maxWidth: 500 }}
            />
          </div>

          {searchConfig.engine === "google_custom" && (
            <>
              <div>
                <Typography.Text bold className="tw-block tw-mb-2">
                  {t("agent_search_google_api_key")}
                </Typography.Text>
                <Input.Password
                  value={searchConfig.googleApiKey || ""}
                  onChange={handleGoogleApiKeyChange}
                  style={{ width: 300 }}
                />
              </div>
              <div>
                <Typography.Text bold className="tw-block tw-mb-2">
                  {t("agent_search_google_cse_id")}
                </Typography.Text>
                <Input
                  value={searchConfig.googleCseId || ""}
                  onChange={handleGoogleCseIdChange}
                  style={{ width: 300 }}
                />
              </div>
            </>
          )}
        </Space>
      </Card>
    </Space>
  );
}

export default AgentSettings;
