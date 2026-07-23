import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Power, PowerOff, Trash2, FileCode, CircleAlert, History, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { notify } from "@App/pages/components/ui/toast";
import { externalAccessClient, scriptClient } from "@App/pages/store/features/script";
import type { Script } from "@App/app/repo/scripts";
import { cn } from "@App/pkg/utils/cn";
import { CountdownChip } from "./CountdownChip";

type OperationView = Awaited<ReturnType<typeof externalAccessClient.getOperation>>;

// install/update 走脚本安装页；这里只处理无代码的轻量确认（设计 §3.0）。
type SupportedKind = "enable" | "disable" | "delete" | "source_disclosure";

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="size-6 shrink-0" />
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

function PageShell({ topRight, children }: { topRight?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation("external_access");
  return (
    <div data-testid="external-access-confirm-shell" className="flex min-h-screen flex-col bg-muted">
      {/* 顶栏:品牌 + 「外部接入 · 操作确认」面包屑 + 右侧 TTL 倒计时(设计稿 Th6Hv) */}
      <header className="flex items-center justify-between gap-3 border-b bg-card px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <span className="truncate text-sm text-muted-foreground">{t("external_access:confirm_topbar")}</span>
        </div>
        {topRight}
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">{children}</div>
    </div>
  );
}

const cardClass = "flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border bg-card shadow-lg";

const KIND_META: Record<SupportedKind, { icon: LucideIcon; titleKey: string; source: boolean }> = {
  enable: { icon: Power, titleKey: "external_access:confirm_enable_title", source: false },
  disable: { icon: PowerOff, titleKey: "external_access:confirm_disable_title", source: false },
  delete: { icon: Trash2, titleKey: "external_access:confirm_delete_title", source: false },
  source_disclosure: { icon: FileCode, titleKey: "external_access:confirm_source_title", source: true },
};

export function ExternalAccessConfirmView({ operationId }: { operationId: string }) {
  const { t } = useTranslation(["external_access", "common"]);
  const [op, setOp] = useState<OperationView>();
  const [script, setScript] = useState<Script | null | undefined>();
  const [loadError, setLoadError] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    externalAccessClient
      .getOperation(operationId)
      .then((result) => {
        if (cancelled) return;
        if (!result || result.status !== "awaiting_user") {
          setLoadError(true);
          return;
        }
        setOp(result);
        if (result.targetUuid) {
          void scriptClient.findInfo(result.targetUuid).then((s) => !cancelled && setScript(s));
        }
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [operationId]);

  const decide = async (approved: boolean, options: { enable?: boolean; rememberSession?: boolean } = {}) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    try {
      await externalAccessClient.decideOperation({ operationId, approved, ...options });
    } catch (e) {
      notify.error((e as Error)?.message || String(e));
    } finally {
      window.close();
    }
  };

  if (loadError || !op) {
    return (
      <PageShell>
        <div
          data-testid="external-access-confirm-expired"
          className={cn(cardClass, "items-center gap-5 p-7 text-center")}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="size-7 text-destructive" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("external_access:err_operation_expired")}
          </p>
          <Button variant="secondary" size="lg" className="w-full font-semibold" onClick={() => window.close()}>
            {t("common:close")}
          </Button>
        </div>
      </PageShell>
    );
  }

  const kind = op.kind as SupportedKind;
  const meta = KIND_META[kind] ?? KIND_META.enable;
  const Icon = meta.icon;
  const scriptName = script?.name ?? op.targetUuid ?? "";
  const version = script?.metadata.version?.[0];
  const author = script?.author;

  return (
    <PageShell topRight={<CountdownChip expiresAt={op.expiresAt} />}>
      <div data-testid="external-access-confirm-card" className={cardClass}>
        {/* Head: icon + title + channel-based subtitle + kind tag (设计 §3.0.1: 不显示客户端名) */}
        <div className="flex items-center justify-between gap-3 border-b px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="size-[22px] text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-foreground">{t(meta.titleKey)}</h1>
              <span className="text-[13px] text-muted-foreground">{t("external_access:confirm_via_external")}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {meta.source ? t("external_access:tag_source") : t("external_access:tag_write")}
          </span>
        </div>

        {/* Body: script identity + (source) privacy hint */}
        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="flex flex-col gap-1.5 rounded-xl bg-secondary p-3.5">
            <div className="flex items-center gap-2">
              <FileCode className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold text-foreground">{scriptName}</span>
            </div>
            {(author || version) && (
              <span className="text-xs text-muted-foreground">
                {t("external_access:confirm_script_meta", {
                  author: author ?? "-",
                  version: version ?? "-",
                })}
              </span>
            )}
          </div>
          {meta.source && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>{t("external_access:source_privacy_hint")}</span>
            </div>
          )}
        </div>

        {/* Footer: 三档决策 拒绝 / 本会话允许 / 允许 (设计 §3) */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <Button
            variant="ghost"
            data-testid="external-access-confirm-reject"
            className="text-muted-foreground"
            onClick={() => void decide(false)}
          >
            {t("external_access:decision_reject")}
          </Button>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              data-testid="external-access-confirm-session-allow"
              className="gap-1.5 font-medium text-primary"
              onClick={() => void decide(true, { enable: kind === "enable", rememberSession: true })}
            >
              <History className="size-4" />
              {t("external_access:decision_session_allow")}
            </Button>
            <Button
              variant={kind === "delete" ? "destructive" : "default"}
              data-testid="external-access-confirm-approve"
              autoFocus
              className="font-semibold"
              onClick={() => void decide(true, { enable: kind === "enable" })}
            >
              {t("external_access:decision_allow")}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default function App() {
  const params = new URLSearchParams(location.search);
  const operationId = params.get("op");
  if (!operationId) return null;
  return <ExternalAccessConfirmView operationId={operationId} />;
}
