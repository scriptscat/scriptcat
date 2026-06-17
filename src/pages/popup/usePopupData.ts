import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ScriptMenu, ScriptMenuItem, TPopupScript } from "@App/app/service/service_worker/types";
import type { TDeleteScript, TEnableScript, TScriptRunStatus } from "@App/app/service/queue";
import { popupClient, scriptClient, runtimeClient, requestOpenBatchUpdatePage } from "../store/features/script";
import { subscribeMessage, systemConfig } from "../store/global";
import { SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";
import { ExtVersion, ExtServer } from "@App/app/const";
import { sanitizeHTML } from "@App/pkg/utils/sanitize";
import { getCurrentTab, openInCurrentTab } from "@App/pkg/utils/utils";
import { cacheInstance } from "@App/app/cache";
export { ExtVersion } from "@App/app/const";
export { VersionCompare, versionCompare } from "@App/pkg/utils/semver";

// ========== 辅助函数 ==========

/** 安全提取 URL 的 host（含端口） */
export function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export type ScriptProvider = "scriptcat" | "greasyfork" | "openuserjs";

/** 根据当前页面 URL 与脚本站点生成「获取更多脚本」的链接。无有效 host 时回退到站点首页。 */
export function getMoreScriptUrl(currentUrl: string, provider: ScriptProvider): string {
  let urlHost = "";
  if (currentUrl) {
    try {
      const url = new URL(currentUrl);
      // 仅 http(s) 页面才提取 host，扩展页/about: 等忽略
      if (url.hostname && url.protocol.startsWith("http")) {
        urlHost = url.hostname;
      }
    } catch {
      // 容错：URL 解析失败时按无 host 处理
    }
  }
  if (provider === "greasyfork") {
    // www.google.com -> google.com
    urlHost = /[^.]+\.[^.]+$/.exec(urlHost)?.[0] || urlHost;
  }
  switch (provider) {
    case "scriptcat":
      return urlHost
        ? `https://scriptcat.org/search?domain=${encodeURIComponent(urlHost)}`
        : "https://scriptcat.org/search";
    case "greasyfork":
      return urlHost
        ? `https://greasyfork.org/scripts/by-site/${encodeURI(urlHost)}`
        : "https://greasyfork.org/scripts/";
    case "openuserjs":
      return urlHost ? `https://openuserjs.org/?q=${encodeURIComponent(urlHost)}` : "https://openuserjs.org/";
  }
}

/** 按 groupKey 去重菜单项，过滤掉分隔线。popup 不区分二级/三级菜单，只取 groupKey 逗号前的部分 */
export function getVisibleMenuItems(menus: ScriptMenuItem[]): ScriptMenuItem[] {
  const seen = new Set<string>();
  return menus.filter((item) => {
    if (item.options?.mSeparator) return false;
    const topGroupKey = item.groupKey.split(",")[0];
    if (seen.has(topGroupKey)) return false;
    seen.add(topGroupKey);
    return true;
  });
}

/** 按名称搜索过滤 */
function filterScripts(list: ScriptMenu[], query: string): ScriptMenu[] {
  if (!query.trim()) return list;
  const lower = query.toLowerCase();
  return list.filter((s) => s.name.toLowerCase().includes(lower));
}

/** 排序：启用优先 → 菜单数量多者优先 → 执行次数多者优先 → 更新时间新者优先 */
const scriptListSorter = (a: ScriptMenu, b: ScriptMenu) =>
  (b.enable ? 1 : 0) - (a.enable ? 1 : 0) ||
  b.menus.length - a.menus.length ||
  b.runNum - a.runNum ||
  b.updatetime - a.updatetime;

const EXPAND_LIMIT = 5;

// ========== Hook ==========

export function usePopupData() {
  const [loading, setLoading] = useState(true);
  const [scriptList, setScriptList] = useState<ScriptMenu[]>([]);
  const [backScriptList, setBackScriptList] = useState<ScriptMenu[]>([]);
  const [isBlacklist, setIsBlacklist] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [currentTabId, setCurrentTabId] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState({ current: false, background: false });
  const [isEnableScript, setIsEnableScript] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkUpdate, setCheckUpdate] = useState<{ notice: string; version: string; isRead: boolean }>({
    notice: "",
    version: ExtVersion,
    isRead: false,
  });
  const [checkUpdateStatus, setCheckUpdateStatus] = useState(0); // 0=idle, 1=checking, 2=latest
  const [showAlert, setShowAlert] = useState(false);
  const [menuExpandNum, setMenuExpandNum] = useState(5);
  const [defaultScriptProvider, setDefaultScriptProvider] = useState<ScriptProvider>("scriptcat");

  // ref 保存最新值，避免 async 回调中的闭包过期
  const stateRef = useRef({ currentUrl, currentTabId });
  stateRef.current = { currentUrl, currentTabId };

  // 显示错误消息，3秒后自动清除
  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 3000);
  }, []);

  // 获取 popup 数据
  const fetchData = useCallback(async (tabId: number, url: string) => {
    try {
      const res = await popupClient.getPopupData({ tabId, url });
      res.scriptList.sort(scriptListSorter);
      setScriptList(res.scriptList);
      setBackScriptList(res.backScriptList);
      setIsBlacklist(res.isBlacklist);
    } catch (e) {
      console.error("Failed to fetch popup data:", e);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    (async () => {
      try {
        const [tab, enableScript, checkUpdateData, expandNum, provider] = await Promise.all([
          getCurrentTab(),
          systemConfig.getEnableScript(),
          systemConfig.getCheckUpdate({ sanitizeHTML }),
          systemConfig.getMenuExpandNum(),
          cacheInstance.get<ScriptProvider>("default_script_provider"),
        ]);
        setIsEnableScript(enableScript);
        setCheckUpdate(checkUpdateData);
        setMenuExpandNum(expandNum);
        if (provider) setDefaultScriptProvider(provider);
        if (tab?.id && tab.url) {
          setCurrentTabId(tab.id);
          setCurrentUrl(tab.url);
          await fetchData(tab.id, tab.url);
        }
      } catch (e) {
        console.error("Failed to get current tab:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchData]);

  // 实时订阅
  useEffect(() => {
    if (currentTabId < 0) return;

    const unsubs = [
      // 菜单注册变更 → 全量刷新
      subscribeMessage<TPopupScript>("popupMenuRecordUpdated", (data) => {
        if (data.tabId === currentTabId || data.tabId === -1) {
          fetchData(stateRef.current.currentTabId, stateRef.current.currentUrl);
        }
      }),
      // 脚本启用/禁用变更
      subscribeMessage<TEnableScript[]>("enableScripts", (data) => {
        if (!Array.isArray(data)) return;
        const map = new Map(data.map((d) => [d.uuid, d.enable]));
        const patch = (prev: ScriptMenu[]) =>
          prev.map((s) => (map.has(s.uuid) ? { ...s, enable: map.get(s.uuid)! } : s));
        setScriptList(patch);
        setBackScriptList(patch);
      }),
      // 脚本被删除
      subscribeMessage<TDeleteScript[]>("deleteScripts", (data) => {
        if (!Array.isArray(data)) return;
        const uuids = new Set(data.map((d) => d.uuid));
        setScriptList((prev) => prev.filter((s) => !uuids.has(s.uuid)));
        setBackScriptList((prev) => prev.filter((s) => !uuids.has(s.uuid)));
      }),
      // 后台脚本运行状态变更
      subscribeMessage<TScriptRunStatus>("scriptRunStatus", (data) => {
        setBackScriptList((prev) =>
          prev.map((s) =>
            s.uuid === data.uuid
              ? { ...s, runStatus: data.runStatus, runNum: data.runStatus === SCRIPT_RUN_STATUS_RUNNING ? 1 : 0 }
              : s
          )
        );
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [currentTabId, fetchData]);

  // 扩展版本更新检查
  useEffect(() => {
    if (checkUpdateStatus !== 1) return;
    Promise.all([
      fetch(`${ExtServer}api/v1/system/version?version=${ExtVersion}`)
        .then((resp) => resp.json())
        .catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]).then(([resp]: [{ data: { notice: string; version: string } } | null, unknown]) => {
      let newStatus = 0;
      if (resp?.data) {
        const notice = typeof resp.data.notice === "string" ? sanitizeHTML(resp.data.notice) : "";
        const { version } = resp.data;
        setCheckUpdate((prev) => {
          if (version === prev.version) {
            newStatus = 2;
            return prev;
          }
          const isRead = prev.notice !== notice ? false : prev.isRead;
          const newData = { version, notice, isRead };
          systemConfig.setCheckUpdate(newData);
          return newData;
        });
      }
      setCheckUpdateStatus(newStatus);
    });
  }, [checkUpdateStatus]);

  // ========== Action Handlers ==========

  const handleToggleScript = useCallback(
    async (uuid: string, enable: boolean) => {
      const patch = (prev: ScriptMenu[]) => prev.map((s) => (s.uuid === uuid ? { ...s, enable } : s));
      setScriptList(patch);
      setBackScriptList(patch);
      try {
        await scriptClient.enable(uuid, enable);
      } catch (e) {
        // 回滚
        const revert = (prev: ScriptMenu[]) => prev.map((s) => (s.uuid === uuid ? { ...s, enable: !enable } : s));
        setScriptList(revert);
        setBackScriptList(revert);
        showError(String(e));
      }
    },
    [showError]
  );

  const handleDeleteScript = useCallback(
    async (uuid: string) => {
      try {
        // 删除后由 deleteScripts 订阅消息驱动 UI 更新
        await scriptClient.deletes([uuid]);
      } catch (e) {
        showError(String(e));
      }
    },
    [showError]
  );

  const handleOpenEditor = useCallback(async (uuid: string) => {
    // 经由扩展 API 打开（而非 window.open / chrome.tabs.create 绝对 URL）：兼容 Edge Android（移动端打不开内部页，#686）
    await openInCurrentTab(`/src/options.html#/script/editor/${uuid}`);
    window.close();
  }, []);

  const handleOpenUserConfig = useCallback(async (uuid: string) => {
    await openInCurrentTab(`/src/options.html#/?userConfig=${uuid}`);
    window.close();
  }, []);

  const handleExcludeUrl = useCallback(async (uuid: string, isEffective: boolean) => {
    const host = extractHost(stateRef.current.currentUrl);
    if (!host) return;
    try {
      // isEffective=true → 排除（remove=false）; isEffective=false → 取消排除（remove=true）
      await scriptClient.excludeUrl(uuid, `*://${host}/*`, !isEffective);
      setScriptList((prev) => prev.map((s) => (s.uuid === uuid ? { ...s, isEffective: !isEffective } : s)));
    } catch (e) {
      console.error("Failed to toggle exclude:", e);
    }
  }, []);

  /** 调用方需从 script.menus 中按 groupKey 过滤出所有匹配项传入 */
  const handleMenuClick = useCallback(async (uuid: string, menus: ScriptMenuItem[], inputValue?: any) => {
    try {
      await popupClient.menuClick(uuid, menus, inputValue);
      if (menus[0]?.options?.autoClose !== false) {
        window.close();
      }
    } catch (e) {
      console.error("Failed to click menu:", e);
    }
  }, []);

  const handleRunScript = useCallback(async (uuid: string) => {
    try {
      await runtimeClient.runScript(uuid);
    } catch (e) {
      console.error("Failed to run script:", e);
    }
  }, []);

  const handleStopScript = useCallback(async (uuid: string) => {
    try {
      await runtimeClient.stopScript(uuid);
    } catch (e) {
      console.error("Failed to stop script:", e);
    }
  }, []);

  const handleCreateScript = useCallback(async () => {
    await chrome.storage.local.set({ activeTabUrl: { url: stateRef.current.currentUrl } });
    // 使用 openInCurrentTab 而非 window.open，避免 Edge Android 等移动端打开异常（#686）
    openInCurrentTab("/src/options.html#/script/editor?target=initial");
  }, []);

  const handleOpenSettings = useCallback(() => {
    openInCurrentTab("/src/options.html");
  }, []);

  // 「获取更多脚本」：记忆上次选择的脚本站点，父级点击时打开记忆的站点
  const handleGetMoreScript = useCallback(
    (provider?: ScriptProvider) => {
      const target = provider ?? defaultScriptProvider;
      if (provider && provider !== defaultScriptProvider) {
        cacheInstance.set<ScriptProvider>("default_script_provider", provider);
        setDefaultScriptProvider(provider);
      }
      window.open(getMoreScriptUrl(stateRef.current.currentUrl, target), "_blank");
    },
    [defaultScriptProvider]
  );

  const handleToggleEnableScript = useCallback((val: boolean) => {
    setIsEnableScript(val);
    systemConfig.setEnableScript(val);
  }, []);

  const handleNotificationClick = useCallback(() => {
    setShowAlert((prev) => !prev);
    setCheckUpdate((prev) => {
      if (prev.isRead) return prev;
      const updated = { ...prev, isRead: true };
      systemConfig.setCheckUpdate(updated);
      return updated;
    });
  }, []);

  const handleVersionClick = useCallback(() => {
    setCheckUpdateStatus((prev) => (prev === 1 ? prev : 1));
  }, []);

  const handleMenuCheckUpdate = useCallback(() => {
    requestOpenBatchUpdatePage(extractHost(stateRef.current.currentUrl));
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleToggleExpand = useCallback((section: "current" | "background") => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // ========== 派生数据 ==========

  const host = extractHost(currentUrl);
  const filteredScriptList = filterScripts(scriptList, searchQuery);
  const filteredBackScriptList = filterScripts(backScriptList, searchQuery);
  const totalScriptCount = scriptList.length + backScriptList.length;
  const showSearch = totalScriptCount > EXPAND_LIMIT;

  const displayScriptList = expandedSections.current ? filteredScriptList : filteredScriptList.slice(0, EXPAND_LIMIT);
  const remainingCurrentCount = filteredScriptList.length - displayScriptList.length;
  // 超过展示上限即可展开/收起：折叠时显示「显示更多」，展开时显示「收起」
  const canExpandCurrent = filteredScriptList.length > EXPAND_LIMIT;

  const displayBackScriptList = expandedSections.background
    ? filteredBackScriptList
    : filteredBackScriptList.slice(0, EXPAND_LIMIT);
  const remainingBackCount = filteredBackScriptList.length - displayBackScriptList.length;
  const canExpandBack = filteredBackScriptList.length > EXPAND_LIMIT;

  const backRunningCount = backScriptList.filter((s) => s.runStatus === SCRIPT_RUN_STATUS_RUNNING).length;
  const enabledScriptCount = scriptList.filter((s) => s.enable).length;
  const enabledBackScriptCount = backScriptList.filter((s) => s.enable).length;

  // 全量脚本（未经搜索过滤/分段截断）：用于 accessKey 快捷键注册，确保对所有脚本生效
  const allScripts = useMemo(() => [...scriptList, ...backScriptList], [scriptList, backScriptList]);

  return {
    loading,
    isBlacklist,
    host,
    scriptList: displayScriptList,
    backScriptList: displayBackScriptList,
    allScripts,
    fullScriptCount: filteredScriptList.length,
    fullBackScriptCount: filteredBackScriptList.length,
    remainingCurrentCount,
    remainingBackCount,
    canExpandCurrent,
    canExpandBack,
    isCurrentExpanded: expandedSections.current,
    isBackExpanded: expandedSections.background,
    totalScriptCount,
    backRunningCount,
    enabledScriptCount,
    enabledBackScriptCount,
    errorMessage,
    showSearch,
    searchQuery,
    handleToggleScript,
    handleDeleteScript,
    handleOpenEditor,
    handleOpenUserConfig,
    handleExcludeUrl,
    handleMenuClick,
    handleRunScript,
    handleStopScript,
    currentUrl,
    handleCreateScript,
    handleOpenSettings,
    handleToggleEnableScript,
    handleNotificationClick,
    handleVersionClick,
    handleMenuCheckUpdate,
    defaultScriptProvider,
    handleGetMoreScript,
    isEnableScript,
    checkUpdate,
    checkUpdateStatus,
    showAlert,
    menuExpandNum,
    handleSearch,
    handleToggleExpand,
  };
}
