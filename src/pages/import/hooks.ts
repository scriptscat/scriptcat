import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_DISABLE, ScriptDAO } from "@App/app/repo/scripts";
import type { ScriptData, SubscribeData } from "@App/pkg/backup/struct";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_IMPORT_FILE } from "@App/app/cache_key";
import { loadAsyncJSZip } from "@App/pkg/utils/jszip-x";
import { parseBackupZipFile } from "@App/pkg/backup/utils";
import { prepareScriptByCode, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { encodeRValue, type TKeyValuePair } from "@App/pkg/utils/message_value";
import { scriptClient, synchronizeClient, valueClient, subscribeClient } from "@App/pages/store/features/script";
import {
  deriveSelfMetadata,
  hasResources,
  importableScriptIds,
  importableSubscribeIds,
  sortByName,
  summarize,
  toScriptImportItem,
  toSubscribeImportItem,
  type PreparedSubscribe,
} from "./logic";
import type { ImportItemStatus, ImportPhase, ImportView } from "./components";

/** 解析脚本启用态(对照 v1.4-agent:item.enabled / options.settings.enabled / background|crontab 推断) */
function resolveEnabled(item: ScriptData, script: Script): boolean {
  if (item.enabled === false) return false;
  const settingsEnabled = item.options?.settings.enabled;
  if (typeof settingsEnabled === "boolean") return settingsEnabled;
  return !(script.metadata.background || script.metadata.crontab);
}

/** 备份数据导入页面的数据与交互逻辑 */
export function useImport(): ImportView {
  const [phase, setPhase] = useState<ImportPhase>("loading");
  const [filename, setFilename] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // 已 prepare 的脚本/订阅(可变源:启用开关改 script.status)
  const [scriptData, setScriptData] = useState<ScriptData[]>([]);
  const [subData, setSubData] = useState<PreparedSubscribe[]>([]);
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(() => new Set());
  const [selectedSubscribes, setSelectedSubscribes] = useState<Set<string>>(() => new Set());
  const [importStatus, setImportStatus] = useState<Record<string, ImportItemStatus>>({});
  // 导入后各脚本导入失败的资源名(uuid → 资源名列表),用于结果页逐项回显
  const [resourceErrors, setResourceErrors] = useState<Record<string, string[]>>({});
  // 覆盖模式:导入前删除所有本地脚本(#841)
  const [overwriteLocal, setOverwriteLocal] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [summaryState, setSummaryState] = useState({ scripts: 0, subscribes: 0, values: 0 });
  // 重试时自增以重跑装配 effect(对照 install useInstallData 的 reloadKey)
  const [reloadKey, setReloadKey] = useState(0);

  const loadingRef = useRef(false);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    void (async () => {
      try {
        const uuid = new URLSearchParams(location.search).get("uuid") || "";
        const cached = await cacheInstance.get<{ filename: string; url: string }>(CACHE_KEY_IMPORT_FILE + uuid);
        if (!cached) {
          setPhase("invalid");
          return;
        }
        setFilename(cached.filename || "");
        const blob = await fetch(cached.url).then((r) => r.blob());
        const zip = await loadAsyncJSZip(blob);
        const backData = await parseBackupZipFile(zip);

        const dao = new ScriptDAO();
        dao.enableCache();

        const scripts: ScriptData[] = [];
        for (const item of backData.script as ScriptData[]) {
          try {
            const prepared = await prepareScriptByCode(
              item.code,
              item.options?.meta.file_url || "",
              item.options?.meta.sc_uuid || undefined,
              true,
              dao
            );
            item.script = prepared;
            prepared.script.status = resolveEnabled(item, prepared.script)
              ? SCRIPT_STATUS_ENABLE
              : SCRIPT_STATUS_DISABLE;
            // 还原备份中的列表排序位置(对照 v1.4-agent)
            const position = item.options?.settings.position;
            if (typeof position === "number") prepared.script.sort = position;
            // 还原脚本自定义配置(自定义 match/exclude/run-at 等):SC 用 selfMeta,TM 从 override 推导,VM 已预置
            const selfMeta = deriveSelfMetadata(item, prepared.script.metadata);
            if (selfMeta) prepared.script.selfMetadata = selfMeta;
            item.install = true;
          } catch (e) {
            item.error = (e as Error)?.message || String(e);
          }
          scripts.push(item);
        }

        const subs: PreparedSubscribe[] = [];
        for (const sub of backData.subscribe as SubscribeData[]) {
          try {
            const { subscribe, oldSubscribe } = await prepareSubscribeByCode(sub.source, sub.options?.meta.url || "");
            sub.subscribe = subscribe;
            subs.push({ data: sub, subscribe, oldExists: !!oldSubscribe });
          } catch (e) {
            subs.push({ data: sub, error: (e as Error)?.message || String(e) });
          }
        }

        if (scripts.length === 0 && subs.length === 0) {
          setPhase("empty");
          return;
        }

        setScriptData(scripts);
        setSubData(subs);
        setSelectedScripts(new Set(scripts.filter((d) => !d.error && d.script).map((d) => d.script!.script.uuid)));
        setSelectedSubscribes(new Set(subs.filter((p) => !p.error && p.subscribe).map((p) => p.subscribe!.url)));
        setPhase("ready");
      } catch (e) {
        setErrorMessage((e as Error)?.message || String(e));
        setPhase("error");
      } finally {
        loadingRef.current = false;
      }
    })();
  }, [reloadKey]);

  const scripts = useMemo(() => sortByName(scriptData.map(toScriptImportItem)), [scriptData]);
  const subscribes = useMemo(() => sortByName(subData.map(toSubscribeImportItem)), [subData]);

  const onToggleScript = useCallback((id: string) => {
    setSelectedScripts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onToggleAllScripts = useCallback(() => {
    const ids = importableScriptIds(scripts);
    setSelectedScripts((prev) => (ids.length > 0 && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }, [scripts]);

  const onToggleSubscribe = useCallback((id: string) => {
    setSelectedSubscribes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onToggleAllSubscribes = useCallback(() => {
    const ids = importableSubscribeIds(subscribes);
    setSelectedSubscribes((prev) => (ids.length > 0 && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }, [subscribes]);

  const onSetEnabled = useCallback((id: string, enabled: boolean) => {
    setScriptData((prev) =>
      prev.map((d) =>
        d.script?.script.uuid === id
          ? {
              ...d,
              script: {
                ...d.script,
                script: { ...d.script.script, status: enabled ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE },
              },
            }
          : d
      )
    );
  }, []);

  const onImport = useCallback(async () => {
    const pickedScripts = scriptData.filter((d) => d.script && !d.error && selectedScripts.has(d.script.script.uuid));
    const pickedSubs = subData.filter((p) => p.subscribe && !p.error && selectedSubscribes.has(p.subscribe.url));

    setImportStatus(() => {
      const init: Record<string, ImportItemStatus> = {};
      for (const item of scripts) {
        init[item.id] = item.importable && selectedScripts.has(item.id) ? "pending" : "skipped";
      }
      for (const item of subscribes) {
        init[item.id] = item.importable && selectedSubscribes.has(item.id) ? "pending" : "skipped";
      }
      return init;
    });
    setResourceErrors({});
    setSummaryState(summarize(scripts, subscribes, selectedScripts, selectedSubscribes));
    setTotalCount(pickedScripts.length + pickedSubs.length);
    setDoneCount(0);
    setPhase("importing");

    // 覆盖模式(#841)：导入前清空本地全部脚本，避免与云端精简过的共存
    if (overwriteLocal) {
      const all = await scriptClient.getAllScripts();
      if (all.length > 0) await scriptClient.deletes(all.map((s) => s.uuid));
    }

    const mark = (id: string, status: ImportItemStatus) => setImportStatus((prev) => ({ ...prev, [id]: status }));
    const bump = () => setDoneCount((n) => n + 1);

    await Promise.all(
      pickedScripts.map(async (d) => {
        const s = d.script!.script;
        mark(s.uuid, "importing");
        try {
          if (s.ignoreVersion) s.ignoreVersion = "";
          await scriptClient.install({
            script: s,
            code: d.code,
            createtime: d.lastModificationDate,
            updatetime: d.lastModificationDate,
          });
          let failedResources: string[] = [];
          if (hasResources(d)) {
            // 资源逐项导入，单个资源失败不影响脚本本体已安装；失败清单逐项回显而非只落后台 log(#1150)
            failedResources =
              (await synchronizeClient.importResources(s.uuid, d.requires, d.resources, d.requiresCss)) || [];
          }
          const entries = Object.entries(d.storage?.data || {});
          if (entries.length > 0) {
            const keyValuePairs: TKeyValuePair[] = entries.map(([k, v]) => [k, encodeRValue(v)]);
            await valueClient.setScriptValues({ uuid: s.uuid, keyValuePairs, isReplace: false, ts: d.storage.ts || 0 });
          }
          if (failedResources.length > 0) {
            setResourceErrors((prev) => ({ ...prev, [s.uuid]: failedResources }));
            mark(s.uuid, "warning");
          } else {
            mark(s.uuid, "done");
          }
        } catch {
          mark(s.uuid, "skipped");
        }
        bump();
      })
    );

    await Promise.all(
      pickedSubs.map(async (p) => {
        const sub = p.subscribe!;
        mark(sub.url, "importing");
        try {
          await subscribeClient.install(sub);
          mark(sub.url, "done");
        } catch {
          mark(sub.url, "skipped");
        }
        bump();
      })
    );

    setPhase("done");
  }, [scriptData, subData, scripts, subscribes, selectedScripts, selectedSubscribes, overwriteLocal]);

  const onToggleOverwrite = useCallback(() => setOverwriteLocal((v) => !v), []);
  const onClose = useCallback(() => window.close(), []);
  const onCancel = useCallback(() => window.close(), []);
  const onRetry = useCallback(() => {
    // 重试:重置为加载态并自增 reloadKey 触发 effect 重跑(初次挂载由 useState 初值 "loading" 覆盖)
    setPhase("loading");
    setReloadKey((n) => n + 1);
  }, []);
  const onOpenScriptList = useCallback(() => {
    window.location.href = chrome.runtime.getURL("src/options.html");
  }, []);

  return {
    phase,
    filename,
    errorMessage,
    scripts,
    subscribes,
    selectedScripts,
    selectedSubscribes,
    importStatus,
    resourceErrors,
    overwriteLocal,
    doneCount,
    totalCount,
    summary: summaryState,
    onToggleOverwrite,
    onToggleScript,
    onToggleAllScripts,
    onToggleSubscribe,
    onToggleAllSubscribes,
    onSetEnabled,
    onImport,
    onCancel,
    onClose,
    onRetry,
    onOpenScriptList,
  };
}
