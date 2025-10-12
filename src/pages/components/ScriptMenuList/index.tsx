import React, { useEffect, useMemo, useState } from "react";
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
  IconPlus,
  IconSettings,
} from "@arco-design/web-react/icon";
import { SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";
import { RiPlayFill, RiStopFill } from "react-icons/ri";
import { useTranslation } from "react-i18next";
import { ScriptIcons } from "@App/pages/options/routes/utils";
import type {
  GroupScriptMenuItem,
  ScriptMenu,
  ScriptMenuItem,
  ScriptMenuItemOption,
} from "@App/app/service/service_worker/types";
import { popupClient, runtimeClient, scriptClient } from "@App/pages/store/features/script";
import { i18nName } from "@App/locales/locales";

const CollapseItem = Collapse.Item;

const sendMenuAction = (
  uuid: string,
  name: string,
  options: ScriptMenuItemOption | undefined,
  menus: ScriptMenuItem[],
  inputValue?: any
) => {
  Promise.allSettled(menus.map((menu) => popupClient.menuClick(uuid, menu, inputValue))).then(() => {
    options?.autoClose !== false && window.close();
  });
};

const FormItem = Form.Item;

type MenuItemProps = {
  menuItems: ScriptMenuItem[];
  uuid: string;
};

type GroupScriptMenuItemsProp = { group: GroupScriptMenuItem[]; menuUpdated: number };

const MenuItem = React.memo(({ menuItems, uuid }: MenuItemProps) => {
  const menuItem = menuItems[0];
  const { name, options } = menuItem;
  const initialValue = options?.inputDefaultValue;

  const InputMenu = (() => {
    const placeholder = options?.inputPlaceholder;

    switch (options?.inputType) {
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
        sendMenuAction(uuid, name, options, menuItems, inputValue);
      }}
    >
      <Button
        className="text-left"
        type="secondary"
        htmlType="submit"
        icon={<IconMenu />}
        title={options?.title}
        style={{ display: "block", width: "100%" }}
      >
        {name}
        {options?.accessKey && `(${options.accessKey.toUpperCase()})`}
      </Button>
      {InputMenu && (
        <FormItem
          label={options?.inputLabel}
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

interface CollapseHeaderProps {
  item: ScriptMenu;
  onEnableChange: (item: ScriptMenu, checked: boolean) => void;
}

const CollapseHeader = React.memo(
  ({ item, onEnableChange }: CollapseHeaderProps) => {
    const { t } = useTranslation();

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
  },
  (prevProps, nextProps) => {
    return prevProps.item === nextProps.item;
  }
);
CollapseHeader.displayName = "CollapseHeader";

interface ListMenuItemProps {
  item: ScriptMenu;
  scriptMenus: GroupScriptMenuItemsProp;
  menuExpandNum: number;
  isBackscript: boolean;
  url: URL | null;
  onEnableChange: (item: ScriptMenu, checked: boolean) => void;
  handleDeleteScript: (uuid: string) => void;
}

const ListMenuItem = React.memo(
  ({ item, scriptMenus, menuExpandNum, isBackscript, url, onEnableChange, handleDeleteScript }: ListMenuItemProps) => {
    const { t } = useTranslation();
    const [isEffective, setIsEffective] = useState<boolean | null>(item.isEffective);

    const [isExpand, setIsExpand] = useState<boolean>(false);

    const handleExpandMenu = () => {
      setIsExpand((e) => !e);
    };

    const visibleMenus = useMemo(() => {
      const m = scriptMenus?.group || [];
      return m.length > menuExpandNum && !isExpand ? m.slice(0, menuExpandNum) : m;
    }, [scriptMenus?.group, isExpand, menuExpandNum]);

    const shouldShowMore = useMemo(
      () => scriptMenus?.group?.length > menuExpandNum,
      [scriptMenus?.group, menuExpandNum]
    );

    const handleExcludeUrl = (uuid: string, excludePattern: string, isExclude: boolean) => {
      scriptClient.excludeUrl(uuid, excludePattern, isExclude).finally(() => {
        setIsEffective(isExclude);
      });
    };

    return (
      <Collapse bordered={false} expandIconPosition="right" key={item.uuid}>
        <CollapseItem
          header={<CollapseHeader item={item} onEnableChange={onEnableChange} />}
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
                  // 运行或停止脚本
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
            {url && isEffective !== null && (
              <Button
                className="text-left"
                status="warning"
                type="secondary"
                icon={!isEffective ? <IconPlus /> : <IconMinus />}
                onClick={() => handleExcludeUrl(item.uuid, `*://${url.host}/*`, !isEffective)}
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
          {/* 依数量与展开状态决定要显示的分组项（收合时只显示前 menuExpandNum 笔） */}
          {visibleMenus.map(({ uuid, groupKey, menus }) => {
            // 不同脚本之间可能出现相同的 groupKey；为避免 React key 冲突，需加上 uuid 做区分。
            return <MenuItem key={`${uuid}:${groupKey}`} menuItems={menus} uuid={uuid} />;
          })}
          {shouldShowMore && (
            <Button
              className="text-left"
              key="expand"
              type="secondary"
              icon={isExpand ? <IconCaretUp /> : <IconCaretDown />}
              onClick={handleExpandMenu}
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
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.url?.href === nextProps.url?.href &&
      prevProps.item === nextProps.item &&
      prevProps.isBackscript === nextProps.isBackscript &&
      prevProps.menuExpandNum === nextProps.menuExpandNum &&
      prevProps.scriptMenus?.menuUpdated === nextProps.scriptMenus?.menuUpdated
    );
  }
);

ListMenuItem.displayName = "ListMenuItem";

type TGrouppedMenus = Record<string, GroupScriptMenuItemsProp> & { __length__?: number };

// Popup 页面使用的脚本/选单清单元件：只负责渲染与互动，状态与持久化交由外部 client 处理。
const ScriptMenuList = React.memo(
  ({
    script,
    isBackscript,
    currentUrl,
    menuExpandNum,
  }: {
    script: (ScriptMenu & {
      menuUpdated?: number;
    })[];
    isBackscript: boolean;
    currentUrl: string;
    menuExpandNum: number;
  }) => {
    const [list, setList] = useState(
      [] as (ScriptMenu & {
        menuUpdated?: number;
      })[]
    );
    const { t } = useTranslation();

    const [grouppedMenus, setGrouppedMenus] = useState<TGrouppedMenus>({});

    // 依 groupKey 进行聚合：将同语义（mainframe/subframe）命令合并为单一分组以供 UI 呈现。
    useEffect(() => {
      const list_ = list;
      setGrouppedMenus((prev) => {
        const ret = {} as TGrouppedMenus;
        let changed = false;
        let retLen = 0;
        for (const { uuid, menus, menuUpdated: m } of list_) {
          retLen++;
          const menuUpdated = m || 0;
          if (prev[uuid]?.menuUpdated === menuUpdated) {
            ret[uuid] = prev[uuid];
            continue; // Skip if unchanged
          }

          const resultMap = new Map<string, ScriptMenuItem[]>();
          for (const menu of menus) {
            if (menu.options?.mSeparator) continue; // popup 不显示分隔线
            const groupKey = menu.groupKey.split(",")[0]; // popup 显示不区分二级菜单或三级菜单
            let m = resultMap.get(groupKey);
            if (!m) resultMap.set(groupKey, (m = []));
            m.push(menu);
          }

          const result = [];
          for (const [groupKey, arr] of resultMap) {
            result.push({ uuid, groupKey, menus: arr } as GroupScriptMenuItem);
          }

          // 输出以 uuid 分组存放；不依赖 list 的迭代顺序以避免不稳定渲染。
          ret[uuid] = { group: result, menuUpdated };
          changed = true;
        }
        ret.__length__ = retLen;
        if (!changed && ret.__length__ !== prev.__length__) changed = true;

        // 若无引用变更则维持原物件以降低重渲染
        return changed ? ret : prev;
      });
    }, [list]);

    const url = useMemo(() => {
      let url: URL;
      try {
        // 容错：当 currentUrl 为空或非法时改用预设 URL，避免 URL 解析抛错。
        const urlToUse = currentUrl?.trim() || "https://example.com";
        url = new URL(urlToUse);
      } catch (e: any) {
        console.error("Invalid URL:", e);
        // 提供预设 URL 以确保后续依赖 url 的流程不会中断。
        url = new URL("https://example.com");
      }
      return url;
    }, [currentUrl]);

    useEffect(() => {
      setList(script);
      // 注册菜单快速键（accessKey）：以各分组第一个项目的 accessKey 作为触发条件。
      const checkItems = new Map();
      for (const [_uuid, menus] of Object.entries(grouppedMenus)) {
        if (typeof menus !== "object") continue;
        for (const menu of menus.group) {
          const menuItem = menu.menus[0]; // 同一分组的语义一致，取首项即可读取 accessKey / name 等共用属性。
          const { name, options } = menuItem;
          const accessKey = options?.accessKey;
          if (typeof accessKey === "string") {
            checkItems.set(`${menu.uuid}:${menu.groupKey}`, [menu.uuid, accessKey.toUpperCase(), name, menu.menus]);
          }
        }
      }
      if (!checkItems.size) return;
      const sharedKeyPressListner = (e: KeyboardEvent) => {
        const keyUpper = e.key.toUpperCase();
        checkItems.forEach(([uuid, accessKeyUpper, name, menuItems]) => {
          if (keyUpper === accessKeyUpper) {
            // 快速键触发不需传递 options（autoClose 由 sendMenuAction 内部处理）。
            sendMenuAction(uuid, name, {}, menuItems);
          }
        });
      };
      document.addEventListener("keypress", sharedKeyPressListner);
      return () => {
        checkItems.clear();
        document.removeEventListener("keypress", sharedKeyPressListner);
      };
    }, [script, grouppedMenus]);

    const handleDeleteScript = (uuid: string) => {
      // 本地先行移除列表项（乐观更新）；若删除失败会显示错误讯息。
      scriptClient.deletes([uuid]).catch((e) => {
        Message.error(`${t("delete_failed")}: ${e}`);
      });
    };

    const onEnableChange = (item: ScriptMenu, checked: boolean) => {
      scriptClient.enable(item.uuid, checked).catch((err) => {
        Message.error(err);
      });
    };

    return (
      <>
        {list.length === 0 ? (
          <Empty description={t("no_data")} />
        ) : (
          list.map((item, _index) => (
            <ListMenuItem
              key={`${item.uuid}`}
              url={url}
              item={item}
              scriptMenus={grouppedMenus[item.uuid] || {}}
              isBackscript={isBackscript}
              onEnableChange={onEnableChange}
              handleDeleteScript={handleDeleteScript}
              menuExpandNum={menuExpandNum}
            />
          ))
        )}
      </>
    );
  }
);

ScriptMenuList.displayName = "ScriptMenuList";

export default ScriptMenuList;
