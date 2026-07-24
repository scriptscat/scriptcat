import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Rss, HardDrive, RotateCcw } from "lucide-react";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { isPermissionOk } from "@App/pkg/utils/utils";
import { InstallLayout } from "./components/InstallLayout";
import { ScriptIdentity } from "./components/ScriptIdentity";
import { PermissionCard } from "./components/PermissionCard";
import { SubscribeScripts } from "./components/SubscribeScripts";
import { SkillInstallView } from "./components/SkillInstallView";
import { CodePreview } from "./components/CodePreview";
import { InstallActions } from "./components/InstallActions";
import { InstallWarning } from "./components/InstallWarning";
import { InstallLoading, InstallError } from "./components/InstallStates";
import { WatchingBanner } from "./components/WatchingBanner";
import { BackgroundPrompt, backgroundPromptShownKey, keepAlivePromptShownKey } from "./components/BackgroundPrompt";
import { useInstallData } from "./useInstallData";

const isMainFrame = () => {
  try {
    // 跨域 iframe 下访问 window.top.document 会抛 SecurityError，此时必然不是同源顶层窗口
    return window.top?.document === window.document;
  } catch {
    return false;
  }
};

type PromptPermission = "background" | "webRequestBlocking";

export default function App() {
  const { t } = useTranslation(["install", "common"]);
  const isMobile = useIsMobile();
  const {
    state,
    enabled,
    setEnabled,
    localFile,
    watching,
    watchFileName,
    lastSync,
    toggleWatch,
    install,
    close,
    installSkill,
    cancelSkill,
    retry,
  } = useInstallData();
  const [bgPrompt, setBgPrompt] = useState<{ scriptType: string; permission: PromptPermission } | null>(null);

  // 后台/定时脚本首次安装时,提示开启后台运行(对照 v1.4 checkBackgroundPrompt)
  const ready = state.status === "ready" ? state.view : null;
  const schedule = ready?.schedule;
  useEffect(() => {
    if (!ready || ready.isSubscribe || !schedule) return;
    let cancelled = false;
    void Promise.all([isPermissionOk("background"), isPermissionOk("webRequestBlocking")]).then(([bg, wrb]) => {
      if (cancelled) return;
      const scriptType = schedule.kind === "cron" ? t("install:scheduled_script") : t("install:background_script");
      if (bg === false && localStorage.getItem(backgroundPromptShownKey) !== "true") {
        setBgPrompt({
          scriptType,
          permission: "background",
        });
      } else if (wrb === false && localStorage.getItem(keepAlivePromptShownKey) !== "true") {
        setBgPrompt({
          scriptType,
          permission: "webRequestBlocking",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, schedule, t]);

  // 防点击劫持:安装页禁止被嵌入 iframe,须在 loading/skill/error 等所有状态渲染前拦截
  if (!isMainFrame()) {
    return (
      <InstallError
        title={t("install:frame_blocked_title")}
        message={t("install:frame_blocked_desc")}
        onClose={close}
      />
    );
  }

  if (state.status === "loading") {
    return <InstallLoading source={state.source} bytesText={state.bytesText} percent={state.percent} />;
  }
  if (state.status === "invalid") {
    return <InstallError title={t("install:invalid_page")} message={t("install:error_invalid_desc")} onClose={close} />;
  }
  if (state.status === "error") {
    return <InstallError message={state.message} onRetry={retry} onClose={close} />;
  }
  if (state.status === "skill") {
    return (
      <SkillInstallView
        metadata={state.skill.metadata}
        prompt={state.skill.prompt}
        scripts={state.skill.scripts}
        references={state.skill.references}
        isUpdate={state.skill.isUpdate}
        installUrl={state.skill.installUrl}
        onInstall={installSkill}
        onCancel={cancelSkill}
      />
    );
  }

  const view = state.view;
  const baseTitle = view.isSubscribe
    ? view.isUpdate
      ? t("install:update_subscribe")
      : t("install:subscribe")
    : view.isUpdate
      ? t("install:context_update")
      : t("install:context_install");
  // 监听本地文件时,顶栏上下文 chip 切换为品牌蓝脉冲「监听中」(对照设计稿)
  const title = watching ? t("install:watching_chip") : baseTitle;
  const titleTone = watching ? "watching" : "default";
  const titleIcon = view.isSubscribe ? Rss : view.isUpdate ? RefreshCw : localFile ? HardDrive : Download;

  return (
    <>
      <InstallLayout
        title={title}
        titleIcon={titleIcon}
        titleTone={titleTone}
        actions={
          <InstallActions
            isUpdate={view.isUpdate}
            inTrash={view.inTrash}
            versionChanged={view.version.kind === "update" && view.version.changed}
            isSubscribe={view.isSubscribe}
            primaryDisabled={watching}
            localFile={localFile}
            watching={watching}
            onInstall={install}
            onClose={close}
            onToggleWatch={toggleWatch}
          />
        }
      >
        <ScriptIdentity
          name={view.name}
          iconUrl={view.iconUrl}
          version={view.version}
          author={view.author}
          source={view.source}
          antifeatures={view.antifeatures}
          schedule={view.schedule}
          scheduleNextRun={view.scheduleNextRun}
          description={view.description}
          enabled={enabled}
          onEnabledChange={setEnabled}
        />
        {watching && <WatchingBanner fileName={watchFileName || ""} lastSync={lastSync} />}
        {view.inTrash && (
          <div
            data-testid="in-trash-banner"
            className="flex items-center gap-2.5 px-4 py-3 border rounded-lg border-border bg-muted"
          >
            <RotateCcw className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">{t("install:in_trash_hint")}</span>
          </div>
        )}
        {view.isSubscribe ? (
          <SubscribeScripts scriptUrls={view.subscribeScripts} />
        ) : (
          <PermissionCard rows={view.permissions} />
        )}
        <InstallWarning
          hasDangerPermission={view.permissions.some((p) => p.risk === "danger")}
          hasAntifeature={view.antifeatures.length > 0}
        />
        <CodePreview code={view.code} oldCode={view.oldCode} diffStat={view.diffStat} defaultCollapsed={isMobile} />
      </InstallLayout>
      <BackgroundPrompt
        open={!!bgPrompt}
        scriptType={bgPrompt?.scriptType || ""}
        permission={bgPrompt?.permission}
        onResult={() => setBgPrompt(null)}
      />
    </>
  );
}
