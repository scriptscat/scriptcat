import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { Cookie, FolderSync, Globe, ShieldCheck, TriangleAlert, CircleAlert, type LucideIcon } from "lucide-react";
import { permissionClient } from "@App/pages/store/features/script";
import { Button } from "@App/pages/components/ui/button";
import { Switch } from "@App/pages/components/ui/switch";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { cn } from "@App/pkg/utils/cn";
import {
  resolveConfirmType,
  availableDurations,
  canApplyToAll,
  isSiteAccess,
  isHighSensitive,
  type Duration,
} from "./confirm-options";
import { versionDisplay } from "../utils";

type ConfirmInfo = Awaited<ReturnType<typeof permissionClient.getPermissionInfo>>;

const DURATION_LABEL: Record<Duration, string> = {
  once: "duration_once",
  temporary: "duration_temporary",
  permanent: "duration_permanent",
};

// 不同权限的图标与配色（语义令牌类名）。图标底色为对应语义色的浅色蒙版（~12% 透明度），
// 在亮/暗两套主题下都呈现一致的柔和色晕，与错误态的 destructive/10 处理一致。
function permissionVisual(permission: string): { Icon: LucideIcon; bgClass: string; iconClass: string } {
  switch (permission) {
    case "cookie":
      return { Icon: Cookie, bgClass: "bg-warning/10", iconClass: "text-warning" };
    case "file_storage":
      return { Icon: FolderSync, bgClass: "bg-secondary", iconClass: "text-foreground" };
    case "extension-site-access":
      return { Icon: ShieldCheck, bgClass: "bg-primary/10", iconClass: "text-primary" };
    default:
      return { Icon: Globe, bgClass: "bg-primary/10", iconClass: "text-primary" };
  }
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="size-6 shrink-0" />
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <BrandMark />
      {children}
    </div>
  );
}

const cardClass = "flex w-full max-w-[480px] flex-col gap-5 rounded-2xl border bg-card p-7 shadow-lg";

