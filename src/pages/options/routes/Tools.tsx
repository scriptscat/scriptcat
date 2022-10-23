import React, { useRef } from "react";
import {
  Button,
  Card,
  Input,
  Message,
  Select,
  Space,
} from "@arco-design/web-react";
import Title from "@arco-design/web-react/es/Typography/title";
import IoC from "@App/app/ioc";
import SynchronizeController from "@App/app/service/synchronize/controller";

function Tools() {
  const syncCtrl = IoC.instance(SynchronizeController) as SynchronizeController;
  const fileRef = useRef<HTMLInputElement>(null);

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
            <Button type="primary">导出文件</Button>
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
          <Space>
            备份至:
            <Select defaultValue="webdav" style={{ width: 120 }}>
              <Select.Option value="webdav">WebDAV</Select.Option>
            </Select>
            <Button
              type="primary"
              onClick={() => {
                Message.info("建设中...");
              }}
            >
              导出
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="开发调试" bordered={false}>
        <Space direction="vertical">
          <Title heading={6}>VSCode地址</Title>
          <Input />
        </Space>
      </Card>
    </Space>
  );
}

export default Tools;
