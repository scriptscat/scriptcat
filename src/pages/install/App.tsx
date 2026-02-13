import {
  Button,
  Dropdown,
  Message,
  Menu,
  Modal,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Popover,
} from "@arco-design/web-react";
import { IconDown } from "@arco-design/web-react/icon";
import { uuidv4 } from "@App/pkg/utils/uuid";
import CodeEditor from "../components/CodeEditor";
import { useEffect, useMemo, useState } from "react";
import type { SCMetadata, Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import type { Subscribe } from "@App/app/repo/subscribe";
import { i18nDescription, i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { createScriptInfo, type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import { parseMetadata, prepareScriptByCode, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { scriptClient, subscribeClient } from "../store/features/script";
import { type FTInfo, startFileTrack, unmountFileTrack } from "@App/pkg/utils/file-tracker";
import { cleanupOldHandles, loadHandle, saveHandle } from "@App/pkg/utils/filehandle-db";
import { dayFormat } from "@App/pkg/utils/day_format";
import { intervalExecution, timeoutExecution } from "@App/pkg/utils/timer";
import { useSearchParams } from "react-router-dom";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";
import { cacheInstance } from "@App/app/cache";
import { formatBytes } from "@App/pkg/utils/utils";
import { ScriptIcons } from "../options/routes/utils";
import { bytesDecode, detectEncoding } from "@App/pkg/utils/encoding";
import { toEncodedURL, prettyUrl } from "@App/pkg/utils/url-utils";

const backgroundPromptShownKey = "background_prompt_shown";

type ScriptOrSubscribe = Script | Subscribe;

// Types
interface PermissionItem {
  label: string;
  color?: string;
  value: string[];
}

type Permission = PermissionItem[];

const closeWindow = (shouldGoBack: boolean) => {
  if (shouldGoBack) {
    history.go(-1);
  } else {
    window.close();
  }
};

const getCandidateUrls = (targetUrlHref: string) => {
  const encodedUrl = toEncodedURL(targetUrlHref);
  const inputU = new URL(encodedUrl);
  const extraCandidateUrls = new Set<string>();
  extraCandidateUrls.add(inputU.href);

  const hostname = inputU.hostname;
  // 兼容 .greasyfork.org, cn-greasyfork.org
  const hostText = `.${hostname}`.replace(/\W/g, ".");
  const isGreasyFork = hostText.endsWith(".greasyfork.org");
  const isSleazyFork = hostText.endsWith(".sleazyfork.org");

  if (isGreasyFork || isSleazyFork) {
    // example:
    // CASE 1
    // raw 'https://update.greasyfork.org/scripts/550295/100%解锁CSDN文库vip文章阅读限制.user.js'
    // encoded 'https://update.greasyfork.org/scripts/550295/100%25%E8%A7%A3%E9%94%81CSDN%E6%96%87%E5%BA%93vip%E6%96%87%E7%AB%A0%E9%98%85%E8%AF%BB%E9%99%90%E5%88%B6.user.js'
    // correct 'https://update.greasyfork.org/scripts/550295/100%25%E8%A7%A3%E9%94%81CSDN%E6%96%87%E5%BA%93vip%E6%96%87%E7%AB%A0%E9%98%85%E8%AF%BB%E9%99%90%E5%88%B6.user.js'
    // CASE 2
    // raw 'https://update.greasyfork.org/scripts/519037/Nexus No Wait ++.user.js'
    // encoded 'https://update.greasyfork.org/scripts/519037/Nexus%20No%20Wait%20++.user.js'
    // correct 'https://update.greasyfork.org/scripts/519037/Nexus%20No%20Wait%20%2B%2B.user.js'
    try {
      const encodedPathname = inputU.pathname;
      const lastSlashIndex = encodedPathname.lastIndexOf("/");
      const basePath = encodedPathname.substring(0, lastSlashIndex);
      const fileName = encodedPathname.substring(lastSlashIndex + 1);
      const reEncodedFileName = encodeURIComponent(decodeURI(fileName));
      if (reEncodedFileName !== fileName) {
        const reEncodedPathName = `${basePath}/${reEncodedFileName}`;
        const reEncodedUrl = `${inputU.origin}${reEncodedPathName}${inputU.search}${inputU.hash}`;
        extraCandidateUrls.add(reEncodedUrl);
      }
    } catch (e) {
      // can skip if it cannot be converted using decodeURI
      console.warn(e); // just a warning for debug purpose.
    }
  }

  return [...extraCandidateUrls];
};

const fetchScriptBody = async (url: string, { onProgress }: { [key: string]: any }) => {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`Invalid url: ${url}`);
  }
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      Accept: "text/javascript,application/javascript,text/plain,application/octet-stream,application/force-download",
      // 参考：加权 Accept-Encoding 值说明
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Encoding#weighted_accept-encoding_values
      "Accept-Encoding": "br;q=1.0, gzip;q=0.8, *;q=0.1",
      Origin: origin,
    },
    referrer: `${origin}/`,
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  if (!response.body || !response.headers) {
    throw new Error("No response body or headers");
  }
  if (response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Response is text/html, not a valid UserScript");
  }

  const reader = response.body.getReader();

  // 读取数据
  let receivedLength = 0; // 当前已接收的长度
  const chunks = []; // 已接收的二进制分片数组（用于组装正文）
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedLength += value.length;
    onProgress?.({ receivedLength });
  }

  // 合并分片（chunks）
  const chunksAll = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    chunksAll.set(chunk, position);
    position += chunk.length;
  }

  // 检测编码：优先使用 Content-Type，回退到 chardet（仅检测前16KB）
  const contentType = response.headers.get("content-type");
  const encode = detectEncoding(chunksAll, contentType);

  // 使用检测到的 charset 解码
  let code;
  try {
    code = bytesDecode(encode, chunksAll);
  } catch (e: any) {
    console.warn(`Failed to decode response with charset ${encode}: ${e.message}`);
    // 回退到 UTF-8
    code = new TextDecoder("utf-8").decode(chunksAll);
  }

  const metadata = parseMetadata(code);
  if (!metadata) {
    throw new Error("parse script info failed");
  }

  return { code, metadata };
};

