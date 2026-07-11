import { useTranslation } from "react-i18next";
import { Pencil, Copy, Star, Trash2, Eye, Image as ImageIcon, Box, KeyRound } from "lucide-react";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { AgentEntityCard } from "../components/AgentEntityCard";
import { AgentCardMenu, type AgentCardMenuItem } from "../components/AgentCardMenu";
import { CapabilityTag } from "../components/tags";

// 掩码 API Key：保留前 3 后 4，中间以圆点遮蔽
function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 7) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export function ModelCard({
  model,
  isDefault,
  onEdit,
  onCopy,
  onSetDefault,
  onDelete,
}: {
  model: AgentModelConfig;
  isDefault: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["agent"]);
  const menuItems: AgentCardMenuItem[] = [
    { key: "edit", label: t("agent:model_edit"), icon: Pencil, onSelect: onEdit },
    { key: "copy", label: t("agent:model_copy"), icon: Copy, onSelect: onCopy },
    ...(isDefault
      ? []
      : [{ key: "set-default", label: t("agent:model_set_default"), icon: Star, onSelect: onSetDefault }]),
    { key: "delete", label: t("agent:model_delete"), icon: Trash2, danger: true, onSelect: onDelete },
  ];
  const initial = (model.provider || "?").charAt(0).toUpperCase();
  return (
    <AgentEntityCard>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-[17px] font-bold text-primary">
          {initial}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-foreground">{model.name}</span>
            {isDefault && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary-light px-[7px] py-0.5 text-[11px] font-semibold text-primary">
                {t("agent:model_default_label")}
              </span>
            )}
          </div>
          <span className="text-xs capitalize text-muted-foreground">{model.provider}</span>
        </div>
        <AgentCardMenu items={menuItems} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-fg-secondary">
          <Box className="size-3" />
          {model.model}
        </span>
        {model.supportsVision && (
          <CapabilityTag tone="green" icon={Eye}>
            {t("agent:model_supports_vision")}
          </CapabilityTag>
        )}
        {model.supportsImageOutput && (
          <CapabilityTag tone="violet" icon={ImageIcon}>
            {t("agent:model_supports_image_output")}
          </CapabilityTag>
        )}
      </div>
      {model.apiKey && (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <KeyRound className="size-3" />
          {maskKey(model.apiKey)}
        </span>
      )}
    </AgentEntityCard>
  );
}
