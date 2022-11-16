import React, { useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Input,
  List,
  Message,
  Modal,
  Space,
} from "@arco-design/web-react";
import Title from "@arco-design/web-react/es/Typography/title";
import IoC from "@App/app/ioc";
import SynchronizeController from "@App/app/service/synchronize/controller";
import FileSystemFactory, { FileSystemType } from "@Pkg/filesystem/factory";
import { SystemConfig } from "@App/pkg/config/config";
import { File, FileReader } from "@Pkg/filesystem/filesystem";
import { formatUnixTime } from "@App/pkg/utils/utils";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import SystemController from "@App/app/service/system/controller";

function Tools() {
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const syncCtrl = IoC.instance(SynchronizeController) as SynchronizeController;
  const fileRef = useRef<HTMLInputElement>(null);
  const systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>(
    systemConfig.backup.filesystem
  );
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>(systemConfig.backup.params[fileSystemType] || {});
  const [backupFileList, setBackupFileList] = useState<File[]>([]);

  const vscodeRef = useRef<RefInputType>(null);

  return (
    <Space
      direction="vertical"
      style={{
        width: "100%",
      }}
    >
      <Card title="备份" bordered={false}>
        <Space direction="vertical">
          <Title heading={6}>本地</Title>
          <Space>
            <input
              type="file"
              ref={fileRef}
              style={{ display: "none" }}
              accept=".zip"
            />
            <Button
              type="primary"
              loading={loading.local}
              onClick={async () => {
                setLoading((prev) => ({ ...prev, local: true }));
                await syncCtrl.backup();
                setLoading((prev) => ({ ...prev, local: false }));
              }}
            >
              导出文件
            </Button>
            <Button
              type="primary"
              onClick={() => {
                syncCtrl
                  .openImportFile(fileRef.current!)
                  .then(() => {
                    Message.success("请在新页面中选择要导入的脚本");
                  })
                  .then((e) => {
                    Message.error(`导入错误${e}`);
                  });
              }}
            >
              导入文件
            </Button>
          </Space>
          <Title heading={6}>云端</Title>
          <FileSystemParams
            preNode="备份至"
            onChangeFileSystemType={(type) => {
              setFilesystemType(type);
            }}
            onChangeFileSystemParams={(params) => {
              setFilesystemParam(params);
            }}
            actionButton={[
              <Button
                key="backup"
                type="primary"
                loading={loading.cloud}
                onClick={() => {
                  // 储存参数
                  const params = { ...systemConfig.backup.params };
                  params[fileSystemType] = fileSystemParams;
                  systemConfig.backup = {
                    filesystem: fileSystemType,
                    params,
                  };
                  setLoading((prev) => ({ ...prev, cloud: true }));
                  Message.info("正在准备备份到云端");
                  syncCtrl
                    .backupToCloud(fileSystemType, fileSystemParams)
                    .then(() => {
                      Message.success("备份成功");
                    })
                    .catch((e) => {
                      Message.error(`备份失败: ${e}`);
                    })
                    .finally(() => {
                      setLoading((prev) => ({ ...prev, cloud: false }));
                    });
                }}
              >
                备份
              </Button>,
              <Button
                key="list"
                type="primary"
                onClick={async () => {
                  let fs = await FileSystemFactory.create(
                    fileSystemType,
                    fileSystemParams
                  );
                  try {
                    fs = await fs.openDir("ScriptCat");
                    const list = await fs.list();
                    list.sort((a, b) => b.updatetime - a.updatetime);
                    // 过滤掉非zip文件
                    list.filter((file) => file.name.endsWith(".zip"));
                    if (list.length === 0) {
                      Message.info("没有备份文件");
                      return;
                    }
                    setBackupFileList(list);
                  } catch (e) {
                    Message.error(`获取备份文件失败: ${e}`);
                  }
                }}
              >
                备份列表
              </Button>,
            ]}
            fileSystemType={fileSystemType}
            fileSystemParams={fileSystemParams}
          />
          <Drawer
            width={400}
            title={<span>备份列表</span>}
            visible={backupFileList.length !== 0}
            onOk={() => {
              setBackupFileList([]);
            }}
            onCancel={() => {
              setBackupFileList([]);
            }}
          >
            <List
              bordered={false}
              dataSource={backupFileList}
              render={(item: File) => (
                <List.Item key={item.name}>
                  <List.Item.Meta
                    title={item.name}
                    description={formatUnixTime(item.updatetime / 1000)}
                  />
                  <Space className="w-full justify-end">
                    <Button
                      type="primary"
                      size="small"
                      onClick={async () => {
                        Message.info("正在从云端拉取数据");
                        const fs = await FileSystemFactory.create(
                          fileSystemType,
                          fileSystemParams
                        );
                        let file: FileReader;
                        let data: Blob;
                        try {
                          file = await fs.open(item);
                          data = (await file.read("blob")) as Blob;
                        } catch (e) {
                          Message.error(`拉取失败: ${e}`);
                          return;
                        }
                        const url = URL.createObjectURL(data);
                        setTimeout(() => {
                          URL.revokeObjectURL(url);
                        }, 60 * 100000);
                        syncCtrl
                          .openImportWindow(item.name, url)
                          .then(() => {
                            Message.success("请在新页面中选择要导入的脚本");
                          })
                          .then((e) => {
                            Message.error(`导入错误${e}`);
                          });
                      }}
                    >
                      恢复
                    </Button>
                    <Button
                      type="primary"
                      status="danger"
                      size="small"
                      onClick={() => {
                        Modal.confirm({
                          title: "确认删除",
                          content: `确认删除备份文件${item.name}?`,
                          onOk: async () => {
                            const fs = await FileSystemFactory.create(
                              fileSystemType,
                              fileSystemParams
                            );
                            try {
                              await fs.delete(item.name);
                              setBackupFileList(
                                backupFileList.filter(
                                  (i) => i.name !== item.name
                                )
                              );
                              Message.success("删除成功");
                            } catch (e) {
                              Message.error(`删除失败${e}`);
                            }
                          },
                        });
                      }}
                    >
                      删除
                    </Button>
                  </Space>
                </List.Item>
              )}
            />
          </Drawer>
          <Title heading={6}>备份策略</Title>
          <Empty description="建设中" />
        </Space>
      </Card>

      <Card
        title={
          <>
            <span>开发调试</span>
            <Button
              type="text"
              style={{
                height: 24,
              }}
              icon={
                <IconQuestionCircleFill
                  style={{
                    margin: 0,
                  }}
                />
              }
              href="https://www.bilibili.com/video/BV16q4y157CP"
              target="_blank"
              iconOnly
            />
          </>
        }
        bordered={false}
      >
        <Space direction="vertical">
          <Title heading={6}>VSCode地址</Title>
          <Input
            ref={vscodeRef}
            defaultValue={systemConfig.vscodeUrl}
            onChange={(value) => {
              systemConfig.vscodeUrl = value;
            }}
          />
          <Checkbox
            onChange={(checked) => {
              systemConfig.vscodeReconnect = checked;
            }}
            defaultChecked={systemConfig.vscodeReconnect}
          >
            自动连接vscode服务
          </Checkbox>
          <Button
            type="primary"
            onClick={() => {
              const ctrl = IoC.instance(SystemController) as SystemController;
              ctrl
                .connectVSCode()
                .then(() => {
                  Message.success("连接成功");
                })
                .catch((e) => {
                  Message.error(`连接失败: ${e}`);
                });
            }}
          >
            连接
          </Button>
        </Space>
      </Card>
    </Space>
  );
}

export default Tools;
