import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Message, Typography } from "@arco-design/web-react";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { SCMetadata, Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import type { Subscribe } from "@App/app/repo/subscribe";
import { createScriptInfo, type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import { parseMetadata, prepareScriptByCode, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { scriptClient, subscribeClient, agentClient } from "../store/features/script";
import { type FTInfo, startFileTrack, unmountFileTrack } from "@App/pkg/utils/file-tracker";
import { cleanupOldHandles, loadHandle, saveHandle } from "@App/pkg/utils/filehandle-db";
import { dayFormat } from "@App/pkg/utils/day_format";
import { intervalExecution, timeoutExecution } from "@App/pkg/utils/timer";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";
import { cacheInstance } from "@App/app/cache";
import { formatBytes } from "@App/pkg/utils/utils";
import { i18nName } from "@App/locales/locales";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import type { SkillScriptMetadata } from "@App/app/service/agent/core/types";
import {
  cIdKey,
  backgroundPromptShownKey,
  closeWindow,
  fetchScriptBody,
  cleanupStaleInstallInfo,
  type Permission,
} from "./utils";

type ScriptOrSubscribe = Script | Subscribe;

export function useInstallData() {
  const [enable, setEnable] = useState<boolean>(false);
  const [btnText, setBtnText] = useState<string>("");
  const [scriptCode, setScriptCode] = useState<string>("");
  const [scriptInfo, setScriptInfo] = useState<ScriptInfo>();
  const [upsertScript, setUpsertScript] = useState<ScriptOrSubscribe | undefined>(undefined);
  const [diffCode, setDiffCode] = useState<string>();
  const [oldScriptVersion, setOldScriptVersion] = useState<string | null>(null);
  const [isUpdate, setIsUpdate] = useState<boolean>(false);
  const [localFileHandle, setLocalFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [showBackgroundPrompt, setShowBackgroundPrompt] = useState<boolean>(false);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loaded, setLoaded] = useState<boolean>(false);
  const [doBackwards, setDoBackwards] = useState<boolean>(false);
  const [skillScriptMetadata, setSkillScriptMetadata] = useState<SkillScriptMetadata | null>(null);
  const [watchFile, setWatchFile] = useState(false);

  // Skill 安装相关状态
  const skillInstallUuid = searchParams.get("skill");
  const [skillPreview, setSkillPreview] = useState<{
    metadata: { name: string; description: string; version?: string };
    prompt: string;
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
    isUpdate: boolean;
    installUrl?: string;
  } | null>(null);

  const installOrUpdateScript = async (newScript: Script, code: string) => {
    if (newScript.ignoreVersion) newScript.ignoreVersion = "";
    await scriptClient.install({ script: newScript, code });
    const metadata = newScript.metadata;
    setScriptInfo((prev) => (prev ? { ...prev, code, metadata } : prev));
    const scriptVersion = metadata.version?.[0];
    const oldScriptVersion = typeof scriptVersion === "string" ? scriptVersion : "N/A";
    setOldScriptVersion(oldScriptVersion);
    setUpsertScript(newScript);
    setDiffCode(code);
  };

  const getUpdatedNewScript = async (uuid: string, code: string) => {
    const oldScript = await scriptClient.info(uuid);
    if (!oldScript || oldScript.uuid !== uuid) {
      throw new Error("uuid is mismatched");
    }
    const { script } = await prepareScriptByCode(code, oldScript.origin || "", uuid);
    script.origin = oldScript.origin || script.origin || "";
    if (!script.name) {
      throw new Error(t("script_name_cannot_be_set_to_empty"));
    }
    return script;
  };

  const checkBackgroundPrompt = async (script: Script) => {
    if (!script.metadata.background && !script.metadata.crontab) {
      return false;
    }
    const hasShown = localStorage.getItem(backgroundPromptShownKey);
    if (hasShown !== "true") {
      if (!(await chrome.permissions.contains({ permissions: ["background"] }))) {
        return true;
      }
    }
    return false;
  };

  // Skill ZIP 安装：从缓存加载并解析
  const initSkillFromCache = async (uuid: string) => {
    try {
      setLoaded(true);
      if (window.history.length > 1) {
        setDoBackwards(true);
      }
      const data = await agentClient.getSkillInstallData(uuid);
      setSkillPreview(data);
    } catch (e: any) {
      Message.error(t("script_info_load_failed") + " " + e.message);
    }
  };

  // Skill 安装确认
  const handleSkillInstall = async () => {
    if (!skillInstallUuid) return;
    try {
      await agentClient.completeSkillInstall(skillInstallUuid);
      Message.success(t("install_success")!);
      setTimeout(() => {
        closeWindow(doBackwards);
      }, 500);
    } catch (e) {
      Message.error(`${t("install_failed")}: ${e}`);
    }
  };

  // Skill 安装取消
  const handleSkillCancel = () => {
    if (!skillInstallUuid) return;
    agentClient.cancelSkillInstall(skillInstallUuid);
    closeWindow(doBackwards);
  };

  const initAsync = async () => {
    try {
      const uuid = searchParams.get("uuid");
      const fid = searchParams.get("file");

      // 如果有 url 或 没有 uuid 和 file，跳过初始化逻辑
      if (searchParams.get("url") || (!uuid && !fid)) {
        return;
      }
      let info: ScriptInfo | undefined;
      let isKnownUpdate: boolean = false;

      if (window.history.length > 1) {
        setDoBackwards(true);
      }
      setLoaded(true);

      let paramOptions = {};
      if (uuid) {
        const cachedInfo = await scriptClient.getInstallInfo(uuid);
        cleanupStaleInstallInfo(uuid);
        if (cachedInfo?.[0]) isKnownUpdate = true;
        info = cachedInfo?.[1] || undefined;
        paramOptions = cachedInfo?.[2] || {};
        if (!info) {
          throw new Error("fetch script info failed");
        }
      } else {
        // 检查是不是本地文件安装
        if (!fid) {
          throw new Error("url param - local file id is not found");
        }
        const fileHandle = await loadHandle(fid);
        if (!fileHandle) {
          throw new Error("invalid file access - fileHandle is null");
        }
        const file = await fileHandle.getFile();
        if (!file) {
          throw new Error("invalid file access - file is null");
        }
        // 处理本地文件的安装流程
        setLocalFileHandle((prev) => {
          if (prev instanceof FileSystemFileHandle) unmountFileTrack(prev);
          return fileHandle!;
        });

        // 刷新 timestamp, 使 10s~15s 后不会被立即清掉
        intervalExecution(`${cIdKey}liveFileHandle`, () => saveHandle(fid, fileHandle), 5 * 60 * 1000, true);

        const code = await file.text();
        const metadata = parseMetadata(code);
        if (!metadata) {
          // 非 UserScript，尝试作为 SkillScript 处理
          const skillScriptMeta = parseSkillScriptMetadata(code);
          if (!skillScriptMeta) {
            throw new Error("parse script info failed");
          }
          info = createScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, "user", {} as SCMetadata);
          info.skillScript = true;
        } else {
          info = createScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, "user", metadata);
        }
      }

      // SkillScript 安装：只需解析元数据并展示
      if (info.skillScript) {
        const toolMeta = parseSkillScriptMetadata(info.code);
        if (!toolMeta) {
          throw new Error("Invalid SkillScript: missing or malformed ==SkillScript== header");
        }
        setSkillScriptMetadata(toolMeta);
        setScriptCode(info.code);
        setScriptInfo(info);
        return;
      }

      let prepare:
        | { script: Script; oldScript?: Script; oldScriptCode?: string }
        | { subscribe: Subscribe; oldSubscribe?: Subscribe };
      let action: Script | Subscribe;

      const { code, url } = info;
      let oldVersion: string | undefined = undefined;
      let diffCode: string | undefined = undefined;
      if (info.userSubscribe) {
        prepare = await prepareSubscribeByCode(code, url);
        action = prepare.subscribe;
        if (prepare.oldSubscribe) {
          const oldSubscribeVersion = prepare.oldSubscribe.metadata.version?.[0];
          oldVersion = typeof oldSubscribeVersion === "string" ? oldSubscribeVersion : "N/A";
        }
        diffCode = prepare.oldSubscribe?.code;
      } else {
        const knownUUID = isKnownUpdate ? info.uuid : undefined;
        prepare = await prepareScriptByCode(code, url, knownUUID, false, undefined, paramOptions);
        action = prepare.script;
        if (prepare.oldScript) {
          const oldScriptVersion = prepare.oldScript.metadata.version?.[0];
          oldVersion = typeof oldScriptVersion === "string" ? oldScriptVersion : "N/A";
        }
        diffCode = prepare.oldScriptCode;
      }
      setScriptCode(code);
      setDiffCode(diffCode);
      setOldScriptVersion(typeof oldVersion === "string" ? oldVersion : null);
      setIsUpdate(typeof oldVersion === "string");
      setScriptInfo(info);
      setUpsertScript(action);

      // 检查是否需要显示后台运行提示
      if (!info.userSubscribe) {
        setShowBackgroundPrompt(await checkBackgroundPrompt(action as Script));
      }
    } catch (e: any) {
      Message.error(t("script_info_load_failed") + " " + e.message);
    } finally {
      const delay = Math.floor(5000 * Math.random()) + 10000;
      timeoutExecution(`${cIdKey}cleanupFileHandle`, cleanupOldHandles, delay);
    }
  };

  useEffect(() => {
    if (loaded) return;
    if (skillInstallUuid) {
      initSkillFromCache(skillInstallUuid);
    } else {
      initAsync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loaded]);

  const metadataLive = useMemo(() => (scriptInfo?.metadata || {}) as SCMetadata, [scriptInfo]);

  const permissions = useMemo(() => {
    const permissions: Permission = [];

    if (!scriptInfo) return permissions;

    if (scriptInfo.userSubscribe) {
      permissions.push({
        label: t("subscribe_install_label"),
        color: "#ff0000",
        value: metadataLive.scripturl!,
      });
    }

    if (metadataLive.match) {
      permissions.push({ label: t("script_runs_in"), value: metadataLive.match });
    }

    if (metadataLive.connect) {
      permissions.push({
        label: t("script_has_full_access_to"),
        color: "#F9925A",
        value: metadataLive.connect,
      });
    }

    if (metadataLive.require) {
      permissions.push({ label: t("script_requires"), value: metadataLive.require });
    }

    return permissions;
  }, [scriptInfo, metadataLive, t]);

  const descriptionParagraph = useMemo(() => {
    const ret: JSX.Element[] = [];

    if (!scriptInfo) return ret;

    const isCookie = metadataLive.grant?.some((val: string) => val === "GM_cookie");
    if (isCookie) {
      ret.push(
        <Typography.Text type="error" key="cookie">
          {t("cookie_warning")}
        </Typography.Text>
      );
    }

    if (metadataLive.crontab) {
      ret.push(<Typography.Text key="crontab">{t("scheduled_script_description_title")}</Typography.Text>);
      ret.push(
        <div key="cronta-nexttime" className="tw-flex tw-flex-row tw-flex-wrap tw-gap-x-2">
          <Typography.Text>{t("scheduled_script_description_description_expr")}</Typography.Text>
          <Typography.Text code>{metadataLive.crontab[0]}</Typography.Text>
          <Typography.Text>{t("scheduled_script_description_description_next")}</Typography.Text>
          <Typography.Text code>{nextTimeDisplay(metadataLive.crontab[0])}</Typography.Text>
        </div>
      );
    } else if (metadataLive.background) {
      ret.push(<Typography.Text key="background">{t("background_script_description")}</Typography.Text>);
    }

    return ret;
  }, [scriptInfo, metadataLive, t]);

  const antifeatures: { [key: string]: { color: string; title: string; description: string } } = {
    "referral-link": {
      color: "purple",
      title: t("antifeature_referral_link_title"),
      description: t("antifeature_referral_link_description"),
    },
    ads: {
      color: "orange",
      title: t("antifeature_ads_title"),
      description: t("antifeature_ads_description"),
    },
    payment: {
      color: "magenta",
      title: t("antifeature_payment_title"),
      description: t("antifeature_payment_description"),
    },
    miner: {
      color: "orangered",
      title: t("antifeature_miner_title"),
      description: t("antifeature_miner_description"),
    },
    membership: {
      color: "blue",
      title: t("antifeature_membership_title"),
      description: t("antifeature_membership_description"),
    },
    tracking: {
      color: "pinkpurple",
      title: t("antifeature_tracking_title"),
      description: t("antifeature_tracking_description"),
    },
  };

  // 更新按钮文案和页面标题
  useEffect(() => {
    if (skillPreview) {
      document.title = `${t("install_script")} - ${skillPreview.metadata.name} - ScriptCat`;
      return;
    }
    if (scriptInfo?.skillScript && skillScriptMetadata) {
      document.title = `${t("install_script")} - ${skillScriptMetadata.name} - ScriptCat`;
      return;
    }
    if (scriptInfo?.userSubscribe) {
      setBtnText(isUpdate ? t("update_subscribe")! : t("install_subscribe"));
    } else {
      setBtnText(isUpdate ? t("update_script")! : t("install_script"));
    }
    if (upsertScript) {
      document.title = `${!isUpdate ? t("install_script") : t("update_script")} - ${i18nName(upsertScript!)} - ScriptCat`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpdate, scriptInfo, upsertScript, skillScriptMetadata, t]);

  // 设置脚本状态
  useEffect(() => {
    if (upsertScript) {
      setEnable(upsertScript.status === SCRIPT_STATUS_ENABLE);
    }
  }, [upsertScript]);

  const handleInstall = async (options: { closeAfterInstall?: boolean; noMoreUpdates?: boolean } = {}) => {
    if (!upsertScript) {
      Message.error(t("script_info_load_failed")!);
      return;
    }

    const { closeAfterInstall: shouldClose = true, noMoreUpdates: disableUpdates = false } = options;

    try {
      if (scriptInfo?.userSubscribe) {
        await subscribeClient.install(upsertScript as Subscribe);
        Message.success(t("subscribe_success")!);
        setBtnText(t("subscribe_success")!);
      } else {
        if (disableUpdates && upsertScript) {
          (upsertScript as Script).checkUpdate = false;
        }
        await scriptClient.install({ script: upsertScript as Script, code: scriptCode });
        if (isUpdate) {
          Message.success(t("install.update_success")!);
          setBtnText(t("install.update_success")!);
        } else {
          if (disableUpdates && upsertScript) {
            (upsertScript as Script).checkUpdate = false;
          }
          if ((upsertScript as Script).ignoreVersion) (upsertScript as Script).ignoreVersion = "";
          await scriptClient.install({ script: upsertScript as Script, code: scriptCode });
          if (isUpdate) {
            Message.success(t("install.update_success")!);
            setBtnText(t("install.update_success")!);
          } else {
            Message.success(t("install_success")!);
            setBtnText(t("install_success")!);
          }
        }
      }

      if (shouldClose) {
        setTimeout(() => {
          closeWindow(doBackwards);
        }, 500);
      }
    } catch (e) {
      const errorMessage = scriptInfo?.userSubscribe ? t("subscribe_failed") : t("install_failed");
      Message.error(`${errorMessage}: ${e}`);
    }
  };

  const handleClose = (options?: { noMoreUpdates: boolean }) => {
    const { noMoreUpdates = false } = options || {};
    if (noMoreUpdates && scriptInfo && !scriptInfo.userSubscribe) {
      scriptClient.setCheckUpdateUrl(scriptInfo.uuid, false);
    }
    closeWindow(doBackwards);
  };

  const handleInstallBasic = () => handleInstall();
  const handleInstallCloseAfterInstall = () => handleInstall({ closeAfterInstall: false });
  const handleInstallNoMoreUpdates = () => handleInstall({ noMoreUpdates: true });
  const handleStatusChange = (checked: boolean) => {
    setUpsertScript((script) => {
      if (!script) {
        return script;
      }
      script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
      setEnable(checked);
      return script;
    });
  };
  const handleCloseBasic = () => handleClose();
  const handleCloseNoMoreUpdates = () => handleClose({ noMoreUpdates: true });
  const setWatchFileClick = () => {
    setWatchFile((prev) => !prev);
  };

  const fileWatchMessageId = `id_${Math.random()}`;

  async function onWatchFileCodeChanged(this: FTInfo, code: string, hideInfo: boolean = false) {
    if (this.uuid !== scriptInfo?.uuid) return;
    if (this.fileName !== localFileHandle?.name) return;
    setScriptCode(code);
    const uuid = (upsertScript as Script)?.uuid;
    if (!uuid) {
      throw new Error("uuid is undefined");
    }
    try {
      const newScript = await getUpdatedNewScript(uuid, code);
      await installOrUpdateScript(newScript, code);
    } catch (e) {
      Message.error({
        id: fileWatchMessageId,
        content: t("install_failed") + ": " + e,
      });
      return;
    }
    if (!hideInfo) {
      Message.info({
        id: fileWatchMessageId,
        content: `${t("last_updated")}: ${dayFormat()}`,
        duration: 3000,
        closable: true,
        showIcon: true,
      });
    }
  }

  async function onWatchFileError() {
    setWatchFile(false);
  }

  const memoWatchFile = useMemo(() => {
    return `${watchFile}.${scriptInfo?.uuid}.${localFileHandle?.name}`;
  }, [watchFile, scriptInfo, localFileHandle]);

  const setupWatchFile = async (uuid: string, fileName: string, handle: FileSystemFileHandle) => {
    try {
      const code = `${scriptCode}`;
      await installOrUpdateScript(upsertScript as Script, code);
      setDiffCode(`${code}`);
      const ftInfo: FTInfo = {
        uuid,
        fileName,
        setCode: onWatchFileCodeChanged,
        onFileError: onWatchFileError,
      };
      startFileTrack(handle, ftInfo);
      const file = await handle.getFile();
      const currentCode = await file.text();
      if (currentCode !== code) {
        ftInfo.setCode(currentCode, true);
      }
    } catch (e: any) {
      Message.error(`${e.message}`);
      console.warn(e);
    }
  };

  useEffect(() => {
    if (!watchFile || !localFileHandle) {
      return;
    }
    const [handle] = [localFileHandle];
    unmountFileTrack(handle);
    const uuid = scriptInfo?.uuid;
    const fileName = handle?.name;
    if (!uuid || !fileName) {
      return;
    }
    setupWatchFile(uuid, fileName, handle);
    return () => {
      unmountFileTrack(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoWatchFile]);

  // 检查是否有 uuid 或 file
  const searchParamUrl = searchParams.get("url");
  const hasValidSourceParam =
    !searchParamUrl && !!(searchParams.get("uuid") || searchParams.get("file") || skillInstallUuid);

  const urlHref = useMemo(() => {
    if (searchParamUrl) {
      try {
        const idx = location.search.indexOf("url=");
        const rawUrl = idx !== -1 ? location.search.slice(idx + 4) : searchParamUrl;
        const urlObject = new URL(rawUrl);
        if (urlObject.protocol && urlObject.hostname && urlObject.pathname) {
          return rawUrl;
        }
      } catch {
        // ignored
      }
    }
    return "";
  }, [searchParamUrl]);

  const [fetchingState, setFetchingState] = useState({
    loadingStatus: "",
    errorStatus: "",
  });

  const loadURLAsync = async (url: string) => {
    const fetchValidScript = async () => {
      const result = await fetchScriptBody(url, {
        onProgress: (info: { receivedLength: number }) => {
          setFetchingState((prev) => ({
            ...prev,
            loadingStatus: t("downloading_status_text", { bytes: formatBytes(info.receivedLength) }),
          }));
        },
      });
      if (result.code && result.metadata) {
        return { result, url } as const;
      }
      throw new Error(t("install_page_load_failed"));
    };

    try {
      const { result, url } = await fetchValidScript();
      const { code, metadata } = result;
      const isSkillScript = "skillScript" in result && result.skillScript === true;

      const uuid = uuidv4();
      const info = createScriptInfo(uuid, code, url, "user", metadata);
      if (isSkillScript) {
        info.skillScript = true;
      }
      const scriptData = [false, info];

      await cacheInstance.set(`${CACHE_KEY_SCRIPT_INFO}${uuid}`, scriptData);

      setSearchParams(new URLSearchParams(`?uuid=${uuid}`), { replace: true });
    } catch (err: any) {
      setFetchingState((prev) => ({
        ...prev,
        loadingStatus: "",
        errorStatus: `${err?.message || err}`,
      }));
    }
  };

  // 从 URL 加载 Skill（.cat.md）
  const loadSkillFromUrl = async (url: string) => {
    try {
      setFetchingState((prev) => ({
        ...prev,
        loadingStatus: t("install_page_please_wait"),
      }));
      const uuid = await agentClient.prepareSkillFromUrl(url);
      await initSkillFromCache(uuid);
    } catch (err: any) {
      setFetchingState((prev) => ({
        ...prev,
        loadingStatus: "",
        errorStatus: `${err?.message || err}`,
      }));
    }
  };

  const handleUrlChangeAndFetch = (targetUrlHref: string) => {
    // .cat.md URL → Skill 安装流程
    if (targetUrlHref.match(/\.cat\.md(\?|#|$)/i)) {
      loadSkillFromUrl(targetUrlHref);
      return;
    }
    setFetchingState((prev) => ({
      ...prev,
      loadingStatus: t("install_page_please_wait"),
    }));
    loadURLAsync(targetUrlHref);
  };

  // 有 url 的话下载内容
  useEffect(() => {
    if (urlHref) handleUrlChangeAndFetch(urlHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlHref]);

  return {
    // 状态
    enable,
    btnText,
    scriptCode,
    scriptInfo,
    upsertScript,
    diffCode,
    oldScriptVersion,
    isUpdate,
    localFileHandle,
    showBackgroundPrompt,
    setShowBackgroundPrompt,
    skillScriptMetadata,
    watchFile,
    metadataLive,
    permissions,
    descriptionParagraph,
    antifeatures,
    hasValidSourceParam,
    urlHref,
    fetchingState,
    // 事件处理
    handleInstallBasic,
    handleInstallCloseAfterInstall,
    handleInstallNoMoreUpdates,
    handleStatusChange,
    handleCloseBasic,
    handleCloseNoMoreUpdates,
    setWatchFileClick,
    // Skill 安装
    skillPreview,
    skillInstallUuid,
    handleSkillInstall,
    handleSkillCancel,
    // i18n
    t,
  };
}

export type InstallData = ReturnType<typeof useInstallData>;
