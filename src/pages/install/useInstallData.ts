import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_DISABLE } from "@App/app/repo/scripts";
import type { Subscribe } from "@App/app/repo/subscribe";
import type { SCMetadata } from "@App/app/repo/metadata";
import type { ScriptInfo } from "@App/pkg/utils/scriptInstall";
import { getTempCode } from "@App/pkg/utils/scriptInstall";
import { prepareScriptByCode, prepareSubscribeByCode, fetchScriptBody, parseMetadata } from "@App/pkg/utils/script";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { prettyUrl } from "@App/pkg/utils/url-utils";
import { formatBytes } from "@App/pkg/utils/utils";
import { i18nName, i18nDescription } from "@App/locales/locales";
import { scriptClient, subscribeClient, agentClient } from "@App/pages/store/features/script";
import type { SkillConfigField } from "@App/app/service/agent/core/types";
import { loadHandle } from "@App/pkg/utils/filehandle-db";
import { startFileTrack, unmountFileTrack, type FTInfo } from "@App/pkg/utils/file-tracker";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { derivePermissions, type PermissionRow } from "./permissions";
import {
  deriveVersion,
  deriveAntifeatures,
  deriveScheduleInfo,
  deriveDiffStat,
  type VersionDisplay,
  type AntifeatureType,
  type ScheduleInfo,
  type DiffStat,
} from "./model";

export interface InstallView {
  isUpdate: boolean;
  isSubscribe: boolean;
  name: string;
  iconUrl?: string;
  author?: string;
  source: string;
  description?: string;
  version: VersionDisplay;
  permissions: PermissionRow[];
  antifeatures: AntifeatureType[];
  schedule: ScheduleInfo;
  scheduleNextRun?: string;
  code: string;
  /** 更新态时的旧版本代码,用于代码卡内联 diff;全新安装为 undefined */
  oldCode?: string;
  /** 更新态代码增删行统计,用于代码卡头 +N −M 徽章;无旧代码/无变化为 undefined */
  diffStat?: DiffStat;
  /** 订阅安装时声明的脚本 URL 列表(@scriptURL) */
  subscribeScripts: string[];
}

/**
 * 纯函数:由「已准备好的脚本/订阅 + 旧版本」组装安装页展示视图。
 * oldVersion 为 null 表示全新安装,字符串表示更新。
 */
export function assembleInstallView(args: {
  isUpdate: boolean;
  scriptInfo: ScriptInfo;
  action: Script | Subscribe;
  code: string;
  oldVersion: string | null;
  oldCode?: string;
}): InstallView {
  const { isUpdate, scriptInfo, action, code, oldVersion, oldCode } = args;
  const metadata = scriptInfo.metadata;
  const schedule = deriveScheduleInfo(metadata);
  return {
    isUpdate,
    isSubscribe: scriptInfo.userSubscribe,
    name: i18nName(action),
    iconUrl: metadata.icon?.[0],
    author: metadata.author?.[0],
    source: prettyUrl(scriptInfo.url),
    description: i18nDescription(action),
    version: deriveVersion(metadata.version?.[0], oldVersion),
    permissions: derivePermissions(metadata),
    antifeatures: deriveAntifeatures(metadata),
    schedule,
    scheduleNextRun: schedule?.kind === "cron" ? nextTimeDisplay(schedule.expression) : undefined,
    code,
    oldCode,
    diffStat: oldCode !== undefined && oldCode !== code ? deriveDiffStat(oldCode, code) : undefined,
    subscribeScripts: scriptInfo.userSubscribe ? metadata.scripturl || [] : [],
  };
}

export interface SkillInstallData {
  skillMd: string;
  metadata: { name: string; description: string; version?: string; config?: Record<string, SkillConfigField> };
  prompt: string;
  scripts: Array<{ name: string; code: string }>;
  references: Array<{ name: string; content: string }>;
  isUpdate: boolean;
  installUrl?: string;
}

export type InstallState =
  | { status: "loading"; source?: string; bytesText?: string; percent?: number }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | { status: "ready"; view: InstallView }
  | { status: "skill"; skill: SkillInstallData };

const versionOf = (old: { metadata: { version?: string[] } } | undefined): string | null =>
  old ? (old.metadata.version?.[0] ?? "N/A") : null;

const buildScriptInfo = (uuid: string, code: string, url: string, metadata: SCMetadata): ScriptInfo => ({
  url,
  code,
  uuid,
  userSubscribe: metadata.usersubscribe !== undefined,
  metadata,
  source: "user",
});

