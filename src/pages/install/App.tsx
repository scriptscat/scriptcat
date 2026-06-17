import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { isPermissionOk } from "@App/pkg/utils/utils";
import { InstallLayout } from "./components/InstallLayout";
import { ScriptIdentity } from "./components/ScriptIdentity";
import { PermissionCard } from "./components/PermissionCard";
import { SubscribeScripts } from "./components/SubscribeScripts";
import { SkillInstallView } from "./components/SkillInstallView";
import { CodePreview } from "./components/CodePreview";
import { InstallActions } from "./components/InstallActions";
import { InstallLoading, InstallError } from "./components/InstallStates";
import { BackgroundPrompt, backgroundPromptShownKey } from "./components/BackgroundPrompt";
import { useInstallData } from "./useInstallData";

export default function App() {
  const { t } = useTranslation(["install", "common"]);
  const {
    state,
    enabled,
    setEnabled,
    localFile,
    watching,
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
  const title = view.isSubscribe
    ? view.isUpdate
      ? t("install:update_subscribe")
      : t("install:subscribe")
    : view.isUpdate
      ? t("install:context_update")
      : t("install:context_install");

  return (
    <>
      <InstallLayout
        title={title}
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
        {watching && (
          <div
            data-testid="watching-strip"
            className="flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-xs text-success-fg"
          >
            <Eye className="size-4 shrink-0" />
            {t("install:watching_status")}
          </div>
        )}
        {view.isSubscribe ? (
          <SubscribeScripts scriptUrls={view.subscribeScripts} />
        ) : (
          <PermissionCard rows={view.permissions} />
        )}
        <CodePreview code={view.code} oldCode={view.oldCode} diffStat={view.diffStat} />
      </InstallLayout>
      <BackgroundPrompt open={!!bgPrompt} scriptType={bgPrompt?.scriptType || ""} onResult={() => setBgPrompt(null)} />
    </>
  );
}
