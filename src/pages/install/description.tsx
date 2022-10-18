import React, { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Grid,
  Message,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import ScriptController from "@App/app/service/script/controller";
import { prepareScriptByCode, ScriptInfo } from "@App/utils/script";
import {
  Metadata,
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import { nextTime } from "@App/utils/utils";
import IoC from "@App/app/ioc";
import CodeEditor from "../components/CodeEditor";

// 不推荐的内容标签与描述
const antifeatures: {
  [key: string]: { color: string; title: string; description: string };
} = {
  "referral-link": {
    color: "purple",
    title: "推荐链接",
    description: "该脚本会修改或重定向到作者的返佣链接",
  },
  ads: {
    color: "orange",
    title: "附带广告",
    description: "该脚本会在你访问的页面上插入广告",
  },
  payment: {
    color: "magenta",
    title: "付费脚本",
    description: "该脚本需要你付费才能够正常使用",
  },
  miner: {
    color: "orangered",
    title: "挖矿",
    description: "该脚本存在挖坑行为",
  },
  membership: {
    color: "blue",
    title: "会员功能",
    description: "该脚本需要注册会员才能正常使用",
  },
  tracking: {
    color: "pinkpurple",
    title: "信息追踪",
    description: "该脚本会追踪你的用户信息",
  },
};

type Permission = { label: string; color?: string; value: string[] }[];

const closeWindow = () => {
  window.close();
};

export default function Description() {
  const [permission, setPermission] = useState<Permission>([]);
  const [metadata, setMetadata] = useState<Metadata>({});
  // 脚本信息包括脚本代码、下载url，但是不包括解析代码后得到的metadata，通过background的缓存获取
  const [info, setInfo] = useState<ScriptInfo>();
  // 对脚本详细的描述
  const [description, setDescription] = useState<any>();
  // 是系统检测到脚本更新时打开的窗口会有一个倒计时
  const [countdown, setCountdown] = useState<number>(-1);
  // 是否为更新
  const [isUpdate, setIsUpdate] = useState<boolean>(false);
  // 脚本信息
  const [upsertScript, setUpsertScript] = useState<Script>();
  // 更新的情况下会有老版本的脚本信息
  const [oldScript, setOldScript] = useState<Script>();
  // 脚本开启状态
  const [enable, setEnable] = useState<boolean>(false);
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  useEffect(() => {
    if (countdown === -1) {
      return;
    }
    setTimeout(() => {
      setCountdown((t) => {
        if (t > 0) {
          return t - 1;
        }
        closeWindow();
        return 0;
      });
    }, 1000);
  }, [countdown]);

  const url = new URL(window.location.href);
  const uuid = url.searchParams.get("uuid");
  if (uuid) {
    useEffect(() => {
      scriptCtrl.fetchScriptInfo(uuid).then(async (resp: any) => {
        if (!resp) {
          return;
        }
        if (resp.source === "system") {
          setCountdown(30);
        }
        const script = await prepareScriptByCode(resp.code, resp.url);

        const meta = script.metadata;
        if (!meta) {
          return;
        }
        const perm: Permission = [];
        if (meta.match) {
          perm.push({ label: "脚本将在下面的网站中运行", value: meta.match });
        }
        if (meta.connect) {
          perm.push({
            label: "脚本将获得以下地址的完整访问权限",
            color: "#F9925A",
            value: meta.connect,
          });
        }
        if (meta.require) {
          perm.push({ label: "脚本引用了下列外部资源", value: meta.require });
        }
        setUpsertScript(script);
        if (script.id !== 0) {
          setIsUpdate(true);
        }
        setOldScript(script.oldScript);
        delete script.oldScript;
        setEnable(script.status === SCRIPT_STATUS_ENABLE);
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
            <Typography.Text type="error" key="cookie">
              请注意,本脚本会申请cookie的操作权限,这是一个危险的权限,请确认脚本的安全性.
            </Typography.Text>
          );
        }
        if (meta.crontab) {
          desList.push(
            <Typography.Text key="crontab">
              这是一个定时脚本,开启将会在特点时间自动运行,也可以在面板中手动控制运行.
            </Typography.Text>
          );
          desList.push(
            <Typography.Text key="cronta-nexttime">
              crontab表达式: {meta.crontab[0]} 最近一次运行时间:{" "}
              {nextTime(meta.crontab[0])}
            </Typography.Text>
          );
        } else if (meta.background) {
          desList.push(
            <Typography.Text key="background">
              这是一个后台脚本,开启将会在浏览器打开时自动运行一次,也可以在面板中手动控制运行.
            </Typography.Text>
          );
        }
        if (desList.length) {
          setDescription(<div>{desList.map((item) => item)}</div>);
        }
        // 修改网页显示title
        document.title = `${script.id === 0 ? "安装" : "更新"}脚本 - ${
          meta.name
        } - ScriptCat`;
      });
    }, []);
  } else {
    return <p>错误的链接</p>;
  }
  return (
    <div className="h-full">
      <Grid.Row gutter={8}>
        <Grid.Col flex={1} className="flex-col p-8px">
          <Space direction="vertical">
            <div>
              {upsertScript?.metadata.icon && (
                <Avatar size={32} shape="square" style={{ marginRight: "8px" }}>
                  <img
                    src={upsertScript.metadata.icon[0]}
                    alt={upsertScript?.name}
                  />
                </Avatar>
              )}
              <Typography.Text bold className="text-size-lg">
                {metadata.name}
                <Tooltip content="可以控制脚本开启状态，普通油猴脚本默认开启，后台脚本、定时脚本默认关闭">
                  <Switch
                    style={{ marginLeft: "8px" }}
                    checked={enable}
                    onChange={(checked) => {
                      setUpsertScript((script) => {
                        if (!script) {
                          return script;
                        }
                        script.status = checked
                          ? SCRIPT_STATUS_ENABLE
                          : SCRIPT_STATUS_DISABLE;
                        setEnable(checked);
                        return script;
                      });
                    }}
                  />
                </Tooltip>
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
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    if (!upsertScript) {
                      Message.error("脚本信息加载失败!");
                      return;
                    }
                    scriptCtrl
                      .upsert(upsertScript)
                      .then(() => {
                        closeWindow();
                      })
                      .catch((e) => {
                        Message.error(e.message);
                      });
                  }}
                >
                  {isUpdate ? "更新" : "安装"}
                </Button>
                <Button
                  type="primary"
                  status="danger"
                  size="small"
                  onClick={closeWindow}
                >
                  关闭{countdown !== -1 && <>({countdown})</>}
                </Button>
              </Space>
            </div>
          </Space>
        </Grid.Col>
        <Grid.Col flex={1} className="p-8px">
          <Space direction="vertical">
            <div>
              <Space>
                {oldScript && (
                  <Tooltip
                    content={`当前版本为:v${oldScript.metadata.version[0]}`}
                  >
                    <Tag bordered>{oldScript.metadata.version[0]}</Tag>
                  </Tooltip>
                )}
                {metadata.version && (
                  <Tooltip
                    color="red"
                    content={`更新版本为:v${metadata.version[0]}`}
                  >
                    <Tag bordered color="red">
                      {metadata.version[0]}
                    </Tag>
                  </Tooltip>
                )}
                {(metadata.background || metadata.crontab) && (
                  <Tooltip color="green" content="这是一个后台脚本">
                    <Tag bordered color="green">
                      后台脚本
                    </Tag>
                  </Tooltip>
                )}
                {metadata.crontab && (
                  <Tooltip color="green" content="这是一个定时脚本">
                    <Tag bordered color="green">
                      定时脚本
                    </Tag>
                  </Tooltip>
                )}
                {metadata.antifeature &&
                  metadata.antifeature.map((antifeature) => {
                    const item = antifeature.split(" ")[0];
                    return (
                      antifeatures[item] && (
                        <Tooltip
                          color={antifeatures[item].color}
                          content={antifeatures[item].description}
                        >
                          <Tag bordered color={antifeatures[item].color}>
                            {antifeatures[item].title}
                          </Tag>
                        </Tooltip>
                      )
                    );
                  })}
              </Space>
            </div>
            {description && description}
            <div>
              <Typography.Text type="error">
                请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
              </Typography.Text>
            </div>
          </Space>
        </Grid.Col>
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
                <Typography.Text bold color={item.color}>
                  {item.label}
                </Typography.Text>
                {item.value.map((v) => (
                  <div key={v}>
                    <Typography.Text
                      style={{ wordBreak: "unset" }}
                      color={item.color}
                    >
                      {v}
                    </Typography.Text>
                  </div>
                ))}
              </Grid.Col>
            ))}
          </Grid.Row>
        </Grid.Col>
      </Grid.Row>
      <CodeEditor
        id="show-code"
        code={upsertScript?.code || ""}
        diffCode={oldScript?.code}
      />
    </div>
  );
}
