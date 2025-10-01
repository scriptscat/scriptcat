import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { type TScriptRunStatus } from "@App/app/service/queue";

const CollapseItem = Collapse.Item;

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

const MenuItem = React.memo(({ menu, uuid }: MenuItemProps) => {
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
  const menuName = menu.name.replace(/^\xA7+/, "").trim();
  if (!menuName) return <></>;
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
        {menuName}
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
});
MenuItem.displayName = "MenuItem";

// 用于popup页的脚本操作列表
const ScriptMenuList = React.memo(
  ({ script, isBackscript, currentUrl }: { script: ScriptMenu[]; isBackscript: boolean; currentUrl: string }) => {
    const [list, setList] = useState([] as ScriptMenu[]);
    const [expandMenuIndex, setExpandMenuIndex] = useState<{
      [key: string]: boolean;
    }>({});
    const { t } = useTranslation();
    const [menuExpandNum, setMenuExpandNum] = useState(5);

    let url: URL;
    try {
      // 如果currentUrl为空或无效，使用默认URL
      const urlToUse = currentUrl?.trim() || "https://example.com";
      url = new URL(urlToUse);
    } catch (e: any) {
      console.error("Invalid URL:", e);
      // 提供一个默认的URL，避免后续代码报错
      url = new URL("https://example.com");
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
        for (const listener of listeners) {
          document.removeEventListener("keypress", listener);
        }
      };
    }, [script]);

    useEffect(() => {
      let isMounted = true;
      // 监听脚本运行状态
      const unsub = messageQueue.subscribe<TScriptRunStatus>("scriptRunStatus", ({ uuid, runStatus }) => {
        if (!isMounted) return;
        setList((prevList) => prevList.map((item) => (item.uuid === uuid ? { ...item, runStatus } : item)));
      });
      // 获取配置
      systemConfig.getMenuExpandNum().then((num) => {
        if (!isMounted) return;
        setMenuExpandNum(num);
      });
      return () => {
        isMounted = false;
        unsub();
      };
    }, []);

    const handleEnableChange = useCallback((item: ScriptMenu, checked: boolean) => {
      scriptClient
        .enable(item.uuid, checked)
        .then(() => {
          setList((prevList) => prevList.map((item1) => (item1 === item ? { ...item1, enable: checked } : item1)));
        })
        .catch((err) => {
          Message.error(err);
        });
    }, []);

    const handleRunScript = useCallback((item: ScriptMenu) => {
      if (item.runStatus !== SCRIPT_RUN_STATUS_RUNNING) {
        runtimeClient.runScript(item.uuid);
      } else {
        runtimeClient.stopScript(item.uuid);
      }
    }, []);

    const handleEditScript = useCallback((uuid: string) => {
      window.open(`/src/options.html#/script/editor/${uuid}`, "_blank");
      window.close();
    }, []);

    const handleDeleteScript = useCallback((uuid: string) => {
      setList((prevList) => prevList.filter((i) => i.uuid !== uuid));
      scriptClient.deletes([uuid]).catch((e) => {
        Message.error(`{t('delete_failed')}: ${e}`);
      });
    }, []);

    const handleExpandMenu = useCallback((index: number) => {
      setExpandMenuIndex((prev) => ({
        ...prev,
        [index]: !prev[index],
      }));
    }, []);

    const handleOpenUserConfig = useCallback((uuid: string) => {
      window.open(`/src/options.html#/?userConfig=${uuid}`, "_blank");
      window.close();
    }, []);

    const CollapseHeader = React.memo(
      ({
        item,
        onEnableChange,
      }: {
        item: ScriptMenu;
        onEnableChange: (item: ScriptMenu, checked: boolean) => void;
      }) => {
        return (
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
              <Switch size="small" checked={item.enable} onChange={(checked) => onEnableChange(item, checked)} />
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
        );
      }
    );
    CollapseHeader.displayName = "CollapseHeader";

    const ListMenuItem = React.memo(({ item, index }: { item: ScriptMenu; index: number }) => {
      const [isEffective, setIsEffective] = useState<boolean | null>(item.isEffective);

      const visibleMenus = useMemo(() => {
        return item.menus.length > menuExpandNum && !expandMenuIndex[index]
          ? item.menus.slice(0, menuExpandNum)
          : item.menus;
      }, [item.menus, expandMenuIndex, index, menuExpandNum]);

      const isExpand = useMemo(() => expandMenuIndex[index], [expandMenuIndex, index]);

      const shouldShowMore = useMemo(() => item.menus.length > menuExpandNum, [item.menus, menuExpandNum]);

      const handleExcludeUrl = useCallback(
        (item: ScriptMenu, excludePattern: string, isExclude: boolean) => {
          scriptClient.excludeUrl(item.uuid, excludePattern, isExclude).finally(() => {
            setIsEffective(!isEffective);
          });
        },
        [item, isEffective]
      );

      return (
        <Collapse bordered={false} expandIconPosition="right" key={item.uuid}>
          <CollapseItem
            header={<CollapseHeader item={item} onEnableChange={handleEnableChange} />}
            name={item.uuid}
            contentStyle={{ padding: "0 0 0 40px" }}
          >
            <div className="flex flex-col">
              {isBackscript && (
                <Button
                  className="text-left"
                  type="secondary"
                  icon={item.runStatus !== SCRIPT_RUN_STATUS_RUNNING ? <RiPlayFill /> : <RiStopFill />}
                  onClick={() => handleRunScript(item)}
                >
                  {item.runStatus !== SCRIPT_RUN_STATUS_RUNNING ? t("run_once") : t("stop")}
                </Button>
              )}
              <Button
                className="text-left"
                type="secondary"
                icon={<IconEdit />}
                onClick={() => handleEditScript(item.uuid)}
              >
                {t("edit")}
              </Button>
              {url && isEffective !== null && (
                <Button
                  className="text-left"
                  status="warning"
                  type="secondary"
                  icon={<IconMinus />}
                  onClick={() => handleExcludeUrl(item, `*://${url.host}/*`, !isEffective)}
                >
                  {(!isEffective ? t("exclude_on") : t("exclude_off")).replace("$0", `${url.host}`)}
                </Button>
              )}
              <Popconfirm
                title={t("confirm_delete_script")}
                icon={<IconDelete />}
                onOk={() => handleDeleteScript(item.uuid)}
              >
                <Button className="text-left" status="danger" type="secondary" icon={<IconDelete />}>
                  {t("delete")}
                </Button>
              </Popconfirm>
            </div>
          </CollapseItem>
          <div className="arco-collapse-item-content-box flex flex-col" style={{ padding: "0 0 0 40px" }}>
            {/* 判断菜单数量，再判断是否展开 */}
            {visibleMenus.map((menu) => {
              return <MenuItem key={menu.id} menu={menu} uuid={item.uuid} />;
            })}
            {shouldShowMore && (
              <Button
                className="text-left"
                key="expand"
                type="secondary"
                icon={isExpand ? <IconCaretUp /> : <IconCaretDown />}
                onClick={() => handleExpandMenu(index)}
              >
                {isExpand ? t("collapse") : t("expand")}
              </Button>
            )}
            {item.hasUserConfig && (
              <Button
                className="text-left"
                key="config"
                type="secondary"
                icon={<IconSettings />}
                onClick={() => handleOpenUserConfig(item.uuid)}
              >
                {t("user_config")}
              </Button>
            )}
          </div>
        </Collapse>
      );
    });

    ListMenuItem.displayName = "ListMenuItem";

    // 使用 useCallback 来缓存渲染函数，避免每次渲染都创建新的函数实例
    const renderListItem = useCallback(
      ({ item, index }: { item: ScriptMenu; index: number }) => (
        <ListMenuItem key={`${item.uuid}`} item={item} index={index} />
      ),
      []
    );

    return (
      <>
        {list.length === 0 && <Empty description={t("no_data")} />}
        {list.map((item, index) => renderListItem({ item, index }))}
      </>
    );
  }
);

ScriptMenuList.displayName = "ScriptMenuList";

export default ScriptMenuList;
