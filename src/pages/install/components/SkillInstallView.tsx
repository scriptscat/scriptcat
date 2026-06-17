import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, ChevronDown, ChevronRight, Wrench, SlidersHorizontal, FileText, Globe, Lock } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { cn } from "@App/pkg/utils/cn";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import type { SkillConfigField } from "@App/app/service/agent/core/types";
import { InstallLayout } from "./InstallLayout";

export interface SkillInstallViewProps {
  metadata: { name: string; description: string; version?: string; config?: Record<string, SkillConfigField> };
  prompt: string;
  scripts: Array<{ name: string; code: string }>;
  references: Array<{ name: string; content: string }>;
  isUpdate: boolean;
  installUrl?: string;
  onInstall: () => void;
  onCancel: () => void;
}

const violetChip = "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Wrench;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <Icon className="size-[18px] text-violet-600 dark:text-violet-400" />
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span>
        )}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function SkillInstallView({
  metadata,
  prompt,
  scripts,
  references,
  isUpdate,
  installUrl,
  onInstall,
  onCancel,
}: SkillInstallViewProps) {
  const { t } = useTranslation(["install", "common"]);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const title = isUpdate ? t("install:context_skill_update") : t("install:context_skill_install");
  const configEntries = Object.entries(metadata.config || {});

  return (
    <InstallLayout
      title={title}
      actions={
        <div className="flex w-full flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t("install:skill_warning")}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" data-testid="skill-cancel" onClick={onCancel}>
              {t("common:close")}
            </Button>
            <Button
              data-testid="skill-install"
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={onInstall}
            >
              {isUpdate ? t("install:skill_update") : t("install:skill_install")}
            </Button>
          </div>
        </div>
      }
    >
      {/* 身份卡 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex gap-4">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
            <Sparkles className="size-7 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold leading-tight text-foreground">{metadata.name}</h1>
              <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", violetChip)}>{"Skill"}</span>
              {metadata.version && (
                <span className="rounded-md bg-input px-1.5 py-0.5 font-mono text-xs text-foreground">{`v${metadata.version}`}</span>
              )}
              {isUpdate && (
                <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-xs font-medium text-success-fg">
                  {t("install:update_script")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("rounded px-1.5 py-0.5 font-medium", violetChip)}>{t("install:skill_kind")}</span>
              {installUrl && (
                <span className="flex min-w-0 items-center gap-1">
                  <Globe className="size-3.5 shrink-0" />
                  <span className="truncate">{installUrl}</span>
                </span>
              )}
            </div>
            {metadata.description && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {metadata.description}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 提示词卡 */}
      {prompt && (
        <SectionCard icon={FileText} title={t("install:skill_prompt_title")}>
          <button
            type="button"
            data-testid="skill-prompt-toggle"
            onClick={() => setPromptExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className={cn("rounded px-1.5 py-0.5 font-mono text-xs", violetChip)}>
              {t("install:skill_prompt_chip")}
            </span>
            {promptExpanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </button>
          {promptExpanded ? (
            <pre
              data-testid="skill-prompt-full"
              className="mt-2 max-h-80 overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-[13px] whitespace-pre-wrap text-foreground"
            >
              {prompt}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {prompt.length > 150 ? `${prompt.slice(0, 150)}...` : prompt}
            </p>
          )}
        </SectionCard>
      )}

      {/* 工具卡 */}
      {scripts.length > 0 && (
        <SectionCard icon={Wrench} title={t("install:skill_tools_title")} count={scripts.length}>
          <div className="flex flex-col gap-2.5">
            {scripts.map((script) => {
              const meta = parseSkillScriptMetadata(script.code);
              return (
                <div key={script.name} className="rounded-lg bg-muted p-3">
                  <span className={cn("inline-block rounded px-1.5 py-0.5 font-mono text-xs", violetChip)}>
                    {meta?.name || script.name}
                  </span>
                  {meta?.description && <p className="mt-1.5 text-xs text-muted-foreground">{meta.description}</p>}
                  {meta && meta.params.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {meta.params.map((p) => (
                        <div key={p.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded bg-input px-1.5 py-0.5 font-mono text-foreground">{p.name}</span>
                          <span className="text-muted-foreground">{p.type}</span>
                          {p.required && (
                            <span className="rounded bg-destructive/10 px-1 text-destructive">
                              {t("install:skill_required")}
                            </span>
                          )}
                          {p.description && <span className="text-muted-foreground">{p.description}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {meta && meta.grants.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {meta.grants.map((g) => (
                        <span
                          key={g}
                          className="rounded-md bg-warning-bg px-1.5 py-0.5 font-mono text-xs text-warning-fg"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* 配置卡 */}
      {configEntries.length > 0 && (
        <SectionCard icon={SlidersHorizontal} title={t("install:skill_config_title")} count={configEntries.length}>
          <div className="flex flex-col gap-2">
            {configEntries.map(([key, field]) => (
              <div key={key} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted p-3 text-xs">
                <span className="rounded bg-input px-1.5 py-0.5 font-mono text-foreground">{key}</span>
                <span className="text-muted-foreground">{field.type}</span>
                {field.required && (
                  <span className="rounded bg-destructive/10 px-1 text-destructive">{t("install:skill_required")}</span>
                )}
                {field.secret && (
                  <span className={cn("inline-flex items-center gap-0.5 rounded px-1", violetChip)}>
                    <Lock className="size-3" />
                    {t("install:skill_secret")}
                  </span>
                )}
                {field.title && <span className="text-muted-foreground">{field.title}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 参考资料卡 */}
      {references.length > 0 && (
        <SectionCard icon={FileText} title={t("install:skill_references_title")} count={references.length}>
          <div className="flex flex-wrap gap-1.5">
            {references.map((ref) => (
              <span key={ref.name} className="rounded-md bg-success-bg px-1.5 py-0.5 font-mono text-xs text-success-fg">
                {ref.name}
              </span>
            ))}
          </div>
        </SectionCard>
      )}
    </InstallLayout>
  );
}