const cleanupStaleInstallInfo = (scriptUuid: string) => {
  // 页面打开时不清除当前uuid，每30秒更新一次记录
  const updateKeepAlive = () => {
    cacheInstance.tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
      val = val || {};
      val[scriptUuid] = Date.now();
      tx.set(val);
    });
  };
  updateKeepAlive();
  setInterval(updateKeepAlive, 30_000);

  // 页面打开后清除旧记录
  const delay = Math.floor(5000 * Math.random()) + 10000; // 使用随机时间避免浏览器重启时大量Tabs同时执行清除
  timeoutExecution(
    `${componentInstanceId}cleanupStaleInstallInfo`,
    () => {
      cacheInstance
        .tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
          const now = Date.now();
          const activeKeepKeys = new Set<string>();
          const updatedRegistry: Record<string, number> = {};
          for (const [k, ts] of Object.entries(val ?? {})) {
            if (ts > 0 && now - ts < 60_000) {
              activeKeepKeys.add(`${CACHE_KEY_SCRIPT_INFO}${k}`);
              updatedRegistry[k] = ts;
            }
          }
          tx.set(updatedRegistry);
          return activeKeepKeys;
        })
        .then(async (keeps) => {
          const allCacheKeys = await cacheInstance.list();
          const keysToPurge = allCacheKeys.filter((key) => key.startsWith(CACHE_KEY_SCRIPT_INFO) && !keeps.has(key));
          if (keysToPurge.length) {
            // 清理缓存
            cacheInstance.dels(keysToPurge);
          }
        });
    },
    delay
  );
};

const componentInstanceId = `(cid_${Math.random()})`;

