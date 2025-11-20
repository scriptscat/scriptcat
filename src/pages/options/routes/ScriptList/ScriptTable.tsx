import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Divider,
  Dropdown,
  Input,
  Menu,
  Message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import type { ComponentsProps } from "@arco-design/web-react/es/Table/interface";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import { FaThLarge } from "react-icons/fa";
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from "react-icons/vsc";
import {
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { IconClockCircle, IconDragDotVertical, IconSearch } from "@arco-design/web-react/icon";
import {
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiSettings3Fill,
  RiStopFill,
  RiUploadCloudFill,
} from "react-icons/ri";
import { Link, useNavigate } from "react-router-dom";
import type { RefInputType } from "@arco-design/web-react/es/Input/interface";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { nextTime } from "@App/pkg/utils/cron";
import { systemConfig } from "@App/pages/store/global";
import { i18nName } from "@App/locales/locales";
import { hashColor, ScriptIcons } from "../utils";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { requestEnableScript, pinToTop, scriptClient, synchronizeClient } from "@App/pages/store/features/script";
import { type TFunction } from "i18next";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { parseTags } from "@App/app/repo/metadata";
import { EnableSwitch, HomeCell, MemoizedAvatar, SourceCell, UpdateTimeCell } from "./components";

type ListType = ScriptLoading;

type RowCtx = ReturnType<typeof useSortable> | null;
const SortableRowCtx = createContext<RowCtx>(null);

// Create context for DraggableContainer
interface DraggableContextType {
  sensors: ReturnType<typeof useSensors>;
  scriptList: ScriptLoading[];
  scriptListSortOrder: (params: { active: string; over: string }) => void;
}
const DraggableContext = createContext<DraggableContextType | null>(null);

const DraggableContainer = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  (props, ref) => {
    const context = useContext(DraggableContext);
    const { sensors, scriptList, scriptListSortOrder } = context || {};
    // compute once, even if context is null (keeps hook order legal)
    const sortableIds = useMemo(() => scriptList?.map((s) => ({ id: s.uuid })), [scriptList]);

    const { handleDragEnd } = {
      handleDragEnd: (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) {
          return;
        }
        if (active.id !== over.id) {
          scriptListSortOrder!({ active: active.id as string, over: over.id as string });
        }
      },
    };

    return !sortableIds?.length ? (
      // render a plain tbody to keep the table structure intact
      <tbody ref={ref} {...props} />
    ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{ container: document.body }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <tbody ref={ref} {...props} />
        </SortableContext>
      </DndContext>
    );
  }
);

DraggableContainer.displayName = "DraggableContainer";

const FilterDropdown = React.memo(
  ({
    filterKeys,
    setFilterKeys,
    confirm,
    t,
    inputRef,
  }: {
    filterKeys: string;
    setFilterKeys: (filterKeys: string, callback?: (...args: any[]) => any) => void;
    confirm: (...args: any[]) => any;
    t: TFunction<"translation", undefined>;
    inputRef: React.RefObject<RefInputType>;
  }) => {
    const { onSearchChange } = {
      onSearchChange: (value: string) => {
        setFilterKeys(value);
      },
    };
    // onSearch 不能使用 useCallback / useMemo
    const onSearch = () => {
      confirm(filterKeys);
    };
    return (
      <div className="arco-table-custom-filter flex flex-row gap-2">
        <Input.Search
          ref={inputRef}
          size="small"
          searchButton
          style={{ minWidth: 240 }}
          placeholder={t("enter_search_value", { search: `${t("name")}/${t("script_code")}` })}
          defaultValue={filterKeys || ""}
          onChange={onSearchChange}
          onSearch={onSearch}
        />
      </div>
    );
  }
);
FilterDropdown.displayName = "FilterDropdown";

