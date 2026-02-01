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
import type { SCMetadata } from "@App/app/repo/scripts";
import { SCRIPT_RUN_STATUS_RUNNING, ScriptDAO } from "@App/app/repo/scripts";
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

// 用于读取 metadata
const scriptDAO = new ScriptDAO();

const CollapseItem = Collapse.Item;

const sendMenuAction = (
  uuid: string,
  options: ScriptMenuItemOption | undefined,
  menus: ScriptMenuItem[],
  inputValue?: any
) => {
  popupClient.menuClick(uuid, menus, inputValue).then(() => {
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
        sendMenuAction(uuid, options, menuItems, inputValue);
      }}
    >
      <Button
        className="tw-text-left"
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
  item: ScriptMenuEntry;
  onEnableChange: (item: ScriptMenuEntry, checked: boolean) => void;
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
  item: ScriptMenuEntry;
  scriptMenus: GroupScriptMenuItemsProp;
  menuExpandNum: number;
  isBackscript: boolean;
  url: URL | null;
  onEnableChange: (item: ScriptMenuEntry, checked: boolean) => void;
  handleDeleteScript: (uuid: string) => void;
}

const ListMenuItem = React.memo(
  ({ item, scriptMenus, menuExpandNum, isBackscript, url, onEnableChange, handleDeleteScript }: ListMenuItemProps) => {
    const { t } = useTranslation();
    const [isEffective, setIsEffective] = useState<boolean | null>(item.isEffective);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isExpand, setIsExpand] = useState<boolean>(false);

    const handleExpandMenu = () => {
      setIsExpand((e) => !e);
    };

    const visibleMenus = useMemo(() => {
      // 当menuExpandNum为0时，跟随 isActive 状态显示全部菜单
      const m = scriptMenus?.group || [];
      if (menuExpandNum === 0 && isActive) {
        return m;
      }
      return m.length > menuExpandNum && !isExpand ? m.slice(0, menuExpandNum) : m;
    }, [scriptMenus?.group, isExpand, menuExpandNum, isActive]);

    const shouldShowMore = useMemo(
      () => menuExpandNum > 0 && scriptMenus?.group?.length > menuExpandNum,
      [scriptMenus?.group, menuExpandNum]
    );

    const handleExcludeUrl = (uuid: string, excludePattern: string, isExclude: boolean) => {
      scriptClient.excludeUrl(uuid, excludePattern, isExclude).finally(() => {
        setIsEffective(isExclude);
      });
    };

    // console.log("Rendered - " + item.name); // 用于检查垃圾React有否过度更新

    return (
      <Collapse
        activeKey={isActive ? item.uuid : undefined}
        onChange={(_, keys) => {
          setIsActive(keys.includes(item.uuid));
        }}
        bordered={false}
        expandIconPosition="right"
        key={item.uuid}
      >
        <CollapseItem
          header={<CollapseHeader item={item} onEnableChange={onEnableChange} />}
          name={item.uuid}
          contentStyle={{ padding: "0 0 0 40px" }}
        >
          <div className="tw-flex tw-flex-col">
            {isBackscript && (
              <Button
                className="tw-text-left"
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
              className="tw-text-left"
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
                className="tw-text-left"
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
              <Button className="tw-text-left" status="danger" type="secondary" icon={<IconDelete />}>
                {t("delete")}
              </Button>
            </Popconfirm>
          </div>
        </CollapseItem>
        <div className="arco-collapse-item-content-box tw-flex tw-flex-col" style={{ padding: "0 0 0 40px" }}>
          {/* 依数量与展开状态决定要显示的分组项（收合时只显示前 menuExpandNum 笔） */}
          {visibleMenus.map(({ uuid, groupKey, menus }) => {
            // 不同脚本之间可能出现相同的 groupKey；为避免 React key 冲突，需加上 uuid 做区分。
            return <MenuItem key={`${uuid}:${groupKey}`} menuItems={menus} uuid={uuid} />;
          })}
          {shouldShowMore && (
            <Button
              className="tw-text-left"
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
              className="tw-text-left"
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

type ScriptMenuEntryBase = ScriptMenu & {
  menuUpdated?: number;
};

// ScriptMenuEntryBase 加了 metadata 后变成 ScriptMenuEntry
type ScriptMenuEntry = ScriptMenuEntryBase & {
  metadata: SCMetadata;
};

const cacheMetadata = new Map<string, SCMetadata | undefined>();
// 使用 WeakMap：当 ScriptMenuEntryBase 替换后，ScriptMenuEntryBase的引用会失去，ScriptMenuEntry能被自动回收。
const cacheMergedItem = new WeakMap<ScriptMenuEntryBase, ScriptMenuEntry>();
// scriptList 更新后会合并 从异步取得的 metadata 至 mergedList
const fetchMergedList = async (item: ScriptMenuEntryBase) => {
  const uuid = item.uuid;
  // 检查 cacheMetadata 有没有记录
  let metadata = cacheMetadata.get(uuid);
  if (!metadata) {
    // 如没有记录，对 scriptDAO 发出请求 （通常在首次React元件绘画时进行）
    const script = await scriptDAO.get(uuid);
    metadata = script?.metadata || {}; // 即使 scriptDAO 返回失败也 fallback 一个空物件
    cacheMetadata.set(uuid, metadata);
  }
  // 检查 cacheMergedItem 有没有记录
  let merged = cacheMergedItem.get(item);
  if (!merged || merged.uuid !== item.uuid) {
    // 如没有记录或记录不正确，则重新生成记录 （新物件参考）
    merged = { ...item, metadata };
    cacheMergedItem.set(item, merged);
  }
  // 如 cacheMergedItem 的记录中的 metadata 跟 (新)metadata 物件参考不一致，则更新 merged
  if (merged.metadata !== metadata) {
    // 新物件参考触发 React UI 重绘
    merged = { ...merged, metadata: metadata };
    cacheMergedItem.set(item, merged);
  }
  return merged;
};

// Popup 页面使用的脚本/选单清单元件：只负责渲染与互动，状态与持久化交由外部 client 处理。
const ScriptMenuList = React.memo(
  ({
    script,
    isBackscript,
    currentUrl,
    menuExpandNum,
  }: {
    script: ScriptMenuEntryBase[];
    isBackscript: boolean;
    currentUrl: string;
    menuExpandNum: number;
  }) => {
    const [scriptMenuList, setScriptMenuList] = useState<ScriptMenuEntry[]>([]);
    const { t } = useTranslation();

    const [grouppedMenus, setGrouppedMenus] = useState<TGrouppedMenus>({});

    const updateScriptMenuList = (scriptMenuList: ScriptMenuEntry[]) => {
      setScriptMenuList(scriptMenuList);
      // 因为 scriptMenuList 的修改只在这处。
      // 直接在这里呼叫 setGrouppedMenus, 不需要 useEffect
      setGrouppedMenus((prev) => {
        // 依 groupKey 进行聚合：将同语义（mainframe/subframe）命令合并为单一分组以供 UI 呈现。
        const ret = {} as TGrouppedMenus;
        let changed = false;
        let retLen = 0;
        for (const { uuid, menus, menuUpdated: m } of scriptMenuList) {
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
    };

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
      let isMounted = true;
      Promise.all(script.map(fetchMergedList)).then((newList) => {
        if (!isMounted) {
          return;
        }
        updateScriptMenuList(newList);
      });
      return () => {
        isMounted = false;
      };
    }, [script]);

    useEffect(() => {
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
        checkItems.forEach(([uuid, accessKeyUpper, _name, menuItems]) => {
          if (keyUpper === accessKeyUpper) {
            // 快速键触发不需传递 options（autoClose 由 sendMenuAction 内部处理）。
            sendMenuAction(uuid, {}, menuItems);
          }
        });
      };
      document.addEventListener("keypress", sharedKeyPressListner);
      return () => {
        checkItems.clear();
        document.removeEventListener("keypress", sharedKeyPressListner);
      };
    }, [grouppedMenus]);

    const handleDeleteScript = (uuid: string) => {
      // 本地先行移除列表项（乐观更新）；若删除失败会显示错误讯息。
      scriptClient.deletes([uuid]).catch((e) => {
        Message.error(`${t("delete_failed")}: ${e}`);
      });
    };

    const onEnableChange = (item: ScriptMenuEntry, checked: boolean) => {
      scriptClient.enable(item.uuid, checked).catch((err) => {
        Message.error(err);
      });
    };

    return (
      <>
        {scriptMenuList.length === 0 ? (
          <Empty description={t("no_data")} />
        ) : (
          scriptMenuList.map((item, _index) => (
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
