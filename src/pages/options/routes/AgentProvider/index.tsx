import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@App/pages/components/ui/button";
import { agentClient } from "@App/pages/store/features/script";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { ModelCard } from "./ModelCard";
import { ModelFormDialog } from "./ModelFormDialog";
import { testConnection, fetchModels } from "./provider_api";

export default function AgentProvider() {
  const { t } = useTranslation(["agent", "common"]);
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
    toast.success(t("common:save_success"));
    await reload();
  };

  const handleCopy = async (m: AgentModelConfig) => {
    await agentClient.saveModel({ ...m, id: crypto.randomUUID(), name: `${m.name} copy` });
    toast.success(t("common:save_success"));
    await reload();
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
    toast.success(t("common:delete_success"));
    await reload();
  };

  return (
    <div className="flex h-full flex-col">
      <AgentPageHeader
        icon={Server}
        title={t("agent:provider_title")}
        subtitle={t("agent:provider_subtitle")}
        actions={
          <Button data-testid="model-add" onClick={handleAdd}>
            <Plus className="size-4" />
            {t("agent:model_add")}
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
