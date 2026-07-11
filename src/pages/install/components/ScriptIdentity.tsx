import { useTranslation } from "react-i18next";
import { User, Globe, ArrowRight, Timer, Clock, Power, FileCode } from "lucide-react";
import { Switch } from "@App/pages/components/ui/switch";
import { cn } from "@App/pkg/utils/cn";
import type { VersionDisplay, AntifeatureType, ScheduleInfo } from "../model";

const ANTIFEATURE_TITLE_KEY: Record<AntifeatureType, string> = {
  "referral-link": "install:referral_link_title",
  ads: "install:ads_title",
  payment: "install:payment_title",
  miner: "install:miner_title",
  membership: "install:membership_title",
  tracking: "install:tracking_title",
};

const ANTIFEATURE_DESC_KEY: Record<AntifeatureType, string> = {
  "referral-link": "install:referral_link_description",
  ads: "install:ads_description",
  payment: "install:payment_description",
  miner: "install:miner_description",
  membership: "install:membership_description",
  tracking: "install:tracking_description",
};

function Tag({ tone, title, children }: { tone: "green" | "amber"; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone === "green" ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"
      )}
    >
      {children}
    </span>
  );
}

export interface ScriptIdentityProps {
  name: string;
  iconUrl?: string;
  version: VersionDisplay;
  author?: string;
  source: string;
  antifeatures: AntifeatureType[];
  schedule: ScheduleInfo;
  scheduleNextRun?: string;
  description?: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
}

export function ScriptIdentity({
  name,
  iconUrl,
  version,
  author,
  source,
  antifeatures,
  schedule,
  scheduleNextRun,
  description,
  enabled,
  onEnabledChange,
}: ScriptIdentityProps) {
  const { t } = useTranslation(["install", "common"]);

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-5">
      <div className="flex gap-4">
        <div className="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-primary-light">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="size-9 rounded-md object-contain" />
          ) : (
            <FileCode className="size-7 text-primary" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight text-foreground">{name}</h1>
            {version.kind === "install" ? (
              <span
                data-testid="version-single"
                className="rounded-md bg-input px-1.5 py-0.5 font-mono text-xs text-foreground"
              >
                {`v${version.version}`}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span data-testid="version-old" className="font-mono text-xs text-muted-foreground line-through">
                  {`v${version.oldVersion}`}
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span
                  data-testid="version-new"
                  className="rounded-md bg-primary-light px-1.5 py-0.5 font-mono text-xs text-primary"
                >
                  {`v${version.newVersion}`}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {author && (
              <>
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5" />
                  {author}
                </span>
                <span className="size-[3px] shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />
              </>
            )}
            <span className="flex min-w-0 items-center gap-1.5">
              <Globe className="size-3.5 shrink-0" />
              <span className="truncate">{source}</span>
            </span>
          </div>

          {(schedule || antifeatures.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {schedule?.kind === "background" && (
                <Tag tone="green" title={t("install:background_script_description")}>
                  {t("install:badge_background")}
                </Tag>
              )}
              {schedule?.kind === "cron" && (
                <Tag tone="green" title={t("install:scheduled_script_description_title")}>
                  {t("install:badge_scheduled")}
                </Tag>
              )}
              {antifeatures.map((a) => (
                <Tag tone="amber" key={a} title={t(ANTIFEATURE_DESC_KEY[a])}>
                  {t(ANTIFEATURE_TITLE_KEY[a])}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          <span className="text-xs text-muted-foreground">{t("install:enabled_label")}</span>
        </div>
      </div>

      {description && <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-secondary">{description}</p>}

      {schedule?.kind === "cron" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Timer className="size-3.5 text-success" />
            {t("install:schedule_cron_label")}
          </span>
          <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-fg-secondary">
            {schedule.expression}
          </span>
          {scheduleNextRun && (
            <span className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5" />
              <span>{t("install:schedule_next_run")}</span>
              <span>{scheduleNextRun}</span>
            </span>
          )}
        </div>
      )}

      {schedule?.kind === "background" && (
        <div className="flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-2 text-xs text-foreground">
          <Power className="size-3.5 text-success" />
          {t("install:schedule_background_desc")}
        </div>
      )}
    </section>
  );
}
