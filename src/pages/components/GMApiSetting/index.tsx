import React, { useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Link,
  Message,
  Space,
  Typography,
} from "@arco-design/web-react";
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import FileSystemFactory, { FileSystemType } from "@Pkg/filesystem/factory";
import FileSystemParams from "../FileSystemParams";

const CollapseItem = Collapse.Item;

const GMApiSetting: React.FC = () => {
  const systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  const [status, setStatus] = useState(systemConfig.catFileStorage.status);
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>(
    systemConfig.catFileStorage.filesystem
  );
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>(systemConfig.catFileStorage.params[fileSystemType] || {});

  return (
    <Card title="GM Api" bordered={false}>
      <Collapse bordered={false} defaultActiveKey={["storage"]}>
        <CollapseItem header="Storage API" name="storage">
          <Space direction="vertical">
            <FileSystemParams
              preNode={
                <Typography.Text>
                  设置
                  <Link
                    target="_black"
                    href="https://github.com/scriptscat/scriptcat/blob/main/example/cat_file_storage.js"
                  >
                    CAT_fileStorage
                  </Link>
                  使用的文件系统
                </Typography.Text>
              }
              actionButton={[
                <Button
                  key="save"
                  type="primary"
                  onClick={async () => {
                    try {
                      await FileSystemFactory.create(
                        fileSystemType,
                        fileSystemParams
                      );
                    } catch (e) {
                      Message.error(`账号信息验证失败: ${e}`);
                      return;
                    }
                    const params = { ...systemConfig.catFileStorage.params };
                    params[fileSystemType] = fileSystemParams;
                    systemConfig.catFileStorage = {
                      status: "success",
                      filesystem: fileSystemType,
                      params,
                    };
                    setStatus("success");
                    Message.success("保存成功");
                  }}
                >
                  保存
                </Button>,
                <Button
                  key="reset"
                  onClick={() => {
                    const params = { ...systemConfig.catFileStorage.params };
                    systemConfig.catFileStorage = {
                      status: "unset",
                      filesystem: fileSystemType,
                      params,
                    };
                    setStatus("unset");
                  }}
                  type="primary"
                  status="danger"
                >
                  重置
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
            {status === "unset" && (
              <Typography.Text type="secondary">未设置</Typography.Text>
            )}
            {status === "success" && (
              <Typography.Text type="success">使用中</Typography.Text>
            )}
            {status === "error" && (
              <Typography.Text type="error">储存错误</Typography.Text>
            )}
          </Space>
        </CollapseItem>
      </Collapse>
    </Card>
  );
};

export default GMApiSetting;