let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
const startKeepAlive = (uuid: string) => {
  const tick = () => {
    new TempStorageDAO().update(uuid, { savedAt: Date.now() }).catch(() => {});
  };
  tick();
  clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(tick, 30_000);
};

export interface UseInstallData {
  state: InstallState;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  localFile: boolean;
  watching: boolean;
  toggleWatch: () => void;
  install: (opts?: { closeAfterInstall?: boolean; noMoreUpdates?: boolean }) => Promise<void>;
  close: (opts?: { noMoreUpdates?: boolean }) => void;
  installSkill: () => Promise<void>;
  cancelSkill: () => void;
  retry: () => void;
}

export function useInstallData(): UseInstallData {
  const { t } = useTranslation(["install", "common"]);
  const [state, setState] = useState<InstallState>({ status: "loading" });
  const [enabled, setEnabledState] = useState(false);
  const [localFile, setLocalFile] = useState(false);
  const [watching, setWatching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const actionRef = useRef<Script | Subscribe | null>(null);
  const infoRef = useRef<ScriptInfo | null>(null);
  const handleRef = useRef<FileSystemFileHandle | null>(null);
  const skillUuidRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const uuid = params.get("uuid");
    const skill = params.get("skill");
    const fid = params.get("file");
    const urlIdx = location.search.indexOf("url=");
    const rawUrl = !uuid && urlIdx !== -1 ? location.search.slice(urlIdx + 4) : null;
    let cancelled = false;

    const failed = (e: unknown) => {
      if (!cancelled) setState({ status: "error", message: (e as Error)?.message || String(e) });
    };

    // 由「已下载/读取好的 ScriptInfo」准备脚本并组装视图
    const loadFromInfo = async (info: ScriptInfo, isKnownUpdate: boolean, paramOptions: Record<string, unknown>) => {
      const code = info.code;
      let action: Script | Subscribe;
      let oldVersion: string | null;
      let oldCode: string | undefined;
      if (info.userSubscribe) {
        const p = await prepareSubscribeByCode(code, info.url);
        action = p.subscribe;
        oldVersion = versionOf(p.oldSubscribe);
        oldCode = p.oldSubscribe?.code;
      } else {
        const p = await prepareScriptByCode(
          code,
          info.url,
          isKnownUpdate ? info.uuid : undefined,
          false,
          undefined,
          paramOptions
        );
        action = p.script;
        oldVersion = versionOf(p.oldScript);
        oldCode = p.oldScriptCode;
      }
      if (cancelled) return;
      actionRef.current = action;
      infoRef.current = info;
      setEnabledState(action.status === SCRIPT_STATUS_ENABLE);
      setState({
        status: "ready",
        view: assembleInstallView({
          isUpdate: oldVersion !== null,
          scriptInfo: info,
          action,
          code,
          oldVersion,
          oldCode,
        }),
      });
    };

    (async () => {
      try {
        if (skill) {
          skillUuidRef.current = skill;
          const data = await agentClient.getSkillInstallData(skill);
          if (cancelled) return;
          setState({ status: "skill", skill: data });
        } else if (uuid) {
          startKeepAlive(uuid);
          const cached = await scriptClient.getInstallInfo(uuid);
          const info = cached?.[1];
          if (!info) throw new Error(t("install:script_info_load_failed"));
          const code = await getTempCode(uuid);
          if (code === undefined) throw new Error(t("install:script_info_load_failed"));
          info.code = code;
          await loadFromInfo(info, !!cached?.[0], cached?.[2] || {});
        } else if (rawUrl) {
          let parsed: URL;
          try {
            parsed = new URL(rawUrl);
          } catch {
            setState({ status: "invalid" });
            return;
          }
          const source = prettyUrl(parsed.href);
          if (!cancelled) setState({ status: "loading", source });
          const code = await fetchScriptBody(parsed.href, undefined, ({ receivedLength, totalLength }) => {
            if (cancelled) return;
            // 仅当总大小可信(已接收未超过总量)时才显示百分比,否则退回仅显示已接收字节
            const reliableTotal = totalLength && receivedLength <= totalLength ? totalLength : undefined;
            const percent = reliableTotal ? Math.floor((receivedLength / reliableTotal) * 100) : undefined;
            const bytesText = reliableTotal
              ? t("install:downloading_status_percent", {
                  bytes: formatBytes(receivedLength),
                  total: formatBytes(reliableTotal),
                  percent,
                })
              : t("install:downloading_status_text", { bytes: formatBytes(receivedLength) });
            setState((s) => (s.status === "loading" ? { status: "loading", source, bytesText, percent } : s));
          });
          const metadata = parseMetadata(code);
          if (!metadata) throw new Error(t("install:script_info_load_failed"));
          await loadFromInfo(buildScriptInfo(uuidv4(), code, parsed.href, metadata), false, {});
        } else if (fid) {
          const handle = await loadHandle(fid);
          if (!handle) throw new Error(t("install:script_info_load_failed"));
          const file = await handle.getFile();
          const code = await file.text();
          const metadata = parseMetadata(code);
          if (!metadata) throw new Error(t("install:script_info_load_failed"));
          handleRef.current = handle;
          if (!cancelled) setLocalFile(true);
          await loadFromInfo(buildScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, metadata), false, {});
        } else {
          setState({ status: "invalid" });
        }
      } catch (e) {
        failed(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t, reloadKey]);

  // 卸载时停止监听
  useEffect(() => {
    return () => {
      if (handleRef.current) unmountFileTrack(handleRef.current);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    const action = actionRef.current;
    if (action) action.status = v ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
  }, []);

  const install = useCallback(
    async (opts: { closeAfterInstall?: boolean; noMoreUpdates?: boolean } = {}) => {
      const { closeAfterInstall = true, noMoreUpdates = false } = opts;
      const action = actionRef.current;
      const info = infoRef.current;
      if (!action || !info) return;
      try {
        if (info.userSubscribe) {
          await subscribeClient.install(action as Subscribe);
          toast.success(t("install:subscribe_success"));
        } else {
          const script = action as Script;
          if (noMoreUpdates) script.checkUpdate = false;
          if (script.ignoreVersion) script.ignoreVersion = "";
          await scriptClient.install({ script, code: info.code });
          toast.success(t("install:success"));
        }
        if (closeAfterInstall) setTimeout(() => window.close(), 300);
      } catch (e) {
        toast.error(`${t("install:failed")}: ${(e as Error)?.message || String(e)}`);
      }
    },
    [t]
  );

  const close = useCallback((opts?: { noMoreUpdates?: boolean }) => {
    const info = infoRef.current;
    if (opts?.noMoreUpdates && info && !info.userSubscribe) {
      scriptClient.setCheckUpdateUrl(info.uuid, false);
    }
    window.close();
  }, []);

  // 监听文件变更后自动重装,并刷新视图代码
  const onWatchedCodeChanged = useCallback(
    async (newCode: string) => {
      const info = infoRef.current;
      if (!info) return;
      info.code = newCode;
      try {
        const { script } = await prepareScriptByCode(newCode, info.url, (actionRef.current as Script)?.uuid, false);
        actionRef.current = script;
        await scriptClient.install({ script, code: newCode });
        setState((s) => (s.status === "ready" ? { status: "ready", view: { ...s.view, code: newCode } } : s));
      } catch (e) {
        toast.error(`${t("install:failed")}: ${(e as Error)?.message || String(e)}`);
      }
    },
    [t]
  );

  const toggleWatch = useCallback(async () => {
    const handle = handleRef.current;
    const info = infoRef.current;
    const action = actionRef.current;
    if (!handle || !info || !action) return;
    if (!watching) {
      // 开启监听前先安装当前内容,再追踪后续变更(对照 v1.4 setupWatchFile)
      try {
        await scriptClient.install({ script: action as Script, code: info.code });
      } catch (e) {
        toast.error(`${t("install:failed")}: ${(e as Error)?.message || String(e)}`);
        return;
      }
      const ftInfo: FTInfo = {
        uuid: info.uuid,
        fileName: handle.name,
        setCode: (c) => onWatchedCodeChanged(c),
        onFileError: () => setWatching(false),
      };
      startFileTrack(handle, ftInfo);
      setWatching(true);
    } else {
      unmountFileTrack(handle);
      setWatching(false);
    }
  }, [watching, onWatchedCodeChanged, t]);

  const installSkill = useCallback(async () => {
    const uuid = skillUuidRef.current;
    if (!uuid) return;
    try {
      await agentClient.completeSkillInstall(uuid);
      toast.success(t("install:success"));
      setTimeout(() => window.close(), 300);
    } catch (e) {
      toast.error(`${t("install:failed")}: ${(e as Error)?.message || String(e)}`);
    }
  }, [t]);

  const cancelSkill = useCallback(() => {
    const uuid = skillUuidRef.current;
    if (uuid) agentClient.cancelSkillInstall(uuid);
    window.close();
  }, []);

  // 重新触发加载(供加载失败后的重试按钮)
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  return {
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
  };
}
