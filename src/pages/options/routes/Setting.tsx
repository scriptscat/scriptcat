import React from "react";
import {
  Button,
  Card,
  Checkbox,
  Message,
  Select,
  Space,
} from "@arco-design/web-react";

function Setting() {
  return (
    <Space
      direction="vertical"
      style={{
        width: "100%",
      }}
    >
      <Card title="脚本同步" bordered={false}>
        <Space direction="vertical">
          <Space>
            <Checkbox>启用脚本同步至</Checkbox>
            <Select defaultValue="webdav" style={{ width: 120 }}>
              <Select.Option value="webdav">WebDAV</Select.Option>
            </Select>
          </Space>
          <Button
            type="primary"
            onClick={() => {
              Message.info("建设中");
            }}
          >
            手动点击同步一次
          </Button>
        </Space>
      </Card>
      <Card title="更新" bordered={false}>
        <Space direction="vertical">
          <Checkbox>更新已禁用脚本</Checkbox>
          <Checkbox>非重要变更静默更新脚本</Checkbox>
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
