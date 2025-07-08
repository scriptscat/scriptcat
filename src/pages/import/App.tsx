import React, { useEffect, useState, useCallback } from "react";
import { Button, Card, Checkbox, Divider, List, Message, Space, Switch, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next"; // 导入react-i18next的useTranslation钩子
import JSZip from "jszip";
import type { ScriptOptions, ScriptData, SubscribeData } from "@App/pkg/backup/struct";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, ScriptDAO } from "@App/app/repo/scripts";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { parseBackupZipFile } from "@App/pkg/backup/utils";
import { scriptClient, synchronizeClient, valueClient } from "../store/features/script";
import { sleep } from "@App/pkg/utils/utils";

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
    onToggle: (index: number) => () => void;
    onStatusToggle: (index: number, checked: boolean) => void;
  }) => {
    return (
      <div
        className="flex flex-row justify-between p-2"
        key={`script_${index}`}
        style={{
          background: item.error ? "rgb(var(--red-1))" : item.install ? "rgb(var(--arcoblue-1))" : "",
          borderBottom: "1px solid rgb(var(--gray-3))",
          cursor: "pointer",
        }}
        onClick={onToggle(index)}
      >
        <Space direction="vertical" size={1} style={{ overflow: "hidden" }}>
          <Typography.Title heading={6} style={{ color: "rgb(var(--blue-5))" }}>
            {item.script?.script?.name || item.error || t("unknown")}
          </Typography.Title>
          <span className="text-sm color-gray-5">
            {t("author")}: {item.script?.script?.metadata.author?.[0]}
          </span>
          <span className="text-sm color-gray-5">
            {t("description")}: {item.script?.script?.metadata.description?.[0]}
          </span>
          <span className="text-sm color-gray-5">
            {t("source")}: {item.options?.meta.file_url || t("local_creation")}
          </span>
          <span className="text-sm color-gray-5">
            {t("operation")}:{" "}
            {(item.install && (item.script?.oldScript ? t("update") : t("add_new"))) ||
              (item.error
                ? `${t("error")}: ${item.options?.meta.name} - ${item.options?.meta.uuid}`
                : t("no_operation"))}
          </span>
        </Space>
        <div className="flex flex-col justify-between" style={{ minWidth: "80px", textAlign: "center" }}>
          <span className="text-sm color-gray-5">{t("enable_script")}</span>
          <div className="text-center">
            <Switch
              size="small"
              checked={item.script?.script?.status === SCRIPT_STATUS_ENABLE}
              onChange={(checked) => onStatusToggle(index, checked)}
            />
          </div>
        </div>
      </div>
    );
  }
);

ScriptListItem.displayName = 'ScriptListItem';

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
      const resp: { filename: string; url: string } = await Cache.getInstance().get(CacheKey.importFile(uuid));
      const filedata = await fetch(resp.url).then((resp) => resp.blob());
      const zip = await JSZip.loadAsync(filedata);
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
      await scriptClient.install(item.script!.script!, item.code);
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
          const entries = Object.entries(data);
          if (entries.length === 0) return;
          await sleep(((Math.random() * 600) | 0) + 200);
          for (const [key, value] of entries) {
            await valueClient.setScriptValue(item.script!.script.uuid!, key, value);
          }
        })(),
      ]);
      setInstallNum((prev) => [prev[0] + 1, prev[1]]);
    } catch (e: any) {
      // 跳過失敗
      item.error = e.toString();
    }
  };

  const importScripts = useCallback(async (scripts: ScriptData[]) => {
    const promises: Promise<any>[] = [];
    for (const item of scripts) {
      if (item.install && !item.error) {
        promises.push(scriptImportAsync(item));
      }
    }
    return Promise.all(promises);
  }, []);

  const importButtonClick = useCallback(
    (scripts: ScriptData[]) => async () => {
      setInstallNum((prev) => [0, prev[1]]);
      setLoading(true);
      await importScripts(scripts);
      setLoading(false);
      Message.success(t("import_success")!);
    },
    [importScripts, t]
  );

  const handleSelectAllScripts = useCallback(() => {
    setSelectAll((prev) => {
      const newValue = !prev[0];
      setScripts((prevScripts) => prevScripts.map((script) => ({ ...script, install: newValue })));
      return [newValue, prev[1]];
    });
  }, []);

  const handleSelectAllSubscribes = useCallback(() => {
    setSelectAll((prev) => {
      const newValue = !prev[1];
      setSubscribes((prevSubscribes) => prevSubscribes.map((subscribe) => ({ ...subscribe, install: newValue })));
      return [prev[0], newValue];
    });
  }, []);

  const handleScriptToggle = useCallback((index: number) => {
    setScripts((prevScripts) => {
      const newScripts = [...prevScripts];
      newScripts[index] = { ...newScripts[index], install: !newScripts[index].install };
      setSelectAll((prev) => [newScripts.every((script) => script.install), prev[1]]);
      return newScripts;
    });
  }, []);

  const handleScriptToggleClick = useCallback(
    (index: number) => () => {
      handleScriptToggle(index);
    },
    [handleScriptToggle]
  );

  const handleScriptStatusToggle = useCallback((index: number, checked: boolean) => {
    setScripts((prevScripts) => {
      const newScripts = [...prevScripts];
      newScripts[index] = {
        ...newScripts[index],
        script: {
          ...newScripts[index].script!,
          script: {
            ...newScripts[index].script!.script,
            status: checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
          },
        },
      };
      return newScripts;
    });
  }, []);

  return (
    <div>
      <Card bordered={false} title={t("data_import")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button type="primary" loading={loading} onClick={importButtonClick(scripts)}>
              {t("import")}
            </Button>
            <Button type="primary" status="danger" loading={loading} onClick={() => window.close()}>
              {t("close")}
            </Button>
          </Space>
          <Typography.Text>
            {t("select_scripts_to_import")}:{" "}
            <Checkbox checked={selectAll[0]} onChange={handleSelectAllScripts}>
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {t("script_import_progress")}: {installNum[0]}/{scripts.length}
          </Typography.Text>
          <Typography.Text>
            {t("select_subscribes_to_import")}:{" "}
            <Checkbox checked={selectAll[1]} onChange={handleSelectAllSubscribes}>
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {t("subscribe_import_progress")}: {installNum[1]}/{subscribes.length}
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
