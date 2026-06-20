import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Cpu, Info, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { notify } from "@App/pages/components/ui/toast";
import { cn } from "@App/pkg/utils/cn";
import { useScrollSpy } from "@App/pages/options/hooks/useScrollSpy";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { agentDocUrl } from "../_agent/agentDocs";
import { Button } from "@App/pages/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@App/pages/components/ui/select";
import { Input } from "@App/pages/components/ui/input";
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

// 设置卡片:图标 + 标题 + 分隔线标题栏,下方字段区(对照设计稿 Card 模型/Card 搜索)
function SettingsCard({
  id,
  icon: Icon,
  title,
  register,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={register(id)}
      data-spy-id={id}
      className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
        <Icon className="size-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-6">{children}</div>
    </section>
  );
}

// 字段行:左侧标签+说明,右侧控件;窄屏改为控件整行在下;字段间分隔线
function SettingsField({
  label,
  description,
  isMobile,
  children,
}: {
  label: string;
  description?: string;
  isMobile: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 border-b border-border py-4 last:border-b-0",
        isMobile ? "flex-col items-stretch" : "items-center justify-between"
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-foreground">{label}</span>
        {description && <span className="text-xs leading-relaxed text-fg-secondary">{description}</span>}
      </div>
      <div className={cn("shrink-0", isMobile ? "w-full" : "w-[300px]")}>{children}</div>
    </div>
  );
}

export default function AgentSettings() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [summaryModelId, setSummaryModelId] = useState("");
  const [searchConfig, setSearchConfig] = useState<SearchEngineConfig>({ engine: "bing" });

  const categories = [
    { id: "model", icon: Cpu, label: t("agent:settings_cat_model") },
    { id: "search", icon: Search, label: t("agent:settings_cat_search") },
  ];
  const { activeId, register, scrollContainerRef, scrollTo } = useScrollSpy(categories.map((c) => c.id));

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
    notify.success(t("agent:settings_saved"));
  };

  const updateSearch = async (patch: Partial<SearchEngineConfig>) => {
    const next = { ...searchConfig, ...patch };
    setSearchConfig(next);
    await agentClient.saveSearchConfig(next);
    notify.success(t("agent:settings_saved"));
  };

  const nav = (
    <>
      {categories.map((c) => {
        const Icon = c.icon;
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            data-testid={`settings-nav-${c.id}`}
            data-active={active}
            onClick={() => scrollTo(c.id)}
            className={cn(
              "flex items-center transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              isMobile
                ? "h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px]"
                : "h-[38px] gap-2.5 rounded-lg px-3 text-left text-[13px]",
              // 激活态:蓝色软底 + 主色图标/文字 + 半粗(移动端隐去描边);非激活:图标弱化、文字保持前景色
              active
                ? "border-transparent bg-primary-light font-semibold text-primary"
                : isMobile
                  ? "text-fg-secondary"
                  : "text-foreground hover:bg-accent"
            )}
          >
            <Icon
              className={cn(
                "shrink-0",
                isMobile ? "size-4" : "size-[17px]",
                !active && !isMobile && "text-muted-foreground"
              )}
            />
            <span className="truncate">{c.label}</span>
          </button>
        );
      })}
    </>
  );

  const openDocs = () => window.open(agentDocUrl("settings"), "_blank");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 桌面端:统一 64px 页头;移动端复用全局 MobileHeader,不再叠加第二个顶栏 */}
      {!isMobile && (
        <AgentPageHeader
          icon={SlidersHorizontal}
          title={t("agent:settings_title")}
          subtitle={t("agent:settings_subtitle")}
          actions={
            <Button
              data-testid="settings-docs-desktop"
              variant="outline"
              size="icon"
              className="size-[34px] rounded-lg"
              aria-label={t("common:project_docs")}
              onClick={openDocs}
            >
              <BookOpen />
            </Button>
          }
        />
      )}

      {/* 移动端:页内标题行(页名 + 文档动作)+ 标题下方横向滚动分类栏 */}
      {isMobile && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <h1 data-testid="settings-mobile-heading" className="text-[15px] font-semibold text-foreground">
              {t("agent:settings_title")}
            </h1>
            <Button
              data-testid="settings-docs-mobile"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={t("common:project_docs")}
              onClick={openDocs}
            >
              <BookOpen />
            </Button>
          </div>
          <nav className="scrollbar-custom flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
            {nav}
          </nav>
        </>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 桌面端:左侧 220px 竖向分类导航 */}
        {!isMobile && (
          <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-card px-2.5 py-3.5">
            {nav}
          </nav>
        )}

        {/* 右侧滚动卡片区 */}
        <div ref={scrollContainerRef} className="scrollbar-custom min-w-0 flex-1 overflow-y-auto">
          <div className="flex max-w-[760px] flex-col gap-[18px] px-4 pt-4 pb-10 md:px-8 md:pt-6">
            <SettingsCard id="model" icon={Cpu} title={t("agent:settings_cat_model")} register={register}>
              <SettingsField
                label={t("agent:summary_model")}
                description={t("agent:summary_model_desc")}
                isMobile={isMobile}
              >
                <Select value={summaryModelId || DEFAULT_MODEL} onValueChange={handleSummaryChange}>
                  <SelectTrigger data-testid="summary-model" className="w-full">
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
              </SettingsField>
            </SettingsCard>

            <SettingsCard id="search" icon={Search} title={t("agent:settings_cat_search")} register={register}>
              <SettingsField
                label={t("agent:search_engine")}
                description={t("agent:search_engine_desc")}
                isMobile={isMobile}
              >
                <Select value={searchConfig.engine} onValueChange={(v) => updateSearch({ engine: v as Engine })}>
                  <SelectTrigger data-testid="search-engine" className="w-full">
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
              </SettingsField>

              {/* 引擎说明:蓝色 info 提示条 */}
              <div className="my-3 flex items-start gap-2 rounded-lg bg-primary-light px-3 py-2.5">
                <Info className="mt-px size-3.5 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-fg-secondary">{t(ENGINE_TIP_KEY[searchConfig.engine])}</p>
              </div>

              {searchConfig.engine === "google_custom" && (
                <>
                  <SettingsField
                    label={t("agent:search_google_api_key")}
                    description={t("agent:search_google_api_key_desc")}
                    isMobile={isMobile}
                  >
                    <Input
                      data-testid="search-google-api-key"
                      type="password"
                      className="w-full font-mono"
                      value={searchConfig.googleApiKey ?? ""}
                      onChange={(e) => updateSearch({ googleApiKey: e.target.value })}
                    />
                  </SettingsField>
                  <SettingsField
                    label={t("agent:search_google_cse_id")}
                    description={t("agent:search_google_cse_id_desc")}
                    isMobile={isMobile}
                  >
                    <Input
                      data-testid="search-google-cse-id"
                      className="w-full font-mono"
                      value={searchConfig.googleCseId ?? ""}
                      onChange={(e) => updateSearch({ googleCseId: e.target.value })}
                    />
                  </SettingsField>
                </>
              )}
            </SettingsCard>
          </div>
        </div>
      </div>
    </div>
  );
}
