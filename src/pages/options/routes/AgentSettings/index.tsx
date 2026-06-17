import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Search } from "lucide-react";
import { toast } from "sonner";
import { SettingsLayout } from "../../layout/SettingsLayout";
import { SettingCard } from "../../components/SettingCard";
import { SettingRow } from "../../components/SettingRow";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@App/pages/components/ui/select";
import { Input } from "@App/pages/components/ui/input";
import { Alert, AlertDescription } from "@App/pages/components/ui/alert";
import { agentClient } from "@App/pages/store/features/script";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import type { SearchEngineConfig } from "@App/app/service/agent/core/tools/search_config";

const DEFAULT_MODEL = "__default__";

type Engine = SearchEngineConfig["engine"];

const ENGINE_OPTIONS: { value: Engine; label: string }[] = [
  { value: "bing", label: "Bing" },
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "baidu", label: "" }, // 标签运行时填充
  { value: "google_custom", label: "Google Custom Search" },
];

const ENGINE_TIP_KEY: Record<Engine, string> = {
  bing: "agent:search_engine_tip_bing",
  duckduckgo: "agent:search_engine_tip_duckduckgo",
  baidu: "agent:search_engine_tip_baidu",
  google_custom: "agent:search_engine_tip_google",
};

export default function AgentSettings() {
  const { t } = useTranslation(["agent"]);
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [summaryModelId, setSummaryModelId] = useState("");
  const [searchConfig, setSearchConfig] = useState<SearchEngineConfig>({ engine: "bing" });

  useEffect(() => {
    Promise.all([agentClient.listModels(), agentClient.getSummaryModelId(), agentClient.getSearchConfig()]).then(
      ([m, sid, sc]) => {
        setModels(m);
        setSummaryModelId(sid);
        setSearchConfig(sc || { engine: "bing" });
      }
    );
  }, []);

  const handleSummaryChange = async (v: string) => {
    const id = v === DEFAULT_MODEL ? "" : v;
    setSummaryModelId(id);
    await agentClient.setSummaryModelId(id);
    toast.success(t("agent:settings_saved"));
  };

  const updateSearch = async (patch: Partial<SearchEngineConfig>) => {
    const next = { ...searchConfig, ...patch };
    setSearchConfig(next);
    await agentClient.saveSearchConfig(next);
    toast.success(t("agent:settings_saved"));
  };

  const categories = [
    { id: "model", icon: Cpu, label: t("agent:summary_model") },
    { id: "search", icon: Search, label: t("agent:search_settings") },
  ];

  return (
    <SettingsLayout title={t("agent:settings_title")} categories={categories}>
      {(register) => (
        <>
          <SettingCard
            id="model"
            title={t("agent:summary_model")}
            description={t("agent:summary_model_desc")}
            register={register}
          >
            <SettingRow label={t("agent:summary_model")}>
              <Select value={summaryModelId || DEFAULT_MODEL} onValueChange={handleSummaryChange}>
                <SelectTrigger data-testid="summary-model" className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_MODEL}>{t("agent:summary_model_placeholder")}</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingCard>

          <SettingCard id="search" title={t("agent:search_settings")} register={register}>
            <SettingRow label={t("agent:search_engine")}>
              <Select value={searchConfig.engine} onValueChange={(v) => updateSearch({ engine: v as Engine })}>
                <SelectTrigger data-testid="search-engine" className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGINE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.value === "baidu" ? t("agent:search_engine_baidu") : o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <Alert>
              <AlertDescription>{t(ENGINE_TIP_KEY[searchConfig.engine])}</AlertDescription>
            </Alert>

            {searchConfig.engine === "google_custom" && (
              <>
                <SettingRow label={t("agent:search_google_api_key")}>
                  <Input
                    data-testid="search-google-api-key"
                    type="password"
                    className="w-[220px]"
                    value={searchConfig.googleApiKey ?? ""}
                    onChange={(e) => updateSearch({ googleApiKey: e.target.value })}
                  />
                </SettingRow>
                <SettingRow label={t("agent:search_google_cse_id")}>
                  <Input
                    data-testid="search-google-cse-id"
                    className="w-[220px]"
                    value={searchConfig.googleCseId ?? ""}
                    onChange={(e) => updateSearch({ googleCseId: e.target.value })}
                  />
                </SettingRow>
              </>
            )}
          </SettingCard>
        </>
      )}
    </SettingsLayout>
  );
}
