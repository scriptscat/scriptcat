import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Blocks,
  BookOpen,
  SlidersHorizontal,
  Link,
  Calendar,
  ArrowUp,
  Eye,
  Download,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { SkillSummary } from "@App/app/service/agent/core/types";
import { cn } from "@App/pkg/utils/cn";
import { Switch } from "@App/pages/components/ui/switch";
import { AgentCardMenu, type AgentCardMenuItem } from "../_agent/AgentCardMenu";
import { CapabilityTag } from "../_agent/tags";

export function SkillCard({
  skill,
  updateAvailable,
  onDetail,
  onPreloadDetail,
  onToggleEnabled,
  onUpdate,
  onRefresh,
  onUninstall,
}: {
  skill: SkillSummary;
  updateAvailable?: string; // 远程新版本号（有更新时）
  onDetail: () => void;
  onPreloadDetail: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onUpdate: () => void;
  onRefresh: () => void;
  onUninstall: () => void;
}) {
  const { t } = useTranslation(["agent"]);
  const enabled = skill.enabled !== false;

  const menuItems: AgentCardMenuItem[] = [
    { key: "detail", label: t("agent:skills_detail"), icon: Eye, onSelect: onDetail },
    ...(updateAvailable
      ? [{ key: "update", label: t("agent:skills_update"), icon: Download, onSelect: onUpdate }]
      : []),
    { key: "refresh", label: t("agent:skills_refresh"), icon: RefreshCw, onSelect: onRefresh },
    { key: "uninstall", label: t("agent:skills_uninstall"), icon: Trash2, danger: true, onSelect: onUninstall },
  ];

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-[18px]", !enabled && "opacity-60")}
    >
      {/* 顶部：头像 + 名称/版本/可更新 + 启用开关 + kebab */}
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-skill-bg">
          <Sparkles className="size-5 text-skill-fg" />
        </div>
        <button
          type="button"
          onClick={onDetail}
          onPointerEnter={onPreloadDetail}
          onFocus={onPreloadDetail}
          className="flex min-w-0 flex-1 flex-col gap-1 rounded text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          data-testid={`skill-open-${skill.name}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-[15px] font-semibold text-foreground">{skill.name}</span>
            {skill.version && (
              <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-fg-secondary">
                {`v${skill.version}`}
              </span>
            )}
            {updateAvailable && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-fg">
                <ArrowUp className="size-3" />
                {t("agent:skills_update_available", { version: updateAvailable })}
              </span>
            )}
          </div>
        </button>
        <Switch
          checked={enabled}
          onCheckedChange={onToggleEnabled}
          data-testid={`skill-switch-${skill.name}`}
          aria-label={skill.name}
        />
        <AgentCardMenu items={menuItems} />
      </div>

      {/* 描述（两行截断） */}
      {skill.description && (
        <p className="line-clamp-2 text-[13px] leading-snug text-fg-secondary">{skill.description}</p>
      )}

      {/* 能力标签行 */}
      <div className="flex flex-wrap items-center gap-2">
        {skill.toolNames.length > 0 && (
          <CapabilityTag tone="blue" icon={Blocks}>
            {t("agent:skills_tools")} {skill.toolNames.length}
          </CapabilityTag>
        )}
        {skill.referenceNames.length > 0 && (
          <CapabilityTag tone="green" icon={BookOpen}>
            {t("agent:skills_references_short")} {skill.referenceNames.length}
          </CapabilityTag>
        )}
        {skill.hasConfig && (
          <CapabilityTag tone="orange" icon={SlidersHorizontal}>
            {t("agent:skills_configurable")}
          </CapabilityTag>
        )}
        {skill.installUrl && (
          <CapabilityTag tone="violet" icon={Link}>
            {"URL"}
          </CapabilityTag>
        )}
      </div>

      {/* 底部：安装日期 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="size-3" />
        {t("agent:skills_installed_at")} {new Date(skill.installtime).toLocaleDateString()}
      </div>
    </div>
  );
}