export function PermissionConfirm({ uuid }: { uuid: string }) {
  const { t } = useTranslation(["permission", "common"]);
  const isMobile = useIsMobile();
  const [info, setInfo] = useState<ConfirmInfo>();
  const [loadError, setLoadError] = useState(false);
  const [duration, setDuration] = useState<Duration>("once");
  const [applyToAll, setApplyToAll] = useState(false);
  const [second, setSecond] = useState(30);
  const decidedRef = useRef(false);

  const decide = useCallback(
    async (allow: boolean, type: number) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      try {
        await permissionClient.confirm(uuid, { allow, type });
        window.close();
      } catch (e) {
        notify.error((e as Error)?.message || t("common:confirm_error"));
        setTimeout(() => window.close(), 3000);
      }
    },
    [uuid, t]
  );

  const ignore = useCallback(() => decide(false, 0), [decide]);
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;

  // 加载授权信息
  useEffect(() => {
    permissionClient
      .getPermissionInfo(uuid)
      .then(setInfo)
      .catch(() => setLoadError(true));
  }, [uuid]);

  // 倒计时：归零按「忽略」自动关闭
  useEffect(() => {
    if (!info) return;
    const timer = setInterval(() => {
      setSecond((s) => {
        if (s <= 1) {
          clearInterval(timer);
          ignoreRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [info]);

  // 用户直接关闭窗口时记为忽略，避免脚本调用悬挂
  useEffect(() => {
    const handler = () => {
      if (!decidedRef.current) permissionClient.confirm(uuid, { allow: false, type: 0 });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uuid]);

  // 加载失败：3 秒后自动关闭
  useEffect(() => {
    if (!loadError) return;
    const timer = setTimeout(() => window.close(), 3000);
    return () => clearTimeout(timer);
  }, [loadError]);

  if (loadError) {
    return (
      <PageShell>
        <div className={cn(cardClass, "items-center text-center")}>
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="size-7 text-destructive" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{t("permission:confirm_expired_title")}</h1>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t("permission:confirm_expired_desc")}</p>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="w-full border border-border font-semibold"
            onClick={() => window.close()}
          >
            {t("common:close")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("permission:auto_close_in", { second: 3 })}</span>
        </div>
      </PageShell>
    );
  }

  if (!info) {
    return (
      <PageShell>
        <div className={cn(cardClass, "animate-pulse")} aria-label={t("permission:loading_confirm")}>
          {/* 头部骨架 */}
          <div className="flex flex-col items-center gap-3.5">
            <div className="size-14 rounded-full bg-input" />
            <div className="h-[18px] w-52 rounded-md bg-input" />
            <div className="h-3 w-60 rounded-md bg-input" />
          </div>
          {/* 身份骨架 */}
          <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
            <div className="size-10 shrink-0 rounded-full bg-input" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-32 rounded-md bg-input" />
              <div className="h-3 w-24 rounded-md bg-input" />
            </div>
          </div>
          {/* 请求目标骨架 */}
          <div className="flex flex-col gap-3 rounded-xl bg-muted p-3">
            <div className="h-3 w-44 rounded-md bg-input" />
            <div className="h-3 w-60 rounded-md bg-input" />
          </div>
          {/* 授权时长骨架 */}
          <div className="flex flex-col gap-3">
            <div className="h-3 w-[72px] rounded-md bg-input" />
            <div className="h-10 rounded-lg bg-input" />
          </div>
          {/* 操作骨架 */}
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex gap-3">
              <div className="h-10 flex-1 rounded-md bg-input" />
              <div className="h-10 flex-1 rounded-md bg-input" />
            </div>
            <div className="mx-auto h-4 w-20 rounded-md bg-input" />
          </div>
        </div>
      </PageShell>
    );
  }

  const { script, confirm, likeNum } = info;
  const siteAccess = isSiteAccess(confirm);
  const durations = availableDurations(confirm);
  const showWildcard = canApplyToAll(confirm, likeNum);
  const { Icon, bgClass, iconClass } = permissionVisual(confirm.permission);
  const effectiveApplyToAll = showWildcard && applyToAll && duration !== "once";
  const type = resolveConfirmType(duration, effectiveApplyToAll);

  const scriptNameLabel = t("common:script_name");
  const metaEntries = Object.entries(confirm.metadata || {}).filter(([k]) => k !== scriptNameLabel);
  const version = script.metadata?.version?.[0];
  const initials =
    Array.from((script.name || "?").trim())
      .slice(0, 2)
      .join("") || "?";

  const requestSiteAccess = async () => {
    if (decidedRef.current) return;
    const origins = confirm.extensionSiteAccessOrigins;
    if (origins?.length) {
      const granted = await chrome.permissions.request({ origins }).catch(() => false);
      if (!granted) {
        ignore();
        return;
      }
    }
    decide(true, 1);
  };

  return (
    <PageShell>
      <div className={cardClass}>
        {/* 头部 */}
        <div className="flex flex-col items-center gap-4">
          <div className={cn("flex size-14 items-center justify-center rounded-full", bgClass)}>
            <Icon className={cn("size-7", iconClass)} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-center text-lg font-semibold text-foreground">{confirm.title}</h1>
            {confirm.describe && (
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{confirm.describe}</p>
            )}
          </div>
        </div>

        {/* 高敏感警示 */}
        {isHighSensitive(confirm) && (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="size-[18px] shrink-0 text-warning" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">{t("permission:cookie_warning_title")}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("permission:cookie_warning_desc")}
              </span>
            </div>
          </div>
        )}

        {/* 脚本身份 */}
        <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">{script.name}</span>
            <span className="text-xs text-muted-foreground">
              {t("permission:user_script_type")}
              {versionDisplay(version)}
            </span>
          </div>
        </div>

        {/* 请求目标 */}
        {metaEntries.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-muted">
            {metaEntries.map(([k, v], i) => (
              <div key={k} className={cn("flex gap-3 px-3 py-2.5", i > 0 && "border-t border-border")}>
                <span className="w-[76px] shrink-0 text-xs text-muted-foreground">{k}</span>
                <span
                  className={cn(
                    "flex-1 break-all font-mono text-[13px] font-medium",
                    i === 0 ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 授权时长 + 通配范围（站点访问无此区） */}
        {!siteAccess && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-medium text-foreground">{t("permission:auth_duration")}</span>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`confirm-duration-${d}`}
                  aria-pressed={duration === d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm transition-colors",
                    duration === d ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {t(`permission:${DURATION_LABEL[d]}`)}
                </button>
              ))}
            </div>
            {showWildcard && (
              <div className="flex items-center gap-3 pt-0.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {t("permission:apply_to_all_domains")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("permission:apply_to_all_domains_desc")}</span>
                </div>
                <Switch checked={applyToAll} disabled={duration === "once"} onCheckedChange={setApplyToAll} />
              </div>
            )}
          </div>
        )}

        {/* 操作区 */}
        {siteAccess ? (
          <div className="flex flex-col gap-2.5 pt-1">
            <Button
              size="lg"
              data-testid="confirm-request"
              className="w-full font-semibold"
              onClick={requestSiteAccess}
            >
              {t("permission:request_permission")}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              data-testid="confirm-cancel"
              className="w-full text-muted-foreground"
              onClick={ignore}
            >
              {t("permission:cancel_action")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-1">
            <div data-testid="confirm-button-row" className={cn("flex gap-3", isMobile ? "flex-col" : "flex-row")}>
              <Button
                size="lg"
                data-testid="confirm-allow"
                className="flex-1 font-semibold"
                onClick={() => decide(true, type)}
              >
                {t("permission:allow_action")}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                data-testid="confirm-deny"
                className="flex-1 border border-border font-semibold"
                onClick={() => decide(false, type)}
              >
                {t("permission:deny_action")}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="lg"
              data-testid="confirm-ignore"
              className="w-full text-muted-foreground"
              onClick={ignore}
            >
              {`${t("permission:ignore_action")} (${second})`}
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export default function App() {
  const uuid = new URLSearchParams(location.search).get("uuid");
  if (!uuid) return null;
  return <PermissionConfirm uuid={uuid} />;
}