function composeRefs<T>(...refs: React.Ref<T>[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

const DraggableRow = React.memo(
  React.forwardRef<HTMLTableRowElement, { record: any; index: any } & React.HTMLAttributes<HTMLTableRowElement>>(
    ({ record, index: _index, ...rest }, ref) => {
      const sortable = useSortable({ id: record.uuid });
      const { setNodeRef, transform, transition } = sortable;

      const style = {
        transform: CSS.Transform.toString(transform),
        transition,
      };

      return (
        <SortableRowCtx.Provider value={sortable}>
          <tr ref={composeRefs(setNodeRef, ref)} style={style} {...rest} />
        </SortableRowCtx.Provider>
      );
    }
  )
);
DraggableRow.displayName = "DraggableRow";

const DragHandle = () => {
  const sortable = useContext(SortableRowCtx);

  if (!sortable)
    return (
      <IconDragDotVertical
        style={{
          cursor: "move",
        }}
      />
    );

  const { listeners, setActivatorNodeRef } = sortable;

  return (
    <IconDragDotVertical
      {...listeners}
      ref={setActivatorNodeRef}
      style={{
        cursor: "move",
      }}
    />
  );
};

const ApplyToRunStatusCell = React.memo(({ item, navigate, t }: { item: ListType; navigate: any; t: any }) => {
  const { toLogger } = {
    toLogger: () =>
      navigate({
        pathname: "logger",
        search: `query=${encodeURIComponent(
          JSON.stringify([
            { key: "uuid", value: item.uuid },
            {
              key: "component",
              value: "GM_log",
            },
          ])
        )}`,
      }),
  };

  const favoriteMemo = useMemo(() => {
    const fav1 = item.favorite;
    const fav2 = !fav1
      ? []
      : fav1
          .slice()
          .sort((a, b) => (a.icon && !b.icon ? -1 : !a.icon && b.icon ? 1 : a.match.localeCompare(b.match)))
          .slice(0, 4);
    return {
      trimmed: fav2,
      originalLen: fav1?.length ?? 0,
    };
  }, [item.favorite]);

  if (item.type === SCRIPT_TYPE_NORMAL) {
    return (
      <>
        <Avatar.Group size={20}>
          {favoriteMemo.trimmed.map((fav) => (
            <MemoizedAvatar
              key={`${fav.match}_${fav.icon}_${fav.website}`}
              {...fav}
              onClick={() => {
                if (fav.website) {
                  window.open(fav.website, "_blank");
                }
              }}
            />
          ))}
          {favoriteMemo.originalLen > 4 && "..."}
        </Avatar.Group>
      </>
    );
  }
  let tooltip = "";
  if (item.type === SCRIPT_TYPE_BACKGROUND) {
    tooltip = t("background_script_tooltip");
  } else {
    tooltip = `${t("scheduled_script_tooltip")} ${nextTime(item.metadata!.crontab![0])}`;
  }
  return (
    <>
      <Tooltip content={tooltip}>
        <Tag
          icon={<IconClockCircle />}
          color="blue"
          bordered
          style={{
            cursor: "pointer",
          }}
          onClick={toLogger}
        >
          {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("running") : t("completed")}
        </Tag>
      </Tooltip>
    </>
  );
});
ApplyToRunStatusCell.displayName = "ApplyToRunStatusCell";

const ActionCell = React.memo(
  ({
    item,
    setUserConfig,
    setCloudScript,
    t,
    handleDelete,
    handleConfig,
    handleRunStop,
  }: {
    item: ScriptLoading;
    setUserConfig: any;
    setCloudScript: any;
    t: any;
    handleDelete: (item: ScriptLoading) => void;
    handleConfig: (
      item: ScriptLoading,
      setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
    ) => void;
    handleRunStop: (item: ScriptLoading, t: any) => Promise<void>;
  }) => {
    return (
      <Button.Group>
        <Link to={`/script/editor/${item.uuid}`}>
          <Button
            type="text"
            icon={<RiPencilFill />}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        </Link>
        <Popconfirm title={t("confirm_delete_script")} icon={<RiDeleteBin5Fill />} onOk={() => handleDelete(item)}>
          <Button
            type="text"
            icon={<RiDeleteBin5Fill />}
            loading={item.actionLoading}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        </Popconfirm>
        {item.config && (
          <Button
            type="text"
            icon={<RiSettings3Fill />}
            onClick={() => handleConfig(item, setUserConfig)}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
        {item.type !== SCRIPT_TYPE_NORMAL && (
          <Button
            type="text"
            icon={item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? <RiStopFill /> : <RiPlayFill />}
            loading={item.actionLoading}
            onClick={() => handleRunStop(item, t)}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
        {item.metadata.cloudcat && (
          <Button
            type="text"
            icon={<RiUploadCloudFill />}
            onClick={() => setCloudScript(item, setCloudScript)}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
      </Button.Group>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.item === nextProps.item && prevProps.t === nextProps.t;
  }
);
ActionCell.displayName = "ActionCell";

// 提取render函数以避免每次渲染时重新创建
const SortRender = React.memo(({ col }: { col: number }) => {
  if (col < 0) {
    return "-";
  }
  return col + 1;
});
SortRender.displayName = "SortRender";

const EnableSwitchCell = React.memo(
  ({ item, updateScripts }: { item: ScriptLoading; updateScripts: any }) => {
    const { uuid } = item;
    return (
      <EnableSwitch
        status={item.status}
        enableLoading={item.enableLoading}
        onChange={(checked: boolean) => {
          updateScripts([uuid], { enableLoading: true });
          requestEnableScript({ uuid: uuid, enable: checked });
        }}
      />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.item === nextProps.item;
  }
);
EnableSwitchCell.displayName = "EnableSwitchCell";

const NameCell = React.memo(({ col, item }: { col: string; item: ListType }) => {
  const { tags } = useMemo(() => {
    let metadata = item.metadata;
    if (item.selfMetadata) {
      metadata = getCombinedMeta(item.metadata, item.selfMetadata);
    }
    return { tags: parseTags(metadata) || [] };
  }, [item.metadata, item.selfMetadata]);
  return (
    <Tooltip content={col} position="tl">
      <Link
        to={`/script/editor/${item.uuid}`}
        style={{
          textDecoration: "none",
        }}
      >
        <Typography.Text
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: "20px",
          }}
        >
          <ScriptIcons script={item} size={20} />
          {i18nName(item)}
          {tags && (
            <Space style={{ marginLeft: 8 }}>
              {tags.map((t) => (
                <Tag key={t} color={hashColor(t)}>
                  {t}
                </Tag>
              ))}
            </Space>
          )}
        </Typography.Text>
      </Link>
    </Tooltip>
  );
});
NameCell.displayName = "NameCell";

const VersionCell = React.memo(({ item }: { item: ListType }) => {
  return item.metadata.version && item.metadata.version[0];
});
VersionCell.displayName = "VersionCell";

interface ScriptTableProps {
  loadingList: boolean;
  scriptList: ScriptLoading[];
  scriptListSortOrder: (params: { active: string; over: string }) => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setViewMode: (mode: "card" | "table") => void;
  updateScripts: (uuids: string[], data: Partial<Script | ScriptLoading>) => void;
  setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
  setCloudScript: (script: Script) => void;
  setSearchKeyword: (keyword: string) => void;
  handleDelete: (item: ScriptLoading) => void;
  handleConfig: (
    item: ScriptLoading,
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
  ) => void;
  handleRunStop: (item: ScriptLoading) => Promise<void>;
}

export const ScriptTable = ({
  loadingList,
  scriptList,
  scriptListSortOrder,
  sidebarOpen,
  setSidebarOpen,
  setViewMode,
  updateScripts,
  setUserConfig,
  setCloudScript,
  setSearchKeyword,
  handleDelete,
  handleConfig,
  handleRunStop,
}: ScriptTableProps) => {
  const { t } = useTranslation();
  const [showAction, setShowAction] = useState(false);
  const [action, setAction] = useState("");
  const [select, setSelect] = useState<Script[]>([]);
  const [selectColumn, setSelectColumn] = useState(0);
  const inputRef = useRef<RefInputType>(null);
  const navigate = useNavigate();
  const [savedWidths, setSavedWidths] = useState<{ [key: string]: number } | null>(null);

  const columns: ColumnProps[] = useMemo(
    () =>
      [
        {
          title: "#",
          dataIndex: "sort",
          width: 60,
          key: "#",
          sorter: (a, b) => a.sort - b.sort,
          render: (col: number) => <SortRender col={col} />,
        },
        {
          key: "title",
          title: t("enable"),
          width: t("script_list_enable_width"),
          dataIndex: "status",
          className: "script-enable",
          sorter(a, b) {
            return a.status - b.status;
          },
          filters: [
            {
              text: t("enable"),
              value: SCRIPT_STATUS_ENABLE,
            },
            {
              text: t("disable"),
              value: SCRIPT_STATUS_DISABLE,
            },
          ],
          onFilter: (value, row) => row.status === value,
          render: (col: any, item: ScriptLoading) => <EnableSwitchCell item={item} updateScripts={updateScripts} />,
        },
        {
          key: "name",
          title: t("name"),
          dataIndex: "name",
          sorter: (a, b) => a.name.localeCompare(b.name),
          filterIcon: <IconSearch />,
          filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
            return (
              <FilterDropdown
                filterKeys={filterKeys}
                setFilterKeys={setFilterKeys}
                confirm={(value) => {
                  setSearchKeyword(value || "");
                  confirm();
                }}
                t={t}
                inputRef={inputRef}
              />
            );
          },
          onFilterDropdownVisibleChange: (visible) => {
            if (visible) {
              setTimeout(() => inputRef.current!.focus(), 1);
            }
          },
          className: "max-w-[240px] min-w-[100px]",
          render: (col: string, item: ListType) => <NameCell col={col} item={item} />,
        },
        {
          title: t("version"),
          dataIndex: "version",
          key: "version",
          width: 120,
          align: "center",
          render: (col: any, item: ListType) => <VersionCell item={item} />,
        },
        {
          key: "apply_to_run_status",
          title: t("apply_to_run_status"),
          width: t("script_list_apply_to_run_status_width"),
          className: "apply_to_run_status",
          render: (col: any, item: ListType) => <ApplyToRunStatusCell item={item} navigate={navigate} t={t} />,
        },
        {
          title: t("source"),
          dataIndex: "origin",
          key: "origin",
          width: 100,
          className: "source_cell",
          render: (col: any, item: ListType) => <SourceCell item={item} t={t} />,
        },
        {
          title: t("home"),
          dataIndex: "home",
          align: "center",
          key: "home",
          width: 100,
          render: (col: any, item: ListType) => <HomeCell item={item} />,
        },
        {
          title: t("last_updated"),
          dataIndex: "updatetime",
          align: "center",
          key: "updatetime",
          className: "script-updatetime",
          width: t("script_list_last_updated_width"),
          sorter: (a, b) => a.updatetime - b.updatetime,
          render: (col: number, script: ListType) => <UpdateTimeCell script={script} />,
        },
        {
          title: (
            <div className="flex flex-row justify-between items-center">
              <span>{t("action")}</span>
              <Space size={4}>
                <Tooltip content={sidebarOpen ? t("open_sidebar") : t("close_sidebar")}>
                  <Button
                    icon={sidebarOpen ? <VscLayoutSidebarLeft /> : <VscLayoutSidebarLeftOff />}
                    iconOnly
                    type="text"
                    size="small"
                    style={{
                      color: "var(--color-text-2)",
                    }}
                    onClick={() => {
                      setSidebarOpen((sidebarOpen) => {
                        const newState = !sidebarOpen;
                        localStorage.setItem("script-list-sidebar", newState ? "1" : "0");
                        return newState;
                      });
                    }}
                  />
                </Tooltip>
                <Tooltip content={t("switch_to_card_mode")}>
                  <Button
                    icon={<FaThLarge />}
                    iconOnly
                    type="text"
                    size="small"
                    style={{
                      color: "var(--color-text-2)",
                    }}
                    onClick={() => {
                      localStorage.setItem("script-list-view-mode", "card");
                      setViewMode("card");
                    }}
                  />
                </Tooltip>
              </Space>
            </div>
          ),
          dataIndex: "action",
          key: "action",
          className: "script-action",
          width: 160,
          render: (col: any, item: ScriptLoading) => (
            <ActionCell
              item={item}
              setUserConfig={setUserConfig}
              setCloudScript={setCloudScript}
              t={t}
              handleDelete={handleDelete}
              handleConfig={handleConfig}
              handleRunStop={handleRunStop}
            />
          ),
        },
      ] as ColumnProps[],
    [
      t,
      sidebarOpen,
      updateScripts,
      setSearchKeyword,
      navigate,
      setSidebarOpen,
      setViewMode,
      setUserConfig,
      setCloudScript,
      handleDelete,
      handleConfig,
      handleRunStop,
    ]
  );

  const [newColumns, setNewColumns] = useState<ColumnProps[]>([]);

  const dealColumns = useMemo(() => {
    const filtered = newColumns.filter((item) => item.width !== -1);
    return filtered.length === 0 ? columns : filtered;
  }, [newColumns, columns]);

  useEffect(() => {
    if (savedWidths === null) return;

    setNewColumns((nColumns) => {
      const widths = columns.map((item) => savedWidths[item.key!] ?? item.width);
      const c = nColumns.length === widths.length ? nColumns : columns;
      return c.map((item, i) => {
        const width = widths[i];
        let dest;
        if (i === 8) {
          // 第8列特殊处理，因为可能涉及到操作图的显示
          dest = item.render === columns[i].render && item.title === columns[i].title ? item : columns[i];
        } else {
          dest = item;
        }
        let m =
          width === dest.width
            ? dest
            : {
                ...dest,
                width,
              };
        // 处理语言更新
        if (m.title !== columns[i].title) m = { ...m, title: columns[i].title };
        return m;
      });
    });
  }, [savedWidths, columns]);

  useEffect(() => {
    systemConfig.getScriptListColumnWidth().then((columnWidth) => {
      setSavedWidths({ ...columnWidth });
    });
  }, []);

  const components: ComponentsProps = useMemo(
    () => ({
      header: {
        operations: ({ selectionNode, expandNode }) => [
          {
            node: <th className="script-sort" style={{ borderRadius: 0 }} />,
            width: 34,
          },
          {
            name: "expandNode",
            node: expandNode,
          },
          {
            name: "selectionNode",
            node: selectionNode,
          },
        ],
      },
      body: {
        operations: ({ selectionNode, expandNode }) => [
          {
            node: (
              <td>
                <div className="arco-table-cell">
                  <DragHandle />
                </div>
              </td>
            ),
            width: 34,
          },
          {
            name: "expandNode",
            node: expandNode,
          },
          {
            name: "selectionNode",
            node: selectionNode,
          },
        ],
        tbody: DraggableContainer,
        row: DraggableRow,
      },
    }),
    []
  );

  const setWidth = (selectColumn: number, width: any) => {
    setNewColumns((cols) =>
      cols.map((col, i) => (i === selectColumn && col.width !== width ? { ...col, width } : col))
    );
  };

  // 处理拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // Provide context for DraggableContainer
  const draggableContextValue = useMemo(
    () => ({
      sensors,
      scriptList,
      scriptListSortOrder,
    }),
    [sensors, scriptList, scriptListSortOrder]
  );

  return (
    <DraggableContext.Provider value={draggableContextValue}>
      {showAction && (
        <Card>
          <div
            className="flex flex-row justify-between items-center"
            style={{
              padding: "8px 6px",
            }}
          >
            <Space direction="horizontal">
              <Typography.Text>{t("batch_operations") + ":"}</Typography.Text>
              <Select
                style={{ minWidth: "100px" }}
                triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
                size="mini"
                value={action}
                onChange={(value) => {
                  setAction(value);
                }}
              >
                <Select.Option key={"enable"} value="enable">
                  {t("enable")}
                </Select.Option>
                <Select.Option key={"disable"} value="disable">
                  {t("disable")}
                </Select.Option>
                <Select.Option key={"export"} value="export">
                  {t("export")}
                </Select.Option>
                <Select.Option key={"delete"} value="delete">
                  {t("delete")}
                </Select.Option>
                <Select.Option key={"pin_to_top"} value="pin_to_top">
                  {t("pin_to_top")}
                </Select.Option>
                <Select.Option key={"check_update"} value="check_update">
                  {t("check_update")}
                </Select.Option>
              </Select>
              <Button
                type="primary"
                size="mini"
                onClick={() => {
                  const enableAction = (enable: boolean) => {
                    const uuids = select.map((item) => item.uuid);
                    updateScripts(uuids, { enableLoading: true });
                    scriptClient.enables(uuids, enable);
                  };
                  switch (action) {
                    case "enable":
                      enableAction(true);
                      break;
                    case "disable":
                      enableAction(false);
                      break;
                    case "export": {
                      const sortedSelect = [...select].sort((a, b) => a.sort - b.sort);
                      const uuids = sortedSelect.map((item) => item.uuid);
                      Message.loading({
                        id: "export",
                        content: t("exporting"),
                      });
                      synchronizeClient.export(uuids).then(() => {
                        Message.success({
                          id: "export",
                          content: t("export_success"),
                          duration: 3000,
                        });
                      });
                      break;
                    }
                    case "delete":
                      if (confirm(t("list.confirm_delete"))) {
                        const uuids = select.map((item) => item.uuid);
                        scriptClient.deletes(uuids); // async
                      }
                      break;
                    case "pin_to_top": {
                      // 将选中的脚本置顶
                      const sortedSelect = [...select].sort((a, b) => a.sort - b.sort);
                      const uuids = sortedSelect.map((item) => item.uuid);
                      pinToTop(uuids).then(() => {
                        Message.success({
                          content: t("scripts_pinned_to_top"),
                          duration: 3000,
                        });
                      });
                      break;
                    }
                    // 批量检查更新
                    case "check_update":
                      if (confirm(t("list.confirm_update")!)) {
                        select.forEach((item, index, array) => {
                          if (!item.checkUpdateUrl) {
                            return;
                          }
                          Message.warning({
                            id: "checkupdateStart",
                            content: t("starting_updates"),
                          });
                          scriptClient
                            .requestCheckUpdate(item.uuid)
                            .then((res) => {
                              if (res) {
                                // 需要更新
                                Message.warning({
                                  id: "checkupdate",
                                  content: `${i18nName(item)} ${t("new_version_available")}`,
                                });
                              }
                              if (index === array.length - 1) {
                                // 当前元素是最后一个
                                Message.success({
                                  id: "checkupdateEnd",
                                  content: t("checked_for_all_selected"),
                                });
                              }
                            })
                            .catch((e) => {
                              Message.error({
                                id: "checkupdate",
                                content: `${t("update_check_failed")}: ${e.message}`,
                              });
                            });
                        });
                      }
                      break;
                    default:
                      Message.error(t("unknown_operation")!);
                      break;
                  }
                }}
              >
                {t("confirm")}
              </Button>
              <Divider type="horizontal" />
              <Typography.Text>{t("resize_column_width") + ":"}</Typography.Text>
              <Select
                style={{ minWidth: "80px" }}
                triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
                size="mini"
                value={selectColumn === 8 ? t("action") : newColumns[selectColumn].title?.toString()}
                onChange={(val) => {
                  const index = parseInt(val as string, 10);
                  setSelectColumn(index);
                }}
              >
                {newColumns.map((column, index) => (
                  <Select.Option key={index} value={index}>
                    {index === 8 ? t("action") : column.title}
                  </Select.Option>
                ))}
              </Select>
              <Dropdown
                droplist={
                  <Menu>
                    <Menu.Item
                      key="auto"
                      onClick={() => {
                        setWidth(selectColumn, 0);
                      }}
                    >
                      {t("auto")}
                    </Menu.Item>
                    <Menu.Item
                      key="hide"
                      onClick={() => {
                        setWidth(selectColumn, -1);
                      }}
                    >
                      {t("hide")}
                    </Menu.Item>
                    <Menu.Item
                      key="custom"
                      onClick={() => {
                        const width =
                          (newColumns[selectColumn].width as number) > 0
                            ? newColumns[selectColumn].width
                            : columns[selectColumn].width;
                        setWidth(selectColumn, width);
                      }}
                    >
                      {t("custom")}
                    </Menu.Item>
                  </Menu>
                }
                position="bl"
              >
                <Input
                  type={newColumns[selectColumn].width === 0 || newColumns[selectColumn].width === -1 ? "" : "number"}
                  style={{ width: "80px" }}
                  size="mini"
                  value={
                    newColumns[selectColumn].width === 0
                      ? t("auto")
                      : newColumns[selectColumn].width === -1
                        ? t("hide")
                        : newColumns[selectColumn].width?.toString()
                  }
                  step={5}
                  onChange={(val) => {
                    const width = parseInt(val, 10);
                    setWidth(selectColumn, width);
                  }}
                />
              </Dropdown>
              <Button
                type="primary"
                size="mini"
                onClick={() => {
                  const newWidth: { [key: string]: number } = {};
                  for (const column of newColumns) {
                    newWidth[column.key! as string] = column.width as number;
                  }
                  systemConfig.setScriptListColumnWidth(newWidth);
                }}
              >
                {t("save")}
              </Button>
              <Button
                size="mini"
                onClick={() => {
                  setNewColumns((cols) => {
                    return cols.map((col, index) => {
                      col.width = columns[index].width;
                      return col;
                    });
                  });
                }}
              >
                {t("reset")}
              </Button>
            </Space>
            <Button
              type="primary"
              size="mini"
              onClick={() => {
                setShowAction(false);
              }}
            >
              {t("close")}
            </Button>
          </div>
        </Card>
      )}
      <Table
        key="script-list-table"
        className="script-list-table arco-drag-table-container"
        components={components}
        rowKey="uuid"
        tableLayoutFixed
        columns={dealColumns}
        data={scriptList}
        pagination={false}
        loading={loadingList}
        rowSelection={{
          type: "checkbox",
          onChange(_, selectedRows) {
            setShowAction(true);
            setSelect(selectedRows);
          },
        }}
      />
    </DraggableContext.Provider>
  );
};

export default ScriptTable;
