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
import { prettyUrl } from "@App/pkg/utils/url-utils";

const backgroundPromptShownKey = "background_prompt_shown";

type ScriptOrSubscribe = Script | Subscribe;

// Types
interface PermissionItem {
  label: string;
  color?: string;
  value: string[];
}

type Permission = PermissionItem[];

const closeWindow = (doBackwards: boolean) => {
  if (doBackwards) {
    history.go(-1);
  } else {
    window.close();
  }
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
    referrer: origin + "/",
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

const cleanupStaleInstallInfo = (uuid: string) => {
  // 页面打开时不清除当前uuid，每30秒更新一次记录
  const f = () => {
    cacheInstance.tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
      val = val || {};
      val[uuid] = Date.now();
      tx.set(val);
    });
  };
  f();
  setInterval(f, 30_000);

  // 页面打开后清除旧记录
  const delay = Math.floor(5000 * Math.random()) + 10000; // 使用随机时间避免浏览器重启时大量Tabs同时执行清除
  timeoutExecution(
    `${cIdKey}cleanupStaleInstallInfo`,
    () => {
      cacheInstance
        .tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
          const now = Date.now();
          const keeps = new Set<string>();
          const out: Record<string, number> = {};
          for (const [k, ts] of Object.entries(val ?? {})) {
            if (ts > 0 && now - ts < 60_000) {
              keeps.add(`${CACHE_KEY_SCRIPT_INFO}${k}`);
              out[k] = ts;
            }
          }
          tx.set(out);
          return keeps;
        })
        .then(async (keeps) => {
          const list = await cacheInstance.list();
          const filtered = list.filter((key) => key.startsWith(CACHE_KEY_SCRIPT_INFO) && !keeps.has(key));
          if (filtered.length) {
            // 清理缓存
            cacheInstance.dels(filtered);
          }
        });
    },
    delay
  );
};

const cIdKey = `(cid_${Math.random()})`;

