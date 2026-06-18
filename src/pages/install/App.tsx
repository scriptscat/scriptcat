import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Rss, HardDrive } from "lucide-react";
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
import { BackgroundPrompt, backgroundPromptShownKey } from "./components/BackgroundPrompt";
import { useInstallData } from "./useInstallData";

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
  const [bgPrompt, setBgPrompt] = useState<{ scriptType: string } | null>(null);

  // 后台/定时脚本首次安装时,提示开启后台运行(对照 v1.4 checkBackgroundPrompt)
  const ready = state.status === "ready" ? state.view : null;
  const schedule = ready?.schedule;
  useEffect(() => {
    if (!ready || ready.isSubscribe || !schedule) return;
    if (localStorage.getItem(backgroundPromptShownKey) === "true") return;
    let cancelled = false;
    isPermissionOk("background").then((ok) => {
      if (!cancelled && ok === false) {
        setBgPrompt({
          scriptType: schedule.kind === "cron" ? t("install:scheduled_script") : t("install:background_script"),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, schedule, t]);

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
      <BackgroundPrompt open={!!bgPrompt} scriptType={bgPrompt?.scriptType || ""} onResult={() => setBgPrompt(null)} />
    </>
  );
}
