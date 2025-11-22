import React, { useEffect, useState } from "react";
import { Button, Card, Checkbox, Divider, List, Message, Space, Switch, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next"; // 导入react-i18next的useTranslation钩子
import { loadAsyncJSZip } from "@App/pkg/utils/jszip-x";
import type { ScriptOptions, ScriptData, SubscribeData } from "@App/pkg/backup/struct";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptDAO } from "@App/app/repo/scripts";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_IMPORT_FILE } from "@App/app/cache_key";
import { parseBackupZipFile } from "@App/pkg/backup/utils";
import { scriptClient, synchronizeClient, valueClient } from "../store/features/script";
import { sleep } from "@App/pkg/utils/utils";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { encodeRValue } from "@App/pkg/utils/message_value";

const ScriptListItem = React.memo(
  ({
    item,
    index,
    t,
    onToggle,
    onStatusToggle,
  }: {
    item: ScriptData;
    index: number;
    t: (a: string) => string;
    onToggle: (index: number) => void;
    onStatusToggle: (index: number, checked: boolean) => void;
  }) => {
    return (
      <div
        className="uno-flex uno-flex-row uno-justify-between uno-p-2"
        key={`script_${index}`}
        style={{
          background: item.error ? "rgb(var(--red-1))" : item.install ? "rgb(var(--arcoblue-1))" : "",
          borderBottom: "1px solid rgb(var(--gray-3))",
          cursor: "pointer",
        }}
        onClick={() => onToggle(index)}
      >
        <Space direction="vertical" size={1} style={{ overflow: "hidden" }}>
          <Typography.Title heading={6} style={{ color: "rgb(var(--blue-5))" }}>
            {item.script?.script?.name || item.error || t("unknown")}
          </Typography.Title>
          <span className="uno-text-sm uno-color-gray-5">{`${t("author")}: ${item.script?.script?.metadata.author?.[0]}`}</span>
          <span className="uno-text-sm uno-color-gray-5">
            {`${t("description")}: ${item.script?.script?.metadata.description?.[0]}`}
          </span>
          <span className="uno-text-sm uno-color-gray-5">
            {`${t("source")}: ${item.options?.meta.file_url || t("local_creation")}`}
          </span>
          <span className="uno-text-sm uno-color-gray-5">
            {`${t("operation")}: `}
            {(item.install && (item.script?.oldScript ? t("update") : t("add_new"))) ||
              (item.error
                ? `${t("error")}: ${item.options?.meta.name} - ${item.options?.meta.uuid}`
                : t("no_operation"))}
          </span>
        </Space>
        <div className="uno-flex uno-flex-col uno-justify-center" style={{ minWidth: "80px", textAlign: "center" }}>
          <span className="uno-text-sm uno-color-gray-5">{t("enable_script")}</span>
          <div className="uno-text-center">
            <Switch
              size="small"
              checked={item.script?.script?.status === SCRIPT_STATUS_ENABLE}
              onChange={(checked) => onStatusToggle(index, checked)}
            />
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.index === nextProps.index && prevProps.item === nextProps.item && prevProps.t === nextProps.t;
  }
);

ScriptListItem.displayName = "ScriptListItem";

function App() {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [subscribes, setSubscribes] = useState<SubscribeData[]>([]);
  const [selectAll, setSelectAll] = useState([true, true]);
  const [installNum, setInstallNum] = useState([0, 0]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation(); // 使用useTranslation钩子获取翻译函数

  const fetchData = async () => {
    try {
      const url = new URL(window.location.href);
      const uuid = url.searchParams.get("uuid") || "";
      const cacheKey = `${CACHE_KEY_IMPORT_FILE}${uuid}`;
      const resp = await cacheInstance.get<{ filename: string; url: string }>(cacheKey);
      if (!resp) throw new Error("fetchData failed");
      const filedata = await fetch(resp.url).then((resp) => resp.blob());
      const zip = await loadAsyncJSZip(filedata);
      const backData = await parseBackupZipFile(zip);
      const backDataScript = backData.script as ScriptData[];

      // 使用缓存优化脚本加载速度
      const scriptDAO = new ScriptDAO();
      scriptDAO.enableCache();

      // setScripts(backDataScript);
      // 获取各个脚本现在已经存在的信息
      await Promise.all(
        backDataScript.map(async (item) => {
          try {
            const prepareScript = await prepareScriptByCode(
              item.code,
              item.options?.meta.file_url || "",
              item.options?.meta.sc_uuid || undefined,
              true,
              scriptDAO
            );
            item.script = prepareScript;
          } catch (e: any) {
            item.error = e.toString();
            return item;
          }
          if (!item.options) {
            item.options = {
              options: {} as ScriptOptions,
              meta: {
                name: item.script?.script.name,
                // 此uuid是对tm的兼容处理
                uuid: item.script?.script.uuid,
                sc_uuid: item.script?.script.uuid,
                file_url: item.script?.script.downloadUrl || "",
                modified: item.script?.script.createtime,
                subscribe_url: item.script?.script.subscribeUrl,
              },
              settings: {
                enabled:
                  item.enabled === false
                    ? false
                    : !(item.script?.script.metadata.background || item.script?.script.metadata.crontab),
                position: item.script?.script.sort,
              },
            };
          }
          item.script.script.sort = item.options.settings.position || 0;
          item.script.script.status =
            item.enabled !== false && item.options.settings.enabled ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
          item.install = true;
          return item;
        })
      );
      const results = backDataScript.slice().sort((a, b) => {
        const aName = a.script?.script?.name || "";
        const bName = b.script?.script?.name || "";
        if (aName && bName) return aName.localeCompare(bName);
        return 0;
      });
      setScripts(results);
      setSelectAll([true, true]);
      setLoading(false);
    } catch (e) {
      Message.error(`获取导入文件失败: ${e}`);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const scriptImportAsync = async (item: ScriptData) => {
    try {
      if (item.script?.script) {
        if (item.script.script.ignoreVersion) item.script.script.ignoreVersion = "";
      }
      const scriptDetails = item.script!.script!;
      const createtime = item.lastModificationDate;
      const updatetime = item.lastModificationDate;
      await scriptClient.install({ script: scriptDetails, code: item.code, createtime, updatetime });
      await Promise.all([
        (async () => {
          // 导入资源
          if (!item.requires || !item.resources || !item.requiresCss) return;
          if (!item.requires[0] && !item.resources[0] && !item.requiresCss[0]) return;
          await sleep(((Math.random() * 600) | 0) + 200);
          await synchronizeClient.importResources(
            item.script?.script.uuid,
            item.requires,
            item.resources,
            item.requiresCss
          );
        })(),
        (async () => {
          // 导入数据
          const { data } = item.storage;
          const ts = item.storage.ts || 0;
          const entries = Object.entries(data);
          if (entries.length === 0) return;
          await sleep(((Math.random() * 600) | 0) + 200);
          const uuid = item.script!.script.uuid!;
          const keyValuePairs = [] as TKeyValuePair[];
          for (const [key, value] of entries) {
            keyValuePairs.push([key, encodeRValue(value)]);
          }
          await valueClient.setScriptValues({ uuid: uuid, keyValuePairs, isReplace: false, ts: ts });
        })(),
      ]);
      setInstallNum((prev) => [prev[0] + 1, prev[1]]);
    } catch (e: any) {
      // 跳過失敗
      item.error = e.toString();
    }
  };

  const importScripts = async (scripts: ScriptData[]) => {
    const promises: Promise<any>[] = [];
    for (const item of scripts) {
      if (item.install && !item.error) {
        promises.push(scriptImportAsync(item));
      }
    }
    return Promise.all(promises);
  };

  const handleScriptToggle = (index: number) => {
    let bool: boolean;
    setScripts((prevScripts) => {
      prevScripts = prevScripts.map((script, i) => (i === index ? { ...script, install: !script.install } : script));
      bool = prevScripts.every((script) => script.install);
      return prevScripts;
    });
    setSelectAll((prev) => [bool, prev[1]]);
  };

  const {
    importButtonClick,
    closeButtonClick,
    handleSelectAllScripts,
    handleSelectAllSubscribes,
    handleScriptToggleClick,
    handleScriptStatusToggle,
  } = {
    importButtonClick: async () => {
      setInstallNum((prev) => [0, prev[1]]);
      setLoading(true);
      await importScripts(scripts);
      setLoading(false);
      Message.success(t("import_success")!);
    },
    closeButtonClick: () => window.close(),
    handleSelectAllScripts: () => {
      setSelectAll((prev) => {
        const newValue = !prev[0];
        setScripts((prevScripts) => prevScripts.map((script) => ({ ...script, install: newValue })));
        return [newValue, prev[1]];
      });
    },
    handleSelectAllSubscribes: () => {
      setSelectAll((prev) => {
        const newValue = !prev[1];
        setSubscribes((prevSubscribes) => prevSubscribes.map((subscribe) => ({ ...subscribe, install: newValue })));
        return [prev[0], newValue];
      });
    },
    handleScriptToggleClick: handleScriptToggle,
    handleScriptStatusToggle: (index: number, checked: boolean) => {
      setScripts((prevScripts) =>
        prevScripts.map((prevScript, i) =>
          i === index
            ? {
                ...prevScript,
                script: {
                  ...prevScript.script!,
                  script: {
                    ...prevScript.script!.script,
                    status: checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
                  },
                },
              }
            : prevScript
        )
      );
    },
  };

  return (
    <div>
      <Card bordered={false} title={t("data_import")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button type="primary" loading={loading} onClick={importButtonClick}>
              {t("import")}
            </Button>
            <Button type="primary" status="danger" loading={loading} onClick={closeButtonClick}>
              {t("close")}
            </Button>
          </Space>
          <Typography.Text>
            {`${t("select_scripts_to_import")}: `}
            <Checkbox checked={selectAll[0]} onChange={handleSelectAllScripts}>
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {`${t("script_import_progress")}: ${installNum[0]}/${scripts.length}`}
          </Typography.Text>
          <Typography.Text>
            {`${t("select_subscribes_to_import")}: `}
            <Checkbox checked={selectAll[1]} onChange={handleSelectAllSubscribes}>
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {`${t("subscribe_import_progress")}: ${installNum[1]}/${subscribes.length}`}
          </Typography.Text>
          {scripts.length > 0 && (
            <List
              className="import-list"
              loading={loading}
              bordered={false}
              dataSource={scripts}
              render={(item, index) => (
                <ScriptListItem
                  key={`script_${index}`}
                  item={item}
                  index={index}
                  t={t}
                  onToggle={handleScriptToggleClick}
                  onStatusToggle={handleScriptStatusToggle}
                />
              )}
            />
          )}
        </Space>
      </Card>
    </div>
  );
}

export default App;
