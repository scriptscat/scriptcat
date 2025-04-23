import { Avatar, Button, Grid, Message, Space, Switch, Tag, Tooltip, Typography } from "@arco-design/web-react";
import CodeEditor from "../components/CodeEditor";
import { useEffect, useState } from "react";
import { Metadata, Script, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import { Subscribe } from "@App/app/repo/subscribe";
import { i18nDescription, i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { prepareScriptByCode, prepareSubscribeByCode, ScriptInfo } from "@App/pkg/utils/script";
import { nextTime } from "@App/pkg/utils/utils";
import { scriptClient, subscribeClient } from "../store/features/script";

type Permission = { label: string; color?: string; value: string[] }[];

const closeWindow = () => {
  window.close();
};

function App() {
  // 脚本信息包括脚本代码、下载url、metadata等信息，通过service_worker的缓存获取
  const [scriptInfo, setScriptInfo] = useState<ScriptInfo>();
  // 是系统检测到脚本更新时打开的窗口会有一个倒计时
  const [countdown, setCountdown] = useState<number>(-1);
  // 脚本信息
  const [upsertScript, setUpsertScript] = useState<Script | Subscribe>();
  // 脚本代码
  const [code, setCode] = useState<string>("");
  // 对比代码
  const [diffCode, setDiffCode] = useState<string>();
  // 更新的情况下会有老版本的脚本信息
  const [oldScript, setOldScript] = useState<Script | Subscribe>();
  // 脚本开启状态
  const [enable, setEnable] = useState<boolean>(false);
  // 按钮文案
  const [btnText, setBtnText] = useState<string>("");
  // 是否是更新
  const [isUpdate, setIsUpdate] = useState<boolean>(false);
  const { t } = useTranslation();

  const metadata: Metadata = scriptInfo?.metadata || {};
  const permission: Permission = [];
  const description = [];
  if (scriptInfo) {
    if (scriptInfo.userSubscribe) {
      permission.push({
        label: t("subscribe_install_label"),
        color: "#ff0000",
        value: metadata.scripturl!,
      });
    }
    if (metadata.match) {
      permission.push({ label: t("script_runs_in"), value: metadata.match });
    }
    if (metadata.connect) {
      permission.push({
        label: t("script_has_full_access_to"),
        color: "#F9925A",
        value: metadata.connect,
      });
    }
    if (metadata.require) {
      permission.push({ label: t("script_requires"), value: metadata.require });
    }

    let isCookie = false;
    metadata.grant?.forEach((val) => {
      if (val === "GM_cookie") {
        isCookie = true;
      }
    });
    if (isCookie) {
      description.push(
        <Typography.Text type="error" key="cookie">
          {t("cookie_warning")}
        </Typography.Text>
      );
    }
    if (metadata.crontab) {
      description.push(<Typography.Text key="crontab">{t("scheduled_script_description_1")}</Typography.Text>);
      description.push(
        <Typography.Text key="cronta-nexttime">
          {t("scheduled_script_description_2", {
            expression: metadata.crontab[0],
            time: nextTime(metadata.crontab[0]),
          })}
        </Typography.Text>
      );
    } else if (metadata.background) {
      description.push(<Typography.Text key="background">{t("background_script_description")}</Typography.Text>);
    }
  }

  // 不推荐的内容标签与描述
  const antifeatures: {
    [key: string]: { color: string; title: string; description: string };
  } = {
    "referral-link": {
      color: "purple",
      title: t("antifeature_referral_link_title"),
      description: t("antifeature_referral_link_description"),
    },
    ads: {
      color: "orange",
      title: t("antifeature_ads_title"),
      description: t("antifeature_ads_description"),
    },
    payment: {
      color: "magenta",
      title: t("antifeature_payment_title"),
      description: t("antifeature_payment_description"),
    },
    miner: {
      color: "orangered",
      title: t("antifeature_miner_title"),
      description: t("antifeature_miner_description"),
    },
    membership: {
      color: "blue",
      title: t("antifeature_membership_title"),
      description: t("antifeature_membership_description"),
    },
    tracking: {
      color: "pinkpurple",
      title: t("antifeature_tracking_title"),
      description: t("antifeature_tracking_description"),
    },
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    scriptClient
      .getInstallInfo(uuid)
      .then(async (info: ScriptInfo) => {
        if (!info) {
          throw new Error("fetch script info failed");
        }
        // 如果是更新的情况下, 获取老版本的脚本信息
        let prepare:
          | { script: Script; oldScript?: Script; oldScriptCode?: string }
          | { subscribe: Subscribe; oldSubscribe?: Subscribe };
        let action: Script | Subscribe;
        if (info.userSubscribe) {
          prepare = await prepareSubscribeByCode(info.code, info.url);
          action = prepare.subscribe;
          setOldScript(prepare.oldSubscribe);
          setCode(prepare.subscribe.code);
          setDiffCode(prepare.oldSubscribe?.code);
          if (prepare.oldSubscribe) {
            setIsUpdate(true);
          }
        } else {
          if (info.update) {
            prepare = await prepareScriptByCode(info.code, info.url, info.uuid);
          } else {
            prepare = await prepareScriptByCode(info.code, info.url);
          }
          action = prepare.script;
          setOldScript(prepare.oldScript);
          setCode(info.code);
          setDiffCode(prepare.oldScriptCode);
          if (prepare.oldScript) {
            setIsUpdate(true);
          }
        }
        setScriptInfo(info);
        setEnable(action.status === SCRIPT_STATUS_ENABLE);
        setUpsertScript(action);
      })
      .catch((e: any) => {
        Message.error(t("script_info_load_failed") + " " + e.message);
      });
  }, [isUpdate, t]);

  useEffect(() => {
    if (scriptInfo?.userSubscribe) {
      setBtnText(isUpdate ? t("update_subscribe")! : t("install_subscribe"));
    } else {
      setBtnText(isUpdate ? t("update_script")! : t("install_script"));
    }
    // 修改网页显示title
    if (upsertScript) {
      document.title = `${!isUpdate ? t("install_script") : t("update_script")} - ${i18nName(upsertScript)} - ScriptCat`;
    }
  }, [isUpdate, scriptInfo, upsertScript, t]);

  return (
    <div className="h-full">
      <div className="h-full">
        <Grid.Row className="mb-2" gutter={8}>
          <Grid.Col flex={1} className="flex-col p-8px">
            <Space direction="vertical">
              <div>
                {upsertScript?.metadata.icon && (
                  <Avatar size={32} shape="square" style={{ marginRight: "8px" }}>
                    <img src={upsertScript.metadata.icon[0]} alt={upsertScript?.name} />
                  </Avatar>
                )}
                <Typography.Text bold className="text-size-lg">
                  {upsertScript && i18nName(upsertScript)}
                  <Tooltip
                    content={scriptInfo?.userSubscribe ? t("subscribe_source_tooltip") : t("script_status_tooltip")}
                  >
                    <Switch
                      style={{ marginLeft: "8px" }}
                      checked={enable}
                      onChange={(checked) => {
                        setUpsertScript((script) => {
                          if (!script) {
                            return script;
                          }
                          script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
                          setEnable(checked);
                          return script;
                        });
                      }}
                    />
                  </Tooltip>
                </Typography.Text>
              </div>
              <div>
                <Typography.Text bold>{upsertScript && i18nDescription(upsertScript)}</Typography.Text>
              </div>
              <div>
                <Typography.Text bold>
                  {t("author")}: {metadata.author}
                </Typography.Text>
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
                  {t("source")}: {scriptInfo?.url}
                </Typography.Text>
              </div>
              <div className="text-end">
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      if (!upsertScript) {
                        Message.error(t("script_info_load_failed")!);
                        return;
                      }
                      if (scriptInfo?.userSubscribe) {
                        subscribeClient
                          .install(upsertScript as Subscribe)
                          .then(() => {
                            Message.success(t("subscribe_success")!);
                            setBtnText(t("subscribe_success")!);
                            setTimeout(() => {
                              closeWindow();
                            }, 500);
                          })
                          .catch((e) => {
                            Message.error(`${t("subscribe_failed")}: ${e}`);
                          });
                        return;
                      }
                      scriptClient
                        .install(upsertScript as Script, code)
                        .then(() => {
                          if (isUpdate) {
                            Message.success(t("install.update_success")!);
                            setBtnText(t("install.update_success")!);
                          } else {
                            Message.success(t("install_success")!);
                            setBtnText(t("install_success")!);
                          }
                          setTimeout(() => {
                            closeWindow();
                          }, 500);
                        })
                        .catch((e) => {
                          Message.error(`${t("install_failed")}: ${e}`);
                        });
                    }}
                  >
                    {btnText}
                  </Button>
                  <Button
                    type="primary"
                    status="danger"
                    size="small"
                    onClick={() => {
                      if (countdown === -1) {
                        closeWindow();
                      } else {
                        setCountdown(-1);
                      }
                    }}
                  >
                    {countdown === -1 ? t("close") : `${t("stop")} (${countdown})`}
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
                    <Tooltip content={`${t("current_version")}: v${oldScript.metadata.version![0]}`}>
                      <Tag bordered>{oldScript.metadata.version![0]}</Tag>
                    </Tooltip>
                  )}
                  {metadata.version && (
                    <Tooltip color="red" content={`${t("update_version")}: v${metadata.version[0]}`}>
                      <Tag bordered color="red">
                        {metadata.version[0]}
                      </Tag>
                    </Tooltip>
                  )}
                  {(metadata.background || metadata.crontab) && (
                    <Tooltip color="green" content={t("background_script_tag")}>
                      <Tag bordered color="green">
                        {t("background_script")}
                      </Tag>
                    </Tooltip>
                  )}
                  {metadata.crontab && (
                    <Tooltip color="green" content={t("scheduled_script_tag")}>
                      <Tag bordered color="green">
                        {t("scheduled_script")}
                      </Tag>
                    </Tooltip>
                  )}
                  {metadata.antifeature &&
                    metadata.antifeature.map((antifeature) => {
                      const item = antifeature.split(" ")[0];
                      return (
                        antifeatures[item] && (
                          <Tooltip color={antifeatures[item].color} content={antifeatures[item].description}>
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
                <Typography.Text type="error">{t("install_from_legitimate_sources_warning")}</Typography.Text>
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
                      <Typography.Text style={{ wordBreak: "unset", color: item.color }}>{v}</Typography.Text>
                    </div>
                  ))}
                </Grid.Col>
              ))}
            </Grid.Row>
          </Grid.Col>
        </Grid.Row>
        <CodeEditor id="show-code" code={code || undefined} diffCode={diffCode || ""} />
      </div>
    </div>
  );
}

export default App;
