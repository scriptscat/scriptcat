import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Server } from "lucide-react";
import { notify } from "@App/pages/components/ui/toast";
import { Button } from "@App/pages/components/ui/button";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { agentClient } from "@App/pages/store/features/script";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { AgentPageHeader } from "../components/AgentPageHeader";
import { agentDocUrl } from "../components/agentDocs";
import { AgentEmptyState } from "../components/AgentEmptyState";
import { CountBar } from "../components/CountBar";
import { ModelCard } from "./ModelCard";
import { ModelFormDialog } from "./ModelFormDialog";
import { testConnection, fetchModels } from "./provider_api";

export default function AgentProvider() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentModelConfig | null>(null);

  const reload = useCallback(async () => {
    const [list, def] = await Promise.all([agentClient.listModels(), agentClient.getDefaultModelId()]);
    setModels(list);
    setDefaultId(def);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (m: AgentModelConfig) => {
    setEditing(m);
    setDialogOpen(true);
  };

  const handleSubmit = async (form: AgentModelConfig) => {
    const isEditing = !!form.id;
    const toSave = isEditing ? form : { ...form, id: crypto.randomUUID() };
    await agentClient.saveModel(toSave);
    // 第一个模型自动设为默认
    if (!isEditing && models.length === 0) {
      await agentClient.setDefaultModelId(toSave.id);
    }
    setDialogOpen(false);
    notify.success(t("common:save_success"));
    await reload();
  };

  const handleCopy = (m: AgentModelConfig) => {
    // 以源模型预填「新增」弹窗(清空 id → 提交时生成全新 id;名称加后缀),供用户审阅/调整后再保存
    setEditing({ ...m, id: "", name: `${m.name} (Copy)` });
    setDialogOpen(true);
  };

  const handleSetDefault = async (id: string) => {
    await agentClient.setDefaultModelId(id);
    await reload();
  };

  const handleDelete = async (m: AgentModelConfig) => {
    await agentClient.removeModel(m.id);
    // 删除的是默认模型时，将剩余的第一个设为默认
    if (m.id === defaultId) {
      const rest = models.filter((x) => x.id !== m.id);
      if (rest.length) await agentClient.setDefaultModelId(rest[0].id);
    }
    notify.success(t("common:delete_success"));
    await reload();
  };

  return (
    <div className="flex h-full flex-col">
      {/* 移动端复用全局 52px MobileHeader(☰/抽屉/+);此处不渲染 64px 页头,避免双层栏 */}
      {!isMobile && (
        <AgentPageHeader
          icon={Server}
          title={t("agent:provider_title")}
          subtitle={t("agent:provider_subtitle")}
          docHref={agentDocUrl("provider")}
          docLabel={t("agent:provider_docs")}
          actions={
            <Button data-testid="model-add" onClick={handleAdd}>
              <Plus className="size-4" />
              {t("agent:model_add")}
            </Button>
          }
        />
      )}
      <div className="scrollbar-custom flex-1 overflow-y-auto px-4 py-[14px] md:px-7 md:py-[22px]">
        {!loading && models.length === 0 ? (
          <AgentEmptyState
            icon={Server}
            title={t("agent:model_no_models")}
            description={t("agent:model_no_models_desc")}
            action={
              <Button onClick={handleAdd}>
                <Plus className="size-4" />
                {t("agent:model_add")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* 移动端:页头已被全局 MobileHeader 取代,这里补一行「页名 + 新增」上下文栏 */}
            {isMobile && (
              <div data-testid="mobile-actions" className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground">{t("agent:provider_title")}</span>
                <Button data-testid="model-add" size="icon" onClick={handleAdd} aria-label={t("agent:model_add")}>
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
            {/* 计数摘要:桌面两段(模型数 + 默认用于新会话提示),移动仅保留模型数 */}
            <CountBar
              segments={[
                { label: t("agent:model_count", { count: models.length }) },
                ...(isMobile ? [] : [{ label: t("agent:provider_count_hint") }]),
              ]}
            />
            <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
              {models.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  isDefault={m.id === defaultId}
                  onEdit={() => handleEdit(m)}
                  onCopy={() => handleCopy(m)}
                  onSetDefault={() => handleSetDefault(m.id)}
                  onDelete={() => handleDelete(m)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <ModelFormDialog
        open={dialogOpen}
        value={editing}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        onTest={(m) => testConnection(m)}
        onFetchModels={(m) => fetchModels(m)}
      />
    </div>
  );
}