function App() {
  const [isScriptEnabled, setIsScriptEnabled] = useState<boolean>(false);
  const [installButtonText, setInstallButtonText] = useState<string>("");
  const [currentScriptCode, setCurrentScriptCode] = useState<string>("");
  const [scriptInstallConfig, setScriptInstallConfig] = useState<ScriptInfo>();
  const [pendingScript, setPendingScript] = useState<ScriptOrSubscribe | undefined>(undefined);
  const [diffBaseCode, setDiffBaseCode] = useState<string>();
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [isUpdateMode, setIsUpdateMode] = useState<boolean>(false);
  const [localFileHandle, setLocalFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [showBackgroundPrompt, setShowBackgroundPrompt] = useState<boolean>(false);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  const [shouldNavigateBack, setShouldNavigateBack] = useState<boolean>(false);

  const installOrUpdateScript = async (newScript: Script, code: string) => {
    if (newScript.ignoreVersion) newScript.ignoreVersion = "";
    await scriptClient.install({ script: newScript, code });
    const metadata = newScript.metadata;
    setScriptInstallConfig((prev) => (prev ? { ...prev, code, metadata } : prev));
    const scriptVersion = metadata.version?.[0];
    const versionStr = typeof scriptVersion === "string" ? scriptVersion : "N/A";
    setInstalledVersion(versionStr);
    setPendingScript(newScript);
    setDiffBaseCode(code);
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

  const initializeInstallation = async () => {
    try {
      const uuid = searchParams.get("uuid");
      const fid = searchParams.get("file");
      let installInfo: ScriptInfo | undefined;
      let isKnownUpdate: boolean = false;

      // 如果没有 uuid 和 file，跳过初始化逻辑
      if (!uuid && !fid) {
        return;
      }

      if (window.history.length > 1) {
        setShouldNavigateBack(true);
      }
      setIsPageLoaded(true);

      let paramOptions = {};
      if (uuid) {
        const cachedData = await scriptClient.getInstallInfo(uuid);
        cleanupStaleInstallInfo(uuid);
        if (cachedData?.[0]) isKnownUpdate = true;
        installInfo = cachedData?.[1] || undefined;
        paramOptions = cachedData?.[2] || {};
        if (!installInfo) {
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
        // 处理成info对象
        setLocalFileHandle((prev) => {
          if (prev instanceof FileSystemFileHandle) unmountFileTrack(prev);
          return fileHandle!;
        });

        // 刷新 timestamp, 使 10s~15s 后不会被立即清掉
        // 每五分钟刷新一次db记录的timestamp，使开启中的安装页面的fileHandle不会被刷掉
        const key = `${componentInstanceId}liveFileHandle`;
        intervalExecution(key, () => saveHandle(fid, fileHandle), 5 * 60 * 1000, true);

        const code = await file.text();
        const metadata = parseMetadata(code);
        if (!metadata) {
          throw new Error("parse script info failed");
        }
        installInfo = createScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, "user", metadata);
      }

      let preparationResult:
        | { script: Script; oldScript?: Script; oldScriptCode?: string }
        | { subscribe: Subscribe; oldSubscribe?: Subscribe };
      let finalActionObject: Script | Subscribe;

      const { code, url } = installInfo;
      let oldVersionStr: string | undefined = undefined;
      let baseDiffCode: string | undefined = undefined;
      if (installInfo.userSubscribe) {
        preparationResult = await prepareSubscribeByCode(code, url);
        finalActionObject = preparationResult.subscribe;
        if (preparationResult.oldSubscribe) {
          const oldSubscribeVersion = preparationResult.oldSubscribe.metadata.version?.[0];
          oldVersionStr = typeof oldSubscribeVersion === "string" ? oldSubscribeVersion : "N/A";
        }
        baseDiffCode = preparationResult.oldSubscribe?.code;
      } else {
        const knownUUID = isKnownUpdate ? installInfo.uuid : undefined;
        preparationResult = await prepareScriptByCode(code, url, knownUUID, false, undefined, paramOptions);
        finalActionObject = preparationResult.script;
        if (preparationResult.oldScript) {
          const oldScriptVersion = preparationResult.oldScript.metadata.version?.[0];
          oldVersionStr = typeof oldScriptVersion === "string" ? oldScriptVersion : "N/A";
        }
        baseDiffCode = preparationResult.oldScriptCode;
      }
      setCurrentScriptCode(code);
      setDiffBaseCode(baseDiffCode);
      setInstalledVersion(typeof oldVersionStr === "string" ? oldVersionStr : null);
      setIsUpdateMode(typeof oldVersionStr === "string");
      setScriptInstallConfig(installInfo);
      setPendingScript(finalActionObject);

      // 检查是否需要显示后台运行提示
      if (!installInfo.userSubscribe) {
        setShowBackgroundPrompt(await checkBackgroundPrompt(finalActionObject as Script));
      }
    } catch (e: any) {
      Message.error(`${t("script_info_load_failed")} ${e?.message ?? e}`);
    } finally {
      // fileHandle 保留处理方式（暂定）：
      // fileHandle 会保留一段足够时间，避免用户重新刷画面，重启浏览器等操作后，安装页变得空白一片。
      // 处理会在所有Tab都载入后（不包含睡眠Tab）进行，因此延迟 10s~15s 让处理有足够时间。
      // 安装页面关掉后15分钟为不保留状态，会在安装画面再次打开时（其他脚本安装），进行清除。
      const randomDelay = Math.floor(5000 * Math.random()) + 10000; // 使用乱数时间避免浏览器重启时大量Tabs同时执行DB清除
      timeoutExecution(`${componentInstanceId}cleanupFileHandle`, cleanupOldHandles, randomDelay);
    }
  };

  // 有 file 或 uuid 时加载安装画面
  useEffect(() => {
    !isPageLoaded && initializeInstallation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("uuid"), searchParams.get("file"), isPageLoaded]);

  const [isFileWatchingEnabled, setIsFileWatchingEnabled] = useState(false);
  const liveMetadata = useMemo(() => (scriptInstallConfig?.metadata || {}) as SCMetadata, [scriptInstallConfig]);

  const scriptPermissions = useMemo(() => {
    const permissions: Permission = [];

    if (!scriptInstallConfig) return permissions;

    if (scriptInstallConfig.userSubscribe) {
      permissions.push({
        label: t("subscribe_install_label"),
        color: "#ff0000",
        value: liveMetadata.scripturl!,
      });
    }

    if (liveMetadata.match) {
      permissions.push({ label: t("script_runs_in"), value: liveMetadata.match });
    }

    if (liveMetadata.connect) {
      permissions.push({
        label: t("script_has_full_access_to"),
        color: "#F9925A",
        value: liveMetadata.connect,
      });
    }

    if (liveMetadata.require) {
      permissions.push({ label: t("script_requires"), value: liveMetadata.require });
    }

    return permissions;
  }, [scriptInstallConfig, liveMetadata, t]);

  const descriptionParagraphs = useMemo(() => {
    const elements: JSX.Element[] = [];

    if (!scriptInstallConfig) return elements;

    const hasCookieGrant = liveMetadata.grant?.some((val) => val === "GM_cookie");
    if (hasCookieGrant) {
      elements.push(
        <Typography.Text type="error" key="cookie">
          {t("cookie_warning")}
        </Typography.Text>
      );
    }

    if (liveMetadata.crontab) {
      elements.push(<Typography.Text key="crontab">{t("scheduled_script_description_title")}</Typography.Text>);
      elements.push(
        <div key="cronta-nexttime" className="tw-flex tw-flex-row tw-flex-wrap tw-gap-x-2">
          <Typography.Text>{t("scheduled_script_description_description_expr")}</Typography.Text>
          <Typography.Text code>{liveMetadata.crontab[0]}</Typography.Text>
          <Typography.Text>{t("scheduled_script_description_description_next")}</Typography.Text>
          <Typography.Text code>{nextTimeDisplay(liveMetadata.crontab[0])}</Typography.Text>
        </div>
      );
    } else if (liveMetadata.background) {
      elements.push(<Typography.Text key="background">{t("background_script_description")}</Typography.Text>);
    }

    return elements;
  }, [scriptInstallConfig, liveMetadata, t]);

  const antifeatureRegistry: { [key: string]: { color: string; title: string; description: string } } = {
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
    if (scriptInstallConfig?.userSubscribe) {
      setInstallButtonText(isUpdateMode ? t("update_subscribe")! : t("install_subscribe"));
    } else {
      setInstallButtonText(isUpdateMode ? t("update_script")! : t("install_script"));
    }
    if (pendingScript) {
      document.title = `${!isUpdateMode ? t("install_script") : t("update_script")} - ${i18nName(pendingScript!)} - ScriptCat`;
    }
  }, [isUpdateMode, scriptInstallConfig, pendingScript, t]);

  // 设置脚本状态
  useEffect(() => {
    if (pendingScript) {
      setIsScriptEnabled(pendingScript.status === SCRIPT_STATUS_ENABLE);
    }
  }, [pendingScript]);

  // 检查是否需要显示后台运行提示
  const checkBackgroundPrompt = async (script: Script) => {
    // 只有后台脚本或定时脚本才提示
    if (!script.metadata.background && !script.metadata.crontab) {
      return false;
    }

    // 检查是否首次安装或更新
    const hasShown = localStorage.getItem(backgroundPromptShownKey);

    if (hasShown !== "true") {
      // 检查是否已经有后台权限
      if (!(await chrome.permissions.contains({ permissions: ["background"] }))) {
        return true;
      }
    }
    return false;
  };

  const executeInstallation = async (options: { closeAfterInstall?: boolean; noMoreUpdates?: boolean } = {}) => {
    if (!pendingScript) {
      Message.error(t("script_info_load_failed")!);
      return;
    }

    const { closeAfterInstall: shouldClose = true, noMoreUpdates: disableUpdates = false } = options;

    try {
      if (scriptInstallConfig?.userSubscribe) {
        await subscribeClient.install(pendingScript as Subscribe);
        Message.success(t("subscribe_success")!);
        setInstallButtonText(t("subscribe_success")!);
      } else {
        // 如果选择不再检查更新，可以在这里设置脚本的更新配置
        if (disableUpdates && pendingScript) {
          // 这里可以设置脚本禁用自动更新的逻辑
          (pendingScript as Script).checkUpdate = false;
        }
        // 故意只安装或执行，不改变显示内容
        await scriptClient.install({ script: pendingScript as Script, code: currentScriptCode });
        if (isUpdateMode) {
          Message.success(t("install.update_success")!);
          setInstallButtonText(t("install.update_success")!);
        } else {
          // 如果选择不再检查更新，可以在这里设置脚本的更新配置
          if (disableUpdates && pendingScript) {
            // 这里可以设置脚本禁用自动更新的逻辑
            (pendingScript as Script).checkUpdate = false;
          }
          if ((pendingScript as Script).ignoreVersion) (pendingScript as Script).ignoreVersion = "";
          // 故意只安装或执行，不改变显示内容
          await scriptClient.install({ script: pendingScript as Script, code: currentScriptCode });
          if (isUpdateMode) {
            Message.success(t("install.update_success")!);
            setInstallButtonText(t("install.update_success")!);
          } else {
            Message.success(t("install_success")!);
            setInstallButtonText(t("install_success")!);
          }
        }
      }

      if (shouldClose) {
        setTimeout(() => {
          closeWindow(shouldNavigateBack);
        }, 500);
      }
    } catch (e) {
      const errorMessage = scriptInstallConfig?.userSubscribe ? t("subscribe_failed") : t("install_failed");
      Message.error(`${errorMessage}: ${e}`);
    }
  };

  const handlePageClose = (options?: { noMoreUpdates: boolean }) => {
    const { noMoreUpdates = false } = options || {};
    if (noMoreUpdates && scriptInstallConfig && !scriptInstallConfig.userSubscribe) {
      scriptClient.setCheckUpdateUrl(scriptInstallConfig.uuid, false);
    }
    closeWindow(shouldNavigateBack);
  };

  const {
    handleInstallBasic,
    handleInstallCloseAfterInstall,
    handleInstallNoMoreUpdates,
    handleStatusChange,
    handleCloseBasic,
    handleCloseNoMoreUpdates,
    toggleFileWatch,
  } = {
    handleInstallBasic: () => executeInstallation(),
    handleInstallCloseAfterInstall: () => executeInstallation({ closeAfterInstall: false }),
    handleInstallNoMoreUpdates: () => executeInstallation({ noMoreUpdates: true }),
    handleStatusChange: (checked: boolean) => {
      setPendingScript((script) => {
        if (!script) {
          return script;
        }
        script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        setIsScriptEnabled(checked);
        return script;
      });
    },
    handleCloseBasic: () => handlePageClose(),
    handleCloseNoMoreUpdates: () => handlePageClose({ noMoreUpdates: true }),
    toggleFileWatch: () => {
      setIsFileWatchingEnabled((prev) => !prev);
    },
  };

  const fileWatchMessageId = `id_${Math.random()}`;

  async function onWatchFileCodeChanged(this: FTInfo, code: string, hideInfo: boolean = false) {
    if (this.uuid !== scriptInstallConfig?.uuid) return;
    if (this.fileName !== localFileHandle?.name) return;
    setCurrentScriptCode(code);
    const uuid = (pendingScript as Script)?.uuid;
    if (!uuid) {
      throw new Error("uuid is undefined");
    }
    try {
      const newScript = await getUpdatedNewScript(uuid, code);
      await installOrUpdateScript(newScript, code);
    } catch (e: any) {
      Message.error({
        id: fileWatchMessageId,
        content: `${t("install_failed")}: ${e?.message ?? e}`,
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
    // e.g. NotFoundError
    setIsFileWatchingEnabled(false);
  }

  const watchFileStateIdentifier = `${isFileWatchingEnabled}.${scriptInstallConfig?.uuid}.${localFileHandle?.name}`;

  const setupWatchFile = async (uuid: string, fileName: string, handle: FileSystemFileHandle) => {
    try {
      // 如没有安装纪录，将进行安装。
      // 如已经安装，在FileSystemObserver检查更改前，先进行更新。
      const code = `${currentScriptCode}`;
      await installOrUpdateScript(pendingScript as Script, code);
      // setScriptCode(`${code}`);
      setDiffBaseCode(`${code}`);
      const ftInfo: FTInfo = {
        uuid,
        fileName,
        setCode: onWatchFileCodeChanged,
        onFileError: onWatchFileError,
      };
      // 进行监听
      startFileTrack(handle, ftInfo);
      // 先取最新代码
      const file = await handle.getFile();
      const currentCode = await file.text();
      // 如不一致，先更新
      if (currentCode !== code) {
        ftInfo.setCode(currentCode, true);
      }
    } catch (e: any) {
      Message.error(`${e.message}`);
      console.warn(e);
    }
  };

  const handleFileWatchChange = () => {
    if (!isFileWatchingEnabled || !localFileHandle) {
      return;
    }
    // 去除React特性
    const [handle] = [localFileHandle];
    unmountFileTrack(handle); // 避免重复追踪
    const uuid = scriptInstallConfig?.uuid;
    const fileName = handle?.name;
    if (!uuid || !fileName) {
      return;
    }
    setupWatchFile(uuid, fileName, handle);
    return () => {
      unmountFileTrack(handle);
    };
  };

  // 当 watch file 启用时，用于追踪本地 file 更新
  useEffect(() => {
    handleFileWatchChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchFileStateIdentifier]);

  // 检查是否有 uuid 或 file
  const hasValidSourceParam = !!(searchParams.get("uuid") || searchParams.get("file"));

  const targetUrlHref = useMemo(() => {
    if (!hasValidSourceParam) {
      /**
       * 逻辑说明：
       * 在 chrome.declarativeNetRequest 规则中，我们使用 `<,\1,>` 作为占位符引导 API 进行参数填充。
       * 由于不同浏览器版本或配置对 URL 参数的自动编码（Auto-encoding）策略不一致，
       * 我们通过检测该占位符的“被编码状态”来逆推浏览器采用了哪种编码方式。
       */
      let m;
      let url;
      try {
        // 场景 1：URL 完全未编码。直接匹配原始特征符号 "<", ">" 和 ","
        if ((m = /\burl=(<,.+,>)(&|$)/.exec(location.search)?.[1])) {
          url = m; // 未被编码，取原始值。
        }
        // 场景 2：URL 经过了部分编码（类似 encodeURI）。逗号 "," 未被编码，但尖括号被转义为 %3C, %3E
        else if ((m = /\burl=(%3C,.+,%3E)(&|$)/.exec(location.search)?.[1])) {
          url = decodeURI(m);
        }
        // 场景 3：URL 经过了完全编码（类似 encodeURIComponent）。逗号也被转义为 %2C
        else if ((m = /\burl=(%3C%2C.+%2C%3E)(&|$)/.exec(location.search)?.[1])) {
          url = decodeURIComponent(m);
        }
      } catch {
        // ignored
      }
      // 如果正则匹配/标准解码失败，回退到标准的 searchParams 获取方式 （浏览器会自行理解和解码不规范的编码）
      if (!url) url = searchParams.get("url") || ""; // fallback
      // 移除人工注入的特征锚点 <, ,>，提取真实的 URL 内容
      url = url.replace(/^<,(.+),>$/, "$1"); // 去掉 <, ,>
      if (url) {
        try {
          const urlObject = new URL(url);
          // 验证解析后的 URL 是否具备核心要素，确保安全性与合法性
          if (urlObject.protocol && urlObject.hostname && urlObject.pathname) {
            return url;
          }
        } catch {
          // ignored
        }
      }
    }
    return "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidSourceParam, searchParams.get("url")]);

  const [fetchingState, setFetchingState] = useState({
    loadingStatusText: "",
    errorStatusText: "",
  });

  const loadURLAsync = async (candidateUrls: string[]) => {
    // 1. 定义获取单个脚本的内部逻辑，负责处理进度条与单次错误
    const fetchValidScript = async () => {
      let firstError: unknown;
      for (const url of candidateUrls) {
        try {
          const result = await fetchScriptBody(url, {
            onProgress: (info: { receivedLength: number }) => {
              setFetchingState((prev) => ({
                ...prev,
                loadingStatusText: t("downloading_status_text", { bytes: formatBytes(info.receivedLength) }),
              }));
            },
          });
          if (result.code && result.metadata) {
            return { result, url }; // 找到有效的立即返回
          }
        } catch (e) {
          if (!firstError) firstError = e;
        }
      }
      // 如果循环结束都没成功，抛出第一个捕获到的错误或预设错误
      throw firstError || new Error(t("install_page_load_failed"));
    };

    try {
      // 2. 执行获取
      const { result, url } = await fetchValidScript();
      const { code, metadata } = result;

      // 3. 处理数据与缓存
      const uuid = uuidv4();
      const scriptData = [false, createScriptInfo(uuid, code, url, "user", metadata)];

      await cacheInstance.set(`${CACHE_KEY_SCRIPT_INFO}${uuid}`, scriptData);

      // 4. 更新导向
      setSearchParams(
        (prev) => {
          prev.delete("url");
          prev.set("uuid", uuid);
          return prev;
        },
        { replace: true }
      );
    } catch (err: any) {
      // 5. 统一错误处理
      setFetchingState((prev) => ({
        ...prev,
        loadingStatusText: "",
        errorStatusText: String(err?.message || err),
      }));
    }
  };

  const handleUrlChangeAndFetch = (targetUrlHref: string) => {
    setFetchingState((prev) => ({
      ...prev,
      loadingStatusText: t("install_page_please_wait"),
    }));
    const candidateUrls = getCandidateUrls(targetUrlHref);
    loadURLAsync(candidateUrls);
  };

  // 有 url 的话下载内容
  useEffect(() => {
    if (targetUrlHref) handleUrlChangeAndFetch(targetUrlHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUrlHref]);

  if (!hasValidSourceParam) {
    return targetUrlHref ? (
      <div className="tw-flex tw-justify-center tw-items-center tw-h-screen">
        <Space direction="vertical" align="center">
          {fetchingState.loadingStatusText && (
            <>
              <Typography.Title heading={3}>{t("install_page_loading")}</Typography.Title>
              <div className="downloading">
                <Typography.Text>{fetchingState.loadingStatusText}</Typography.Text>
                <div className="loader"></div>
              </div>
            </>
          )}
          {fetchingState.errorStatusText && (
            <>
              <Typography.Title heading={3}>{t("install_page_load_failed")}</Typography.Title>
              <div className="error-message">{fetchingState.errorStatusText}</div>
            </>
          )}
        </Space>
      </div>
    ) : (
      <div className="tw-flex tw-justify-center tw-items-center tw-h-screen">
        <Space direction="vertical" align="center">
          <Typography.Title heading={3}>{t("invalid_page")}</Typography.Title>
        </Space>
      </div>
    );
  }

  return (
    <div id="install-app-container" className="tw-flex tw-flex-col">
      {/* 后台运行提示对话框 */}
      <Modal
        title={t("enable_background.prompt_title")}
        visible={showBackgroundPrompt}
        onOk={async () => {
          try {
            const granted = await chrome.permissions.request({ permissions: ["background"] });
            if (granted) {
              Message.success(t("enable_background.title")!);
            } else {
              Message.info(t("enable_background.maybe_later")!);
            }
            setShowBackgroundPrompt(false);
            localStorage.setItem(backgroundPromptShownKey, "true");
          } catch (e) {
            console.error(e);
            Message.error(t("enable_background.enable_failed")!);
          }
        }}
        onCancel={() => {
          setShowBackgroundPrompt(false);
          localStorage.setItem(backgroundPromptShownKey, "true");
        }}
        okText={t("enable_background.enable_now")}
        cancelText={t("enable_background.maybe_later")}
        autoFocus={false}
        focusLock={true}
      >
        <Space direction="vertical" size="medium">
          <Typography.Text>
            {t("enable_background.prompt_description", {
              scriptType: pendingScript?.metadata?.background ? t("background_script") : t("scheduled_script"),
            })}
          </Typography.Text>
          <Typography.Text type="secondary">{t("enable_background.settings_hint")}</Typography.Text>
        </Space>
      </Modal>
      <div className="tw-flex tw-flex-row tw-gap-x-3 tw-pt-3 tw-pb-3">
        <div className="tw-grow-1 tw-shrink-1 tw-flex tw-flex-row tw-justify-start tw-items-center">
          {pendingScript?.metadata.icon && <ScriptIcons script={pendingScript} size={32} />}
          {pendingScript && (
            <Tooltip position="tl" content={i18nName(pendingScript)}>
              <Typography.Text bold className="tw-text-size-lg tw-truncate tw-w-0 tw-grow-1">
                {i18nName(pendingScript)}
              </Typography.Text>
            </Tooltip>
          )}
          <Tooltip
            content={scriptInstallConfig?.userSubscribe ? t("subscribe_source_tooltip") : t("script_status_tooltip")}
          >
            <Switch style={{ marginLeft: "8px" }} checked={isScriptEnabled} onChange={handleStatusChange} />
          </Tooltip>
        </div>
        <div className="tw-grow-0 tw-shrink-1 tw-flex tw-flex-row tw-flex-wrap tw-gap-x-2 tw-gap-y-1 tw-items-center">
          <div className="tw-flex tw-flex-row tw-flex-nowrap tw-gap-x-2">
            {installedVersion && (
              <Tooltip content={`${t("current_version")}: v${installedVersion}`}>
                <Tag bordered>{installedVersion}</Tag>
              </Tooltip>
            )}
            {typeof liveMetadata.version?.[0] === "string" && liveMetadata.version[0] !== installedVersion && (
              <Tooltip color="red" content={`${t("update_version")}: v${liveMetadata.version[0]}`}>
                <Tag bordered color="red">
                  {liveMetadata.version[0]}
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className="tw-shrink-1 tw-grow-1 tw-overflow-y-auto tw-pl-4 tw-pr-4 tw-gap-y-2 tw-flex tw-flex-col tw-mb-4 tw-h-0">
        <div className="tw-flex tw-flex-wrap tw-gap-x-3 tw-gap-y-2 tw-items-start">
          <div className="tw-flex tw-flex-col tw-shrink-1 tw-grow-1 tw-basis-8/12">
            <div className="tw-grow-1 tw-shrink-0">
              <div className="tw-flex tw-flex-wrap tw-gap-x-2 tw-gap-y-1 tag-container tw-float-right">
                {(liveMetadata.background || liveMetadata.crontab) && (
                  <Tooltip color="green" content={t("background_script_tag")}>
                    <Tag bordered color="green">
                      {t("background_script")}
                    </Tag>
                  </Tooltip>
                )}
                {liveMetadata.crontab && (
                  <Tooltip color="green" content={t("scheduled_script_tag")}>
                    <Tag bordered color="green">
                      {t("scheduled_script")}
                    </Tag>
                  </Tooltip>
                )}
                {liveMetadata.antifeature?.length &&
                  liveMetadata.antifeature.map((antifeature) => {
                    const item = antifeature.split(" ")[0];
                    return (
                      antifeatureRegistry[item] && (
                        <Tooltip
                          color={antifeatureRegistry[item].color}
                          content={antifeatureRegistry[item].description}
                        >
                          <Tag bordered color={antifeatureRegistry[item].color}>
                            {antifeatureRegistry[item].title}
                          </Tag>
                        </Tooltip>
                      )
                    );
                  })}
              </div>
              <div>
                <div>
                  <Typography.Text bold>{pendingScript && i18nDescription(pendingScript!)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text bold>{`${t("author")}: ${liveMetadata.author}`}</Typography.Text>
                </div>
                <div>
                  <Typography.Text
                    bold
                    style={{
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      maxHeight: "70px",
                      display: "block",
                      overflowY: "auto",
                    }}
                  >
                    {`${t("source")}: ${prettyUrl(scriptInstallConfig?.url)}`}
                  </Typography.Text>
                </div>
              </div>
            </div>
          </div>
          {descriptionParagraphs?.length ? (
            <div className="tw-flex tw-flex-col tw-shrink-0 tw-grow-1">
              <Typography>
                <Typography.Paragraph blockquote className="tw-pt-2 tw-pb-2">
                  {descriptionParagraphs}
                </Typography.Paragraph>
              </Typography>
            </div>
          ) : (
            <></>
          )}
          <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-x-4">
            {scriptPermissions.map((item) => (
              <div key={item.label} className="tw-flex tw-flex-col tw-gap-y-2">
                {item.value?.length > 0 ? (
                  <>
                    <Typography.Text bold color={item.color}>
                      {item.label}
                    </Typography.Text>
                    <div
                      style={{
                        maxHeight: "calc( 7.5 * 1.2rem )",
                        overflowY: "auto",
                        overflowX: "auto",
                        boxSizing: "border-box",
                      }}
                    >
                      {item.value.map((v) => (
                        <div key={v} className="permission-entry">
                          <Typography.Text style={{ wordBreak: "unset", color: item.color }}>{v}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <></>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="tw-flex tw-flex-row tw-flex-wrap tw-items-center tw-gap-2">
          <div className="tw-grow-1">
            <Typography.Text type="error">{t("install_from_legitimate_sources_warning")}</Typography.Text>
          </div>
          <div className="tw-grow-1 tw-shrink-0 tw-text-end">
            <Space>
              <Button.Group>
                <Button type="primary" size="small" onClick={handleInstallBasic} disabled={isFileWatchingEnabled}>
                  {installButtonText}
                </Button>
                <Dropdown
                  droplist={
                    <Menu>
                      <Menu.Item key="install-no-close" onClick={handleInstallCloseAfterInstall}>
                        {isUpdateMode ? t("update_script_no_close") : t("install_script_no_close")}
                      </Menu.Item>
                      {!scriptInstallConfig?.userSubscribe && (
                        <Menu.Item key="install-no-updates" onClick={handleInstallNoMoreUpdates}>
                          {isUpdateMode ? t("update_script_no_more_update") : t("install_script_no_more_update")}
                        </Menu.Item>
                      )}
                    </Menu>
                  }
                  position="bottom"
                  disabled={isFileWatchingEnabled}
                >
                  <Button type="primary" size="small" icon={<IconDown />} disabled={isFileWatchingEnabled} />
                </Dropdown>
              </Button.Group>
              {localFileHandle && (
                <Popover content={t("watch_file_description")}>
                  <Button type="secondary" size="small" onClick={toggleFileWatch}>
                    {isFileWatchingEnabled ? t("stop_watch_file") : t("watch_file")}
                  </Button>
                </Popover>
              )}
              {isUpdateMode ? (
                <Button.Group>
                  <Button type="primary" status="danger" size="small" onClick={handleCloseBasic}>
                    {t("close")}
                  </Button>
                  <Dropdown
                    droplist={
                      <Menu>
                        {!scriptInstallConfig?.userSubscribe && (
                          <Menu.Item key="install-no-updates" onClick={handleCloseNoMoreUpdates}>
                            {t("close_update_script_no_more_update")}
                          </Menu.Item>
                        )}
                      </Menu>
                    }
                    position="bottom"
                  >
                    <Button type="primary" status="danger" size="small" icon={<IconDown />} />
                  </Dropdown>
                </Button.Group>
              ) : (
                <Button type="primary" status="danger" size="small" onClick={handleCloseBasic}>
                  {t("close")}
                </Button>
              )}
            </Space>
          </div>
        </div>
        <div id="show-code-container">
          <CodeEditor
            id="show-code"
            className="sc-inset-0"
            code={currentScriptCode || undefined}
            diffCode={diffBaseCode === currentScriptCode ? "" : diffBaseCode || ""}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
