import React, { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Message,
  Select,
  Space,
} from "@arco-design/web-react";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { SystemConfig } from "@App/pkg/config/config";
import IoC from "@App/app/ioc";
import FileSystemFactory, { FileSystemType } from "@Pkg/filesystem/factory";
import Title from "@arco-design/web-react/es/Typography/title";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";

function Setting() {
  const systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  const [syncDelete, setSyncDelete] = useState<boolean>(
    systemConfig.cloudSync.syncDelete
  );
  const [enableCloudSync, setEnableCloudSync] = useState(
    systemConfig.cloudSync.enable
  );
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>(
    systemConfig.cloudSync.filesystem
  );
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>(systemConfig.cloudSync.params[fileSystemType] || {});

  return (
    <Space
      direction="vertical"
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
    >
      <Card title="脚本同步" bordered={false}>
        <Space direction="vertical">
          <Checkbox
            checked={syncDelete}
            onChange={(checked) => {
              setSyncDelete(checked);
            }}
          >
            同步删除
          </Checkbox>
          <FileSystemParams
            preNode={
              <Checkbox
                checked={enableCloudSync}
                onChange={(checked) => {
                  setEnableCloudSync(checked);
                }}
              >
                启用脚本同步至
              </Checkbox>
            }
            actionButton={[
              <Button
                key="save"
                type="primary"
                onClick={async () => {
                  // 保存到配置中去
                  // 开启的情况先进行一次验证
                  if (enableCloudSync) {
                    Message.info("云同步账号信息验证中...");
                    try {
                      await FileSystemFactory.create(
                        fileSystemType,
                        fileSystemParams
                      );
                    } catch (e) {
                      Message.error(`云同步账号信息验证失败: ${e}`);
                      return;
                    }
                  }
                  const params = { ...systemConfig.backup.params };
                  params[fileSystemType] = fileSystemParams;
                  systemConfig.cloudSync = {
                    enable: enableCloudSync,
                    syncDelete,
                    filesystem: fileSystemType,
                    params,
                  };
                  Message.success("保存成功");
                }}
              >
                保存
              </Button>,
            ]}
            fileSystemType={fileSystemType}
            fileSystemParams={fileSystemParams}
            onChangeFileSystemType={(type) => {
              setFilesystemType(type);
            }}
            onChangeFileSystemParams={(params) => {
              setFilesystemParam(params);
            }}
          />
        </Space>
      </Card>
      <Card title="更新" bordered={false}>
        <Space direction="vertical">
          <Space>
            <span>脚本/订阅检查更新间隔:</span>
            <Select
              defaultValue={systemConfig.checkScriptUpdateCycle.toString()}
              style={{
                width: 100,
              }}
              onChange={(value) => {
                systemConfig.checkScriptUpdateCycle = parseInt(value, 10);
              }}
            >
              <Select.Option value="0">从不</Select.Option>
              <Select.Option value="21600">6小时</Select.Option>
              <Select.Option value="43200">12小时</Select.Option>
              <Select.Option value="86400">每天</Select.Option>
              <Select.Option value="604800">每周</Select.Option>
            </Select>
          </Space>
          <Checkbox
            onChange={(checked) => {
              systemConfig.updateDisableScript = checked;
            }}
            defaultChecked={systemConfig.updateDisableScript}
          >
            更新已禁用脚本
          </Checkbox>
          <Checkbox
            onChange={(checked) => {
              systemConfig.silenceUpdateScript = checked;
            }}
            defaultChecked={systemConfig.silenceUpdateScript}
          >
            非重要变更静默更新脚本
          </Checkbox>
        </Space>
      </Card>
      <Card title="ESLint" bordered={false}>
        <Space direction="vertical" className="w-full">
          <Checkbox
            onChange={(checked) => {
              systemConfig.enableEslint = checked;
            }}
            defaultChecked={systemConfig.enableEslint}
          >
            开启ESLint
          </Checkbox>
          <Title heading={5}>
            ESLint规则{" "}
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
              href="https://eslint.org/play/"
              target="_blank"
              iconOnly
            />
          </Title>
          <Input.TextArea
            placeholder="请输入eslint规则,可以从https://eslint.org/play/下载配置"
            autoSize={{
              minRows: 4,
              maxRows: 8,
            }}
            defaultValue={systemConfig.eslintConfig}
            onBlur={(v) => {
              systemConfig.eslintConfig = v.target.value;
            }}
          />
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
