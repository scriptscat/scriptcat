import React, { useEffect, useState } from "react";
import { Button, Card, Checkbox, Divider, List, Message, Space, Switch, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next"; // 导入react-i18next的useTranslation钩子
import JSZip from "jszip";
import { ScriptBackupData, ScriptOptions, SubscribeBackupData } from "@App/pkg/backup/struct";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { Script, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import { Subscribe } from "@App/app/repo/subscribe";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { parseBackupZipFile } from "@App/pkg/backup/utils";
import { scriptClient, valueClient } from "../store/features/script";

type ScriptData = ScriptBackupData & {
  script?: { script: Script; oldScript?: Script };
  install: boolean;
  error?: string;
};

type SubscribeData = SubscribeBackupData & {
  subscribe?: Subscribe;
  install: boolean;
};

function App() {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [subscribes, setSubscribe] = useState<SubscribeData[]>([]);
  const [selectAll, setSelectAll] = useState([true, true]);
  const [installNum, setInstallNum] = useState([0, 0]);
  const [loading, setLoading] = useState(true);
  const url = new URL(window.location.href);
  const uuid = url.searchParams.get("uuid") || "";
  const { t } = useTranslation(); // 使用useTranslation钩子获取翻译函数

  useEffect(() => {
    Cache.getInstance()
      .get(CacheKey.importFile(uuid))
      .then(async (resp: { filename: string; url: string }) => {
        const filedata = await fetch(resp.url).then((resp) => resp.blob());
        const zip = await JSZip.loadAsync(filedata);
        const backData = await parseBackupZipFile(zip);
        const backDataScript = backData.script as ScriptData[];
        setScripts(backDataScript);
        // 获取各个脚本现在已经存在的信息
        const result = await Promise.all(
          backDataScript.map(async (item) => {
            try {
              const prepareScript = await prepareScriptByCode(
                item.code,
                item.options?.meta.file_url || "",
                item.options?.meta.sc_uuid || undefined,
                true
              );
              item.script = prepareScript;
            } catch (e: any) {
              item.error = e.toString();
              return Promise.resolve(item);
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
                  position: 0,
                },
              };
            }
            item.script.script.status =
              item.enabled !== false && item.options.settings.enabled ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
            item.install = true;
            return Promise.resolve(item);
          })
        );
        setScripts(result);
        setSelectAll([true, true]);
        setLoading(false);
      })
      .catch((e) => {
        Message.error(`获取导入文件失败: ${e}`);
      });
  }, []);
  return (
    <div>
      <Card bordered={false} title={t("data_import")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button
              type="primary"
              loading={loading}
              onClick={async () => {
                setInstallNum((prev) => {
                  return [0, prev[1]];
                });
                setLoading(true);
                const result = scripts.map(async (item) => {
                  const ok = true;
                  if (item.install && !item.error) {
                    await scriptClient.install(item.script?.script!, item.code);
                    // 导入数据
                    const { data } = item.storage;
                    Object.keys(data).forEach((key) => {
                      valueClient.setScriptValue(item.script?.script.uuid!, key, data[key]);
                    });
                  }
                  setInstallNum((prev) => {
                    return [prev[0] + 1, prev[1]];
                  });
                  return Promise.resolve(ok);
                });
                await Promise.all(result);
                setLoading(false);
                Message.success(t("import_success")!);
              }}
            >
              {t("import")}
            </Button>
            <Button type="primary" status="danger" loading={loading} onClick={() => window.close()}>
              {t("close")}
            </Button>
          </Space>
          <Typography.Text>
            {t("select_scripts_to_import")}:{" "}
            <Checkbox
              checked={selectAll[0]}
              onChange={() => {
                setScripts((prev) => {
                  setSelectAll([!selectAll[0], selectAll[1]]);
                  return prev.map((item) => {
                    item.install = !selectAll[0];
                    return item;
                  });
                });
              }}
            >
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {t("script_import_progress")}: {installNum[0]}/{scripts.length}
          </Typography.Text>
          <Typography.Text>
            {t("select_subscribes_to_import")}:{" "}
            <Checkbox
              checked={selectAll[1]}
              onChange={() => {
                setSubscribe((prev) => {
                  setSelectAll([selectAll[0], !selectAll[1]]);
                  return prev.map((item) => {
                    item.install = !selectAll[1];
                    return item;
                  });
                });
              }}
            >
              {t("select_all")}
            </Checkbox>
            <Divider type="vertical" />
            {t("subscribe_import_progress")}: {installNum[1]}/{subscribes.length}
          </Typography.Text>
          <List
            className="import-list"
            loading={loading}
            bordered={false}
            dataSource={scripts}
            render={(item, index) => (
              <div
                className="flex flex-row justify-between p-2"
                key={`e_${index}`}
                style={{
                  background: item.error ? "rgb(var(--red-1))" : item.install ? "rgb(var(--arcoblue-1))" : "",
                  borderBottom: "1px solid rgb(var(--gray-3))",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const install = item.install;
                  setScripts((prev) => {
                    prev[index].install = !install;
                    return [...prev];
                  });
                }}
              >
                <Space
                  direction="vertical"
                  size={1}
                  style={{
                    overflow: "hidden",
                  }}
                >
                  <Typography.Title
                    heading={6}
                    style={{
                      color: "rgb(var(--blue-5))",
                    }}
                  >
                    {item.script?.script?.name || item.error || t("unknown")}
                  </Typography.Title>
                  <span className="text-sm color-gray-5">
                    {t("author")}: {item.script?.script?.metadata.author && item.script?.script?.metadata.author[0]}
                  </span>
                  <span className="text-sm color-gray-5">
                    {t("description")}:{" "}
                    {item.script?.script?.metadata.description && item.script?.script?.metadata.description[0]}
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
                <div
                  className="flex flex-col justify-between"
                  style={{
                    minWidth: "80px",
                    textAlign: "center",
                  }}
                >
                  <span className="text-sm color-gray-5">{t("enable_script")}</span>
                  <div className="text-center">
                    <Switch
                      size="small"
                      checked={item.script?.script?.status === SCRIPT_STATUS_ENABLE}
                      onChange={(checked) => {
                        setScripts((prev) => {
                          prev[index].script!.script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
                          return [...prev];
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          />
        </Space>
      </Card>
    </div>
  );
}

export default App;
