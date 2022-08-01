import React from "react";
import {
  Button,
  Descriptions,
  Grid,
  Space,
  Switch,
  Typography,
} from "@arco-design/web-react";

export default function Description() {
  const permission = [
    {
      label: "@grant",
      value: "123",
    },
    {
      label: "@connect",
      value: "123",
    },
    {
      label: "@match",
      value: "123",
    },
  ];
  return (
    <Grid.Row gutter={8}>
      <Grid.Col span={8} className="flex-col">
        <div>
          <Typography.Text bold className="text-size-lg">
            脚本名称 脚本名称 脚本名称 脚本名称 脚本名称 脚本名称 脚本名称
            <Switch size="small" style={{ marginLeft: "8px" }} />
          </Typography.Text>
        </div>
        <div>
          <Typography.Text bold>脚本描述哼唱的</Typography.Text>
        </div>
        <div>
          <Typography.Text bold>作者: 王一之</Typography.Text>
        </div>
        <div>
          <Typography.Text bold>版本: 1.0.0</Typography.Text>
        </div>
        <div>
          <Typography.Text bold>来源:</Typography.Text>
          <Typography.Text
            bold
            style={{
              overflowWrap: "break-word",
              wordBreak: "break-all",
              maxHeight: "70px",
              display: "block",
              overflowY: "auto",
            }}
          >
            https://scriptcat.org/scripts/code/555/%E6%AF%8F%E5%A4%A9%E4%B8%80%E5%8F%A5%E5%9C%9F%E5%91%B3%E6%83%85%E8%AF%9D.user.js
          </Typography.Text>
        </div>
        <div className="text-end">
          <Space>
            <Button type="primary" size="small">
              安装
            </Button>
            <Button type="primary" status="danger" size="small">
              关闭
            </Button>
          </Space>
        </div>
        <div>
          <Typography.Text type="error">
            请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
          </Typography.Text>
        </div>
      </Grid.Col>
      <Grid.Col span={8}>
        <Descriptions
          title="权限列表"
          data={permission}
          column={3}
          layout="vertical"
        />
      </Grid.Col>
      <Grid.Col span={8}>
        <Typography.Text>
          这是一个定时脚本,开启将会在特点时间自动运行,也可以在面板中手动控制运行.
          crontab表达式: * once * * * 最近一次运行时间: 2022-08-01 22
          每小时运行一次
        </Typography.Text>
      </Grid.Col>
    </Grid.Row>
  );
}
