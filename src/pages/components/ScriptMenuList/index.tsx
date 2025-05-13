import React, { useEffect, useState } from "react";
import { Button, Collapse, Empty, Message, Popconfirm, Space, Switch } from "@arco-design/web-react";
import {
  IconCaretDown,
  IconCaretUp,
  IconDelete,
  IconEdit,
  IconMenu,
  IconMinus,
  IconSettings,
} from "@arco-design/web-react/icon";
import { SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";
import { RiPlayFill, RiStopFill } from "react-icons/ri";
import { useTranslation } from "react-i18next";
import { ScriptIcons } from "@App/pages/options/routes/utils";
import { ScriptMenu, ScriptMenuItem } from "@App/app/service/service_worker/popup";
import { useAppSelector } from "@App/pages/store/hooks";
import { popupClient, runtimeClient, scriptClient } from "@App/pages/store/features/script";
import { i18nName } from "@App/locales/locales";
import { subscribeScriptRunStatus } from "@App/app/service/queue";
import { messageQueue, systemConfig } from "@App/pages/store/global";

const CollapseItem = Collapse.Item;

function isExclude(script: ScriptMenu, host: string) {
  if (!script.customExclude) {
    return false;
  }
  for (let i = 0; i < script.customExclude.length; i += 1) {
    if (script.customExclude[i] === `*://${host}/*`) {
      return true;
    }
  }
  return false;
}

// 用于popup页的脚本操作列表
const ScriptMenuList: React.FC<{
  script: ScriptMenu[];
  isBackscript: boolean;
  currentUrl: string;
}> = ({ script, isBackscript, currentUrl }) => {
  const [list, setList] = useState([] as ScriptMenu[]);
  const [expandMenuIndex, setExpandMenuIndex] = useState<{
    [key: string]: boolean;
  }>({});
  const { t } = useTranslation();
  const [menuExpandNum, setMenuExpandNum] = useState(5);

  let url: URL;
  try {
    url = new URL(currentUrl);
  } catch (e: any) {
    console.error("Invalid URL:", e);
  }
  useEffect(() => {
    setList(script);
  }, [script]);

  useEffect(() => {
    // 监听脚本运行状态
    const unsub = subscribeScriptRunStatus(messageQueue, ({ uuid, runStatus }) => {
      setList((prev) => {
        const newList = [...prev];
        const index = newList.findIndex((item) => item.uuid === uuid);
        if (index !== -1) {
          newList[index].runStatus = runStatus;
        }
        return newList;
      });
    });
    // 获取配置
    systemConfig.getMenuExpandNum().then((num) => {
      setMenuExpandNum(num);
    });
    return () => {
      unsub();
    };
  }, []);

  const sendMenuAction = (uuid: string, menu: ScriptMenuItem) => {
    popupClient.menuClick(uuid, menu).then(() => {
      window.close();
    });
  };

  return (
    <>
      {list.length === 0 && <Empty />}
      {list.map((item, index) => (
        <Collapse bordered={false} expandIconPosition="right" key={item.uuid}>
          <CollapseItem
            header={
              <div
                onClick={(e) => {
                  e.stopPropagation();
                }}
                title={
                  item.enable
                    ? item.runNumByIframe
                      ? t("script_total_runs", {
                          runNum: item.runNum,
                          runNumByIframe: item.runNumByIframe,
                        })!
                      : t("script_total_runs_single", { runNum: item.runNum })!
                    : t("script_disabled")!
                }
              >
                <Space>
                  <Switch
                    size="small"
                    checked={item.enable}
                    onChange={(checked) => {
                      scriptClient
                        .enable(item.uuid, checked)
                        .then(() => {
                          item.enable = checked;
                          setList([...list]);
                        })
                        .catch((err) => {
                          Message.error(err);
                        });
                    }}
                  />
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: item.runNum === 0 ? "rgb(var(--gray-5))" : "",
                      lineHeight: "20px",
                    }}
                  >
                    <ScriptIcons script={item} size={20} />
                    {i18nName(item)}
                  </span>
                </Space>
              </div>
            }
            name={item.uuid}
            contentStyle={{ padding: "0 0 0 40px" }}
          >
            <div className="flex flex-col">
              {isBackscript && (
                <Button
                  className="text-left"
                  type="secondary"
                  icon={item.runStatus !== SCRIPT_RUN_STATUS_RUNNING ? <RiPlayFill /> : <RiStopFill />}
                  onClick={() => {
                    if (item.runStatus !== SCRIPT_RUN_STATUS_RUNNING) {
                      runtimeClient.runScript(item.uuid);
                    } else {
                      runtimeClient.stopScript(item.uuid);
                    }
                  }}
                >
                  {item.runStatus !== SCRIPT_RUN_STATUS_RUNNING ? t("run_once") : t("stop")}
                </Button>
              )}
              <Button
                className="text-left"
                type="secondary"
                icon={<IconEdit />}
                onClick={() => {
                  window.open(`/src/options.html#/script/editor/${item.uuid}`, "_blank");
                  window.close();
                }}
              >
                {t("edit")}
              </Button>
              {url && (
                <Button
                  className="text-left"
                  status="warning"
                  type="secondary"
                  icon={<IconMinus />}
                  onClick={() => {
                    scriptClient.excludeUrl(item.uuid, `*://${url.host}/*`, isExclude(item, url.host)).finally(() => {
                      window.close();
                    });
                  }}
                >
                  {isExclude(item, url.host) ? t("exclude_on") : t("exclude_off")}
                  {` ${url.host} ${t("exclude_execution")}`}
                </Button>
              )}
              <Popconfirm
                title={t("confirm_delete_script")}
                icon={<IconDelete />}
                onOk={() => {
                  setList(list.filter((i) => i.uuid !== item.uuid));
                  scriptClient.delete(item.uuid).catch((e) => {
                    Message.error(`{t('delete_failed')}: ${e}`);
                  });
                }}
              >
                <Button className="text-left" status="danger" type="secondary" icon={<IconDelete />}>
                  {t("delete")}
                </Button>
              </Popconfirm>
            </div>
          </CollapseItem>
          <div className="arco-collapse-item-content-box flex flex-col" style={{ padding: "0 0 0 40px" }}>
            {/* 判断菜单数量，再判断是否展开 */}
            {(item.menus.length > menuExpandNum
              ? expandMenuIndex[index]
                ? item.menus
                : item.menus?.slice(0, menuExpandNum)
              : item.menus
            )?.map((menu) => {
              if (menu.accessKey) {
                document.addEventListener("keypress", (e) => {
                  if (e.key.toUpperCase() === menu.accessKey!.toUpperCase()) {
                    sendMenuAction(item.uuid, menu);
                  }
                });
              }
              return (
                <Button
                  className="text-left"
                  key={menu.id}
                  type="secondary"
                  icon={<IconMenu />}
                  onClick={() => {
                    sendMenuAction(item.uuid, menu);
                  }}
                >
                  {menu.name}
                  {menu.accessKey && `(${menu.accessKey.toUpperCase()})`}
                </Button>
              );
            })}
            {item.menus.length > menuExpandNum && (
              <Button
                className="text-left"
                key="expand"
                type="secondary"
                icon={expandMenuIndex[index] ? <IconCaretUp /> : <IconCaretDown />}
                onClick={() => {
                  setExpandMenuIndex({
                    ...expandMenuIndex,
                    [index]: !expandMenuIndex[index],
                  });
                }}
              >
                {expandMenuIndex[index] ? t("collapse") : t("expand")}
              </Button>
            )}
            {item.hasUserConfig && (
              <Button
                className="text-left"
                key="config"
                type="secondary"
                icon={<IconSettings />}
                onClick={() => {
                  window.open(`/src/options.html#/?userConfig=${item.uuid}`, "_blank");
                  window.close();
                }}
              >
                {t("user_config")}
              </Button>
            )}
          </div>
        </Collapse>
      ))}
    </>
  );
};

export default ScriptMenuList;