function App() {
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
        // 处理成info对象
        setLocalFileHandle((prev) => {
          if (prev instanceof FileSystemFileHandle) unmountFileTrack(prev);
          return fileHandle!;
        });

        // 刷新 timestamp, 使 10s~15s 后不会被立即清掉
        // 每五分钟刷新一次db记录的timestamp，使开启中的安装页面的fileHandle不会被刷掉
        intervalExecution(`${cIdKey}liveFileHandle`, () => saveHandle(fid, fileHandle), 5 * 60 * 1000, true);

        const code = await file.text();
        const metadata = parseMetadata(code);
        if (!metadata) {
          throw new Error("parse script info failed");
        }
        info = createScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, "user", metadata);
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
      // fileHandle 保留处理方式（暂定）：
      // fileHandle 会保留一段足够时间，避免用户重新刷画面，重启浏览器等操作后，安装页变得空白一片。
      // 处理会在所有Tab都载入后（不包含睡眠Tab）进行，因此延迟 10s~15s 让处理有足够时间。
      // 安装页面关掉后15分钟为不保留状态，会在安装画面再次打开时（其他脚本安装），进行清除。
      const delay = Math.floor(5000 * Math.random()) + 10000; // 使用乱数时间避免浏览器重启时大量Tabs同时执行DB清除
      timeoutExecution(`${cIdKey}cleanupFileHandle`, cleanupOldHandles, delay);
    }
  };

  useEffect(() => {
    !loaded && initAsync();
  }, [searchParams, loaded]);

  const [watchFile, setWatchFile] = useState(false);
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

    const isCookie = metadataLive.grant?.some((val) => val === "GM_cookie");
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
    if (scriptInfo?.userSubscribe) {
      setBtnText(isUpdate ? t("update_subscribe")! : t("install_subscribe"));
    } else {
      setBtnText(isUpdate ? t("update_script")! : t("install_script"));
    }
    if (upsertScript) {
      document.title = `${!isUpdate ? t("install_script") : t("update_script")} - ${i18nName(upsertScript!)} - ScriptCat`;
    }
  }, [isUpdate, scriptInfo, upsertScript, t]);

  // 设置脚本状态
  useEffect(() => {
    if (upsertScript) {
      setEnable(upsertScript.status === SCRIPT_STATUS_ENABLE);
    }
  }, [upsertScript]);

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
        // 如果选择不再检查更新，可以在这里设置脚本的更新配置
        if (disableUpdates && upsertScript) {
          // 这里可以设置脚本禁用自动更新的逻辑
          (upsertScript as Script).checkUpdate = false;
        }
        // 故意只安装或执行，不改变显示内容
        await scriptClient.install({ script: upsertScript as Script, code: scriptCode });
        if (isUpdate) {
          Message.success(t("install.update_success")!);
          setBtnText(t("install.update_success")!);
        } else {
          // 如果选择不再检查更新，可以在这里设置脚本的更新配置
          if (disableUpdates && upsertScript) {
            // 这里可以设置脚本禁用自动更新的逻辑
            (upsertScript as Script).checkUpdate = false;
          }
          if ((upsertScript as Script).ignoreVersion) (upsertScript as Script).ignoreVersion = "";
          // 故意只安装或执行，不改变显示内容
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

  const {
    handleInstallBasic,
    handleInstallCloseAfterInstall,
    handleInstallNoMoreUpdates,
    handleStatusChange,
    handleCloseBasic,
    handleCloseNoMoreUpdates,
    setWatchFileClick,
  } = {
    handleInstallBasic: () => handleInstall(),
    handleInstallCloseAfterInstall: () => handleInstall({ closeAfterInstall: false }),
    handleInstallNoMoreUpdates: () => handleInstall({ noMoreUpdates: true }),
    handleStatusChange: (checked: boolean) => {
      setUpsertScript((script) => {
        if (!script) {
          return script;
        }
        script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        setEnable(checked);
        return script;
      });
    },
    handleCloseBasic: () => handleClose(),
    handleCloseNoMoreUpdates: () => handleClose({ noMoreUpdates: true }),
    setWatchFileClick: () => {
      setWatchFile((prev) => !prev);
    },
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
    // e.g. NotFoundError
    setWatchFile(false);
  }

  const memoWatchFile = useMemo(() => {
    return `${watchFile}.${scriptInfo?.uuid}.${localFileHandle?.name}`;
  }, [watchFile, scriptInfo, localFileHandle]);

  const setupWatchFile = async (uuid: string, fileName: string, handle: FileSystemFileHandle) => {
    try {
      // 如没有安装纪录，将进行安装。
      // 如已经安装，在FileSystemObserver检查更改前，先进行更新。
      const code = `${scriptCode}`;
      await installOrUpdateScript(upsertScript as Script, code);
      // setScriptCode(`${code}`);
      setDiffCode(`${code}`);
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

  useEffect(() => {
    if (!watchFile || !localFileHandle) {
      return;
    }
    // 去除React特性
    const [handle] = [localFileHandle];
    unmountFileTrack(handle); // 避免重复追踪
    const uuid = scriptInfo?.uuid;
    const fileName = handle?.name;
    if (!uuid || !fileName) {
      return;
    }
    setupWatchFile(uuid, fileName, handle);
    return () => {
      unmountFileTrack(handle);
    };
  }, [memoWatchFile]);

  // 检查是否有 uuid 或 file
  const searchParamUrl = searchParams.get("url");
  const hasValidSourceParam = !searchParamUrl && !!(searchParams.get("uuid") || searchParams.get("file"));

  const urlHref = useMemo(() => {
    if (!hasValidSourceParam) {
      let rawUrl;
      try {
        // 取url=之后的所有内容
        rawUrl = location.search.match(/\?url=([^&]+)/)?.[1] || "";
        if (rawUrl) {
          const urlObject = new URL(rawUrl);
          // 验证解析后的 URL 是否具备核心要素，确保安全性与合法性
          if (urlObject.protocol && urlObject.hostname && urlObject.pathname) {
            return rawUrl;
          }
        }
      } catch {
        // ignored
      }
    }
    return "";
  }, [hasValidSourceParam]);

  const [fetchingState, setFetchingState] = useState({
    loadingStatus: "",
    errorStatus: "",
  });

  const loadURLAsync = async (url: string) => {
    // 1. 定义获取单个脚本的内部逻辑，负责处理进度条与单次错误
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
        return { result, url } as const; // 找到有效的立即返回
      }
      throw new Error(t("install_page_load_failed"));
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
      setSearchParams(new URLSearchParams(`?uuid=${uuid}`), { replace: true });
    } catch (err: any) {
      // 5. 统一错误处理
      setFetchingState((prev) => ({
        ...prev,
        loadingStatus: "",
        errorStatus: `${err?.message || err}`,
      }));
    }
  };

  const handleUrlChangeAndFetch = (targetUrlHref: string) => {
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

  if (!hasValidSourceParam) {
    return urlHref ? (
      <div className="tw-flex tw-justify-center tw-items-center tw-h-screen">
        <Space direction="vertical" align="center">
          {fetchingState.loadingStatus && (
            <>
              <Typography.Title heading={3}>{t("install_page_loading")}</Typography.Title>
              <div className="downloading">
                <Typography.Text>{fetchingState.loadingStatus}</Typography.Text>
                <div className="loader"></div>
              </div>
            </>
          )}
          {fetchingState.errorStatus && (
            <>
              <Typography.Title heading={3}>{t("install_page_load_failed")}</Typography.Title>
              <div className="error-message">{fetchingState.errorStatus}</div>
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
              scriptType: upsertScript?.metadata?.background ? t("background_script") : t("scheduled_script"),
            })}
          </Typography.Text>
          <Typography.Text type="secondary">{t("enable_background.settings_hint")}</Typography.Text>
        </Space>
      </Modal>
      <div className="tw-flex tw-flex-row tw-gap-x-3 tw-pt-3 tw-pb-3">
        <div className="tw-grow-1 tw-shrink-1 tw-flex tw-flex-row tw-justify-start tw-items-center">
          {upsertScript?.metadata.icon && <ScriptIcons script={upsertScript} size={32} />}
          {upsertScript && (
            <Tooltip position="tl" content={i18nName(upsertScript)}>
              <Typography.Text bold className="tw-text-size-lg tw-truncate tw-w-0 tw-grow-1">
                {i18nName(upsertScript)}
              </Typography.Text>
            </Tooltip>
          )}
          <Tooltip content={scriptInfo?.userSubscribe ? t("subscribe_source_tooltip") : t("script_status_tooltip")}>
            <Switch style={{ marginLeft: "8px" }} checked={enable} onChange={handleStatusChange} />
          </Tooltip>
        </div>
        <div className="tw-grow-0 tw-shrink-1 tw-flex tw-flex-row tw-flex-wrap tw-gap-x-2 tw-gap-y-1 tw-items-center">
          <div className="tw-flex tw-flex-row tw-flex-nowrap tw-gap-x-2">
            {oldScriptVersion && (
              <Tooltip content={`${t("current_version")}: v${oldScriptVersion}`}>
                <Tag bordered>{oldScriptVersion}</Tag>
              </Tooltip>
            )}
            {typeof metadataLive.version?.[0] === "string" && metadataLive.version[0] !== oldScriptVersion && (
              <Tooltip color="red" content={`${t("update_version")}: v${metadataLive.version[0]}`}>
                <Tag bordered color="red">
                  {metadataLive.version[0]}
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
                {(metadataLive.background || metadataLive.crontab) && (
                  <Tooltip color="green" content={t("background_script_tag")}>
                    <Tag bordered color="green">
                      {t("background_script")}
                    </Tag>
                  </Tooltip>
                )}
                {metadataLive.crontab && (
                  <Tooltip color="green" content={t("scheduled_script_tag")}>
                    <Tag bordered color="green">
                      {t("scheduled_script")}
                    </Tag>
                  </Tooltip>
                )}
                {metadataLive.antifeature?.length &&
                  metadataLive.antifeature.map((antifeature) => {
                    const item = antifeature.split(" ")[0];
                    return (
                      antifeatures[item] && (
                        <Tooltip color={antifeatures[item].color} content={antifeatures[item].description}>
                          <Tag bordered color={antifeatures[item].color}>
                            {antifeatures[item].title}
                          </Tag>
                        </Tooltip>
                      )
                    );
                  })}
              </div>
              <div>
                <div>
                  <Typography.Text bold>{upsertScript && i18nDescription(upsertScript!)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text bold>{`${t("author")}: ${metadataLive.author}`}</Typography.Text>
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
                    {`${t("source")}: ${prettyUrl(scriptInfo?.url)}`}
                  </Typography.Text>
                </div>
              </div>
            </div>
          </div>
          {descriptionParagraph?.length ? (
            <div className="tw-flex tw-flex-col tw-shrink-0 tw-grow-1">
              <Typography>
                <Typography.Paragraph blockquote className="tw-pt-2 tw-pb-2">
                  {descriptionParagraph}
                </Typography.Paragraph>
              </Typography>
            </div>
          ) : (
            <></>
          )}
          <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-x-4">
            {permissions.map((item) => (
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
                <Button type="primary" size="small" onClick={handleInstallBasic} disabled={watchFile}>
                  {btnText}
                </Button>
                <Dropdown
                  droplist={
                    <Menu>
                      <Menu.Item key="install-no-close" onClick={handleInstallCloseAfterInstall}>
                        {isUpdate ? t("update_script_no_close") : t("install_script_no_close")}
                      </Menu.Item>
                      {!scriptInfo?.userSubscribe && (
                        <Menu.Item key="install-no-updates" onClick={handleInstallNoMoreUpdates}>
                          {isUpdate ? t("update_script_no_more_update") : t("install_script_no_more_update")}
                        </Menu.Item>
                      )}
                    </Menu>
                  }
                  position="bottom"
                  disabled={watchFile}
                >
                  <Button type="primary" size="small" icon={<IconDown />} disabled={watchFile} />
                </Dropdown>
              </Button.Group>
              {localFileHandle && (
                <Popover content={t("watch_file_description")}>
                  <Button type="secondary" size="small" onClick={setWatchFileClick}>
                    {watchFile ? t("stop_watch_file") : t("watch_file")}
                  </Button>
                </Popover>
              )}
              {isUpdate ? (
                <Button.Group>
                  <Button type="primary" status="danger" size="small" onClick={handleCloseBasic}>
                    {t("close")}
                  </Button>
                  <Dropdown
                    droplist={
                      <Menu>
                        {!scriptInfo?.userSubscribe && (
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
            code={scriptCode || undefined}
            diffCode={diffCode === scriptCode ? "" : diffCode || ""}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
