import React, { useEffect, useState } from "react";
import {
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Space,
  Switch,
} from "@arco-design/web-react";
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
import type { ScriptMenu, ScriptMenuItem } from "@App/app/service/service_worker/types";
import { popupClient, runtimeClient, scriptClient } from "@App/pages/store/features/script";
import { messageQueue, systemConfig } from "@App/pages/store/global";
import { i18nName } from "@App/locales/locales";
import { subscribeScriptRunStatus } from "@App/app/service/queue";

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
    // 注册菜单快捷键
    const listeners: ((e: KeyboardEvent) => void)[] = [];
    script.forEach((item) => {
      item.menus.forEach((menu) => {
        if (menu.options?.accessKey) {
          const listener = (e: KeyboardEvent) => {
            if (e.key.toUpperCase() === menu.options!.accessKey!.toUpperCase()) {
              sendMenuAction(item.uuid, menu);
            }
          };
          document.addEventListener("keypress", listener);
          listeners.push(listener);
        }
      });
    });
    return () => {
      listeners.forEach((listener) => {
        document.removeEventListener("keypress", listener);
      });
    };
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

  return (
    <>
      {list.length === 0 && <Empty description={t("no_data")} />}
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
              console.log("menu", menu);
              return <MenuItem key={menu.id} menu={menu} uuid={item.uuid} />;
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

const sendMenuAction = (uuid: string, menu: ScriptMenuItem, inputValue?: any) => {
  popupClient.menuClick(uuid, menu, inputValue).then(() => {
    menu.options?.autoClose !== false && window.close();
  });
};

const FormItem = Form.Item;

type MenuItemProps = {
  menu: ScriptMenuItem;
  uuid: string;
};

const MenuItem: React.FC<MenuItemProps> = ({ menu, uuid }) => {
  const initialValue = menu.options?.inputDefaultValue;

  const InputMenu = (() => {
    const placeholder = menu.options?.inputPlaceholder;

    switch (menu.options?.inputType) {
      case "text":
        return <Input type="text" placeholder={placeholder} />;
      case "number":
        return <InputNumber placeholder={placeholder} />;
      case "boolean":
        return <Switch defaultChecked={initialValue as boolean} />;
      default:
        return null;
    }
  })();

  return (
    <Form
      initialValues={{ inputValue: initialValue }}
      size="small"
      labelCol={{ flex: "none" }}
      wrapperCol={{ flex: "none" }}
      autoComplete="off"
      onSubmit={(v) => {
        const inputValue = v.inputValue;
        console.log(v);
        sendMenuAction(uuid, menu, inputValue);
      }}
    >
      <Button
        className="text-left"
        type="secondary"
        htmlType="submit"
        icon={<IconMenu />}
        title={menu.options?.title}
        style={{ display: "block", width: "100%" }}
      >
        {menu.name}
        {menu.options?.accessKey && `(${menu.options.accessKey.toUpperCase()})`}
      </Button>
      {InputMenu && (
        <FormItem
          label={menu.options?.inputLabel}
          field="inputValue"
          style={{ marginTop: 5, marginBottom: 5, paddingLeft: 20 }}
        >
          {InputMenu}
        </FormItem>
      )}
    </Form>
  );
};

export default ScriptMenuList;
