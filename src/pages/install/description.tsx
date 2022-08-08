import React, { useEffect, useState } from "react";
import {
  Button,
  Grid,
  Space,
  Switch,
  Typography,
} from "@arco-design/web-react";
import ScriptController from "@App/app/service/script/controller";
import { parseMetadata, ScriptInfo } from "@App/utils/script";
import { Metadata, Script } from "@App/app/repo/scripts";
import { nextTime } from "@App/utils/utils";
import { Subscribe } from "@App/app/repo/subscribe";

type Permission = { label: string; value: string[] }[];

export default function Description() {
  const [permission, setPermission] = useState<Permission>([]);
  const [metadata, setMetadata] = useState<Metadata>({});
  const [info, setInfo] = useState<ScriptInfo>();
  const [description, setDescription] = useState<any>();
  const [script, setScript] = useState<Script | Subscribe>();

  const url = new URL(window.location.href);
  const uuid = url.searchParams.get("uuid");
  if (uuid) {
    useEffect(() => {
      ScriptController.getInstance()
        .fetch(uuid)
        .then((resp) => {
          if (!resp) {
            return;
          }
          ScriptController.getInstance().prepareScriptByCode();
          const meta = parseMetadata(resp.code);
          const perm: Permission = [];
          if (!meta) {
            return;
          }
          if (meta.match) {
            perm.push({ label: "@match", value: meta.match });
          }
          if (meta.connect) {
            perm.push({ label: "@connect", value: meta.connect });
          }
          if (meta.require) {
            perm.push({ label: "@require", value: meta.require });
          }
          setPermission(perm);
          setMetadata(meta);
          setInfo(resp);
          const desList = [];
          let isCookie = false;
          metadata.grant?.forEach((val) => {
            if (val === "GM_cookie") {
              isCookie = true;
            }
          });
          if (isCookie) {
            desList.push(
              <Typography.Text type="error">
                请注意,本脚本会申请cookie的操作权限,这是一个危险的权限,请确认脚本的安全性.
              </Typography.Text>
            );
          }
          if (meta.coretab) {
            desList.push(
              <Typography.Text>
                这是一个定时脚本,开启将会在特点时间自动运行,也可以在面板中手动控制运行.
              </Typography.Text>
            );
          } else if (meta.background) {
            desList.push(
              <Typography.Text>
                这是一个定时脚本,开启将会在特点时间自动运行,也可以在面板中手动控制运行.
              </Typography.Text>
            );
            desList.push(
              <Typography.Text>
                crontab表达式: {meta.crontab[0]} 最近一次运行时间:{" "}
                {nextTime(meta.crontab[0])}
              </Typography.Text>
            );
          }
          if (desList.length) {
            setDescription(
              <Grid.Col flex={1} className="p-8px">
                <div>{desList.map((item) => item)}</div>
              </Grid.Col>
            );
          }
          document.title = `安装脚本 - ${meta.name} - ScriptCat`;
        });
    }, []);
  } else {
    return <p>错误的链接</p>;
  }
  return (
    <Grid.Row gutter={8}>
      <Grid.Col flex={1} className="flex-col p-8px">
        <div>
          <Typography.Text bold className="text-size-lg">
            {metadata.name}
            <Switch size="small" style={{ marginLeft: "8px" }} />
          </Typography.Text>
        </div>
        <div>
          <Typography.Text bold>{metadata.description}</Typography.Text>
        </div>
        <div>
          <Typography.Text bold>作者: {metadata.author}</Typography.Text>
        </div>
        <div>
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
            来源: {info?.url}
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
      </Grid.Col>
      <Grid.Col flex={1} className="p-8px">
        <div>
          <Typography.Text bold>版本: {metadata.version}</Typography.Text>
        </div>
        <div>
          <Typography.Text type="error">
            请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
          </Typography.Text>
        </div>
      </Grid.Col>
      {description && description}
      <Grid.Col span={24}>
        <Grid.Row>
          {permission.map((item) => (
            <Grid.Col
              key={item.label}
              span={8}
              style={{
                maxHeight: "200px",
                overflowY: "auto",
                overflowX: "auto",
                boxSizing: "border-box",
              }}
              className="p-8px"
            >
              <Typography.Text bold>{item.label}</Typography.Text>
              {item.value.map((v) => (
                <div key={v}>
                  <Typography.Text style={{ wordBreak: "unset" }}>
                    {v}
                  </Typography.Text>
                </div>
              ))}
            </Grid.Col>
          ))}
        </Grid.Row>
      </Grid.Col>
    </Grid.Row>
  );
}
