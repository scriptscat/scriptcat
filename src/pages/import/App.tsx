import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  List,
  Message,
  Space,
  Switch,
  Typography,
} from "@arco-design/web-react";
import SynchronizeController from "@App/app/service/synchronize/controller";
import IoC from "@App/app/ioc";
import JSZip from "jszip";
import {
  ScriptBackupData,
  ScriptOptions,
  SubscribeBackupData,
} from "@App/pkg/backup/struct";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import { Subscribe } from "@App/app/repo/subscribe";
import ScriptController from "@App/app/service/script/controller";
import ValueController from "@App/app/service/value/controller";

type ScriptData = ScriptBackupData & {
  script?: Script & { oldScript?: Script };
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
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const valueCtrl = IoC.instance(ValueController) as ValueController;
  const syncCtrl = IoC.instance(SynchronizeController) as SynchronizeController;
  const url = new URL(window.location.href);
  const uuid = url.searchParams.get("uuid") || "";
  useEffect(() => {
    syncCtrl
      .fetchImportInfo(uuid)
      .then(async (resp: { filename: string; url: string }) => {
        const filedata = await fetch(resp.url).then((ajax) => ajax.blob());
        const zip = await JSZip.loadAsync(filedata);
        const backData = await syncCtrl.parseBackup(zip);
        const backDataScript = backData.script as ScriptData[];
        setScripts(backDataScript);
        // 获取各个脚本现在已经存在的信息
        const result = await Promise.all(
          backDataScript.map(async (item) => {
            try {
              item.script = await prepareScriptByCode(
                item.code,
                item.options?.meta.file_url || "",
                item.options?.meta.sc_uuid || undefined
              );
            } catch (e: any) {
              item.error = e.toString();
              return Promise.resolve(item);
            }
            if (!item.options) {
              item.options = {
                options: {} as ScriptOptions,
                meta: {
                  name: item.script.name,
                  // 此uuid是对tm的兼容处理
                  uuid: item.script.uuid,
                  sc_uuid: item.script.uuid,
                  file_url: item.script.downloadUrl || "",
                  modified: item.script.createtime,
                  subscribe_url: item.script.subscribeUrl,
                },
                settings: {
                  enabled: !(
                    item.script.metadata.background ||
                    item.script.metadata.crontab
                  ),
                  position: 0,
                },
              };
            } else {
              item.script.status = item.options.settings.enabled
                ? SCRIPT_STATUS_ENABLE
                : SCRIPT_STATUS_DISABLE;
            }
            item.install = true;
            return Promise.resolve(item);
          })
        );
        setScripts(result);
        setSelectAll([true, true]);
        setLoading(false);
      })
      .catch((e) => {
        Message.error(`获取导入信息失败: ${e}`);
      });
  }, []);
  return (
    <div>
      <Card bordered={false} title="数据导入">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button
              type="primary"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                const result = scripts.map(async (item) => {
                  const ok = true;
                  if (item.install && !item.error) {
                    const resp = await scriptCtrl.upsert(item.script!);
                    // 导入数据
                    const { data } = item.storage;
                    Object.keys(data).forEach((key) => {
                      valueCtrl.setValue(resp.id, key, data[key]);
                    });
                  }
                  setInstallNum((prev) => {
                    return [prev[0] + 1, prev[1]];
                  });
                  return Promise.resolve(ok);
                });
                await Promise.all(result);
                setLoading(false);
                Message.success("导入成功");
              }}
            >
              导入
            </Button>
            <Button
              type="primary"
              status="danger"
              loading={loading}
              onClick={() => window.close()}
            >
              关闭
            </Button>
          </Space>
          <Typography.Text>
            请选择你要导入的脚本:{" "}
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
              全选
            </Checkbox>
            <Divider type="vertical" />
            脚本导入进度: {installNum[0]}/{scripts.length}
          </Typography.Text>
          <Typography.Text>
            请选择你要导入的订阅:{" "}
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
              全选
            </Checkbox>
            <Divider type="vertical" />
            订阅导入进度: {installNum[1]}/{subscribes.length}
          </Typography.Text>
          <List
            className="import-list"
            loading={loading}
            bordered={false}
            dataSource={scripts}
            render={(item, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                className="flex flex-row justify-between p-2"
                key={`e_${index}`}
                style={{
                  // eslint-disable-next-line no-nested-ternary
                  background: item.error
                    ? "rgb(var(--red-1))"
                    : item.install
                    ? "rgb(var(--arcoblue-1))"
                    : "",
                  borderBottom: "1px solid rgb(var(--gray-3))",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setScripts((prev) => {
                    prev[index].install = !prev[index].install;
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
                    {item.script?.name || item.error || "unknown"}
                  </Typography.Title>
                  <span className="text-sm color-gray-5">
                    作者:{" "}
                    {item.script?.metadata.author &&
                      item.script?.metadata.author[0]}
                  </span>
                  <span className="text-sm color-gray-5">
                    描述:{" "}
                    {item.script?.metadata.description &&
                      item.script?.metadata.description[0]}
                  </span>
                  <span className="text-sm color-gray-5">
                    来源: {item.options?.meta.file_url || "本地创建"}
                  </span>
                  <span className="text-sm color-gray-5">
                    操作:{" "}
                    {(item.install &&
                      (item.script?.oldScript ? "更新" : "新增")) ||
                      (item.error
                        ? `错误: ${item.options?.meta.name} - ${item.options?.meta.uuid}`
                        : "不做操作")}
                  </span>
                </Space>
                <div
                  className="flex flex-col justify-between"
                  style={{
                    minWidth: "80px",
                    textAlign: "center",
                  }}
                >
                  <span className="text-sm color-gray-5">开启脚本</span>
                  <div className="text-center">
                    <Switch
                      size="small"
                      checked={item.script?.status === SCRIPT_STATUS_ENABLE}
                      onChange={(checked) => {
                        setScripts((prev) => {
                          prev[index].script!.status = checked
                            ? SCRIPT_STATUS_ENABLE
                            : SCRIPT_STATUS_DISABLE;
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
