import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { systemConfig } from "@App/pages/store/global";
import { i18nName } from "@App/locales/locales";
import { hashColor, ScriptIcons } from "../utils";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { requestEnableScript, pinToTop, scriptClient, synchronizeClient } from "@App/pages/store/features/script";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { parseTags } from "@App/app/repo/metadata";
import { EnableSwitch, HomeCell, MemoizedAvatar, ScriptSearchField, SourceCell, UpdateTimeCell } from "./components";
import { SearchFilter, type SearchFilterKeyEntry } from "./SearchFilter";

type ListType = ScriptLoading;

type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

// Create context for DraggableContainer
interface DraggableContextType {
  sensors: ReturnType<typeof useSensors>;
  sortableIds: string[];
  handleDragEnd: (event: DragEndEvent) => void;
  a11y: {
    container: HTMLElement;
  };
}
const DraggableContext = createContext<DraggableContextType | null>(null);

type DraggableContainerProps = React.HTMLAttributes<HTMLTableSectionElement>;

const DraggableContainer = React.forwardRef<HTMLTableSectionElement, DraggableContainerProps>((props, ref) => {
  const ctx = useContext(DraggableContext);
  const { sensors, sortableIds, handleDragEnd, a11y } = ctx || {};

  // compute once, even if context is null (keeps hook order legal)

  return !sortableIds?.length ? (
    // render a plain tbody to keep the table structure intact
    <tbody ref={ref} {...props} />
  ) : (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      collisionDetection={closestCenter}
      accessibility={a11y}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <tbody ref={ref} {...props} />
      </SortableContext>
    </DndContext>
  );
});

DraggableContainer.displayName = "DraggableContainer";

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

const DraggableRow = React.forwardRef<
  HTMLTableRowElement,
  { record: ScriptLoading; index: number } & React.HTMLAttributes<HTMLTableRowElement>
>(({ record, index: _index, ...rest }, ref) => {
  const sortable = useSortable({ id: record.uuid });
  const { setNodeRef, transform, listeners, setActivatorNodeRef } = sortable;

  const style = {
    transform: CSS.Transform.toString(transform),
  };

  const mergedRef = React.useMemo(() => composeRefs<HTMLTableRowElement>(setNodeRef, ref), [setNodeRef, ref]);

  const ctxValue = useMemo(
    () => ({
      listeners: listeners,
      setActivatorNodeRef: setActivatorNodeRef,
    }),
    [listeners, setActivatorNodeRef]
  );

  return (
    <SortableDragCtx.Provider value={ctxValue}>
      <tr ref={mergedRef} style={style} {...rest} />
    </SortableDragCtx.Provider>
  );
});
DraggableRow.displayName = "DraggableRow";

const DragHandle = () => {
  const sortable = useContext(SortableDragCtx);

  const { listeners, setActivatorNodeRef } = sortable || {};
  const style = { cursor: "move", padding: 6 };

  return !setActivatorNodeRef ? (
    <span style={style}>
      <IconDragDotVertical />
    </span>
  ) : (
    <span ref={setActivatorNodeRef} {...listeners} style={style}>
      <IconDragDotVertical />
    </span>
  );
};

const ApplyToRunStatusCell = React.memo(
  ({
    item,
    navigate,
    t,
  }: {
    item: ListType;
    navigate: ReturnType<typeof useNavigate>;
    t: ReturnType<typeof useTranslation>[0];
  }) => {
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
      tooltip = `${t("scheduled_script_tooltip")} ${nextTimeDisplay(item.metadata!.crontab![0])}`;
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
  }
);
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
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
    setCloudScript: (script: Script) => void;
    t: ReturnType<typeof useTranslation>[0];
    handleDelete: (item: ScriptLoading) => void;
    handleConfig: (
      item: ScriptLoading,
      setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
    ) => void;
    handleRunStop: (item: ScriptLoading) => Promise<void>;
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
            onClick={() => handleRunStop(item)}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
        {item.metadata.cloudcat && (
          <Button
            type="text"
            icon={<RiUploadCloudFill />}
            onClick={() => setCloudScript(item)}
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
    // console.log("Rendered - " + item.name); // 用于检查垃圾React有否过度更新
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

const TitleCell = React.memo(
  ({
    sidebarOpen,
    setSidebarOpen,
    setViewMode,
    t,
  }: {
    sidebarOpen: boolean;
    setSidebarOpen: ReactStateSetter<boolean>;
    setViewMode: (mode: "card" | "table") => void;
    t: ReturnType<typeof useTranslation>[0];
  }) => {
    return (
      <div className="tw-flex tw-flex-row tw-justify-between tw-items-center">
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
    );
  }
);
TitleCell.displayName = "TitleCell";

type FilterProps = {
  filterKeys: SearchFilterKeyEntry[] | undefined;
};

const filterDropdownFunctions: {
  setFilterKeys?: (filterKeys: SearchFilterKeyEntry[] | undefined, callback?: (...args: any[]) => any) => void;
  confirm?: (...args: any[]) => any;
} = {};

export const ScriptFilterNode = React.memo(
  function ScriptFilterNode({ filterKeys }: FilterProps) {
    const { t } = useTranslation();
    return (
      <div className="arco-table-custom-filter tw-flex tw-flex-row tw-gap-2">
        <ScriptSearchField
          t={t}
          autoFocus
          defaultValue={filterKeys?.[0] || { type: "auto", keyword: "" }}
          onChange={(req) => {
            SearchFilter.requestFilterResult(req).then(() => {
              filterDropdownFunctions.setFilterKeys!([{ type: req.type, keyword: req.keyword }]);
            });
          }}
          onSearch={(req) => {
            if (req.bySelect) return;
            filterDropdownFunctions.confirm!();
          }}
        />
      </div>
    );
  },
  (prev, next) => {
    return prev.filterKeys?.[0] === next.filterKeys?.[0];
  }
);

interface ScriptTableProps {
  loadingList: boolean;
  scriptList: ScriptLoading[];
  scriptListSortOrderMove: (params: { active: string; over: string }) => void;
  scriptListSortOrderSwap: (params: { active: string; over: string }) => void;
  sidebarOpen: boolean;
  setSidebarOpen: ReactStateSetter<boolean>;
  setViewMode: (mode: "card" | "table") => void;
  updateScripts: (uuids: string[], data: Partial<Script | ScriptLoading>) => void;
  setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
  setCloudScript: (script: Script) => void;
  handleDelete: (item: ScriptLoading) => void;
  handleConfig: (
    item: ScriptLoading,
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
  ) => void;
  handleRunStop: (item: ScriptLoading) => Promise<void>;
}

export const ScriptTable = React.memo(
  ({
    loadingList,
    scriptList,
    scriptListSortOrderMove,
    // scriptListSortOrderSwap,
    sidebarOpen,
    setSidebarOpen,
    setViewMode,
    updateScripts,
    setUserConfig,
    setCloudScript,
    handleDelete,
    handleConfig,
    handleRunStop,
  }: ScriptTableProps) => {
    const { t } = useTranslation();
    const [showAction, setShowAction] = useState(false);
    const [action, setAction] = useState("");
    const [select, setSelect] = useState<Script[]>([]);
    const [selectColumn, setSelectColumn] = useState(0);
    const navigate = useNavigate();
    const [savedWidths, setSavedWidths] = useState<{ [key: string]: number } | null>(null);

    const columns0: ColumnProps<ListType>[] = [
      {
        title: "#",
        dataIndex: "sort",
        width: 60,
        key: "#",
        sorter: useCallback((a: ListType, b: ListType) => a.sort - b.sort, []),
        render: useCallback((col: number) => <SortRender col={col} />, []),
      },
      {
        key: "title",
        title: t("enable"),
        width: t("script_list_enable_width"),
        dataIndex: "status",
        className: "script-enable",
        sorter: useCallback((a: ListType, b: ListType) => a.status - b.status, []),
        filters: useMemo(
          () => [
            {
              text: t("enable"),
              value: SCRIPT_STATUS_ENABLE,
            },
            {
              text: t("disable"),
              value: SCRIPT_STATUS_DISABLE,
            },
          ],
          [t]
        ),
        onFilter: useCallback((value: any, row: any) => row.status === value, []),
        render: useCallback(
          (col: any, item: ListType) => <EnableSwitchCell item={item} updateScripts={updateScripts} />,
          [updateScripts]
        ),
      },
      {
        key: "name",
        title: t("name"),
        dataIndex: "name",
        sorter: useCallback((a: ListType, b: ListType) => a.name.localeCompare(b.name), []),
        filterIcon: <IconSearch />,
        filterDropdown: useCallback(({ filterKeys, setFilterKeys, confirm }: any) => {
          // setFilterKeys, confirm 会不断改变参考但又不影响元件绘画。用 filterDropdownFunctions 把它们抽出 React绘图
          filterDropdownFunctions.setFilterKeys = setFilterKeys;
          filterDropdownFunctions.confirm = confirm;
          return <ScriptFilterNode filterKeys={filterKeys as SearchFilterKeyEntry[] | undefined} />;
        }, []),
        onFilter: useCallback((value: any, row: any) => {
          if (!value || !value.keyword) {
            return true;
          }
          return SearchFilter.checkByUUID(row.uuid);
        }, []),
        className: "tw-max-w-[240px] tw-min-w-[100px]",
        render: useCallback((col: string, item: ListType) => <NameCell col={col} item={item} />, []),
      },
      {
        title: t("version"),
        dataIndex: "version",
        key: "version",
        width: 120,
        align: "center",
        render: useCallback((col: any, item: ListType) => <VersionCell item={item} />, []),
      },
      {
        key: "apply_to_run_status",
        dataIndex: "apply_to_run_status",
        title: t("apply_to_run_status"),
        width: t("script_list_apply_to_run_status_width"),
        className: "apply_to_run_status",
        render: useCallback(
          (col: any, item: ListType) => <ApplyToRunStatusCell item={item} navigate={navigate} t={t} />,
          [navigate, t]
        ),
      },
      {
        title: t("source"),
        dataIndex: "origin",
        key: "origin",
        width: 100,
        className: "source_cell",
        render: useCallback((col: any, item: ListType) => <SourceCell item={item} t={t} />, [t]),
      },
      {
        title: t("home"),
        dataIndex: "home",
        align: "center",
        key: "home",
        width: 100,
        render: useCallback((col: any, item: ListType) => <HomeCell item={item} />, []),
      },
      {
        title: t("last_updated"),
        dataIndex: "updatetime",
        align: "center",
        key: "updatetime",
        className: "script-updatetime",
        width: t("script_list_last_updated_width"),
        sorter: useCallback((a: ListType, b: ListType) => a.updatetime! - b.updatetime!, []),
        render: useCallback((col: number, script: ListType) => <UpdateTimeCell script={script} />, []),
      },
      {
        title: <TitleCell sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} setViewMode={setViewMode} t={t} />,
        dataIndex: "action",
        key: "action",
        className: "script-action",
        width: 160,
        render: useCallback(
          (col: any, item: ListType) => (
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
          [handleConfig, handleDelete, handleRunStop, setCloudScript, setUserConfig, t]
        ),
      },
    ];

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const columns = useMemo(() => columns0, [t]);

    const [newColumns, setNewColumns] = useState<ColumnProps[]>([]);

    const dealColumns = useMemo(() => {
      const filtered = newColumns.filter((item) => item.width !== -1);
      return filtered.length === 0 ? columns : filtered;
    }, [newColumns, columns]);

    useEffect(() => {
      if (savedWidths === null) return;

      // 主要只需要处理列宽变化的情况
      setNewColumns(
        columns.map((item, i) => {
          if (savedWidths[item.key!] === undefined) {
            return columns[i];
          }
          return {
            ...columns[i],
            width: savedWidths[item.key!] ?? item.width,
          };
        })
      );
    }, [savedWidths, columns]);

    useEffect(() => {
      systemConfig.getScriptListColumnWidth().then((columnWidth) => {
        setSavedWidths({ ...columnWidth });
      });
    }, []);

    const components0: ComponentsProps = {
      header: {
        operations: useCallback(
          ({ selectionNode, expandNode }: { selectionNode?: React.ReactNode; expandNode?: React.ReactNode }) => [
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
          []
        ),
      },
      body: {
        operations: useCallback(
          ({ selectionNode, expandNode }: { selectionNode?: React.ReactNode; expandNode?: React.ReactNode }) => [
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
          []
        ),
        tbody: DraggableContainer,
        row: DraggableRow,
      },
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const components = useMemo(() => components0, []);

    const setWidth = (selectColumn: number, width: string | number | undefined) => {
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

    // 故意生成一个字串 memo 避免因 list 的参考频繁改动而导致 ctx 的 sortableIds 参考出现非预期更改。
    const sortableIdsString = useMemo(() => scriptList?.map((s) => s.uuid).join(",") || "", [scriptList]);

    // sortableIds 应该只包含 ID 字符串数组，而不是对象数组，
    // 且确保 items 属性接收的是纯 ID 列表，这样 dnd-kit 内部对比更高效。
    const sortableIds = useMemo(() => sortableIdsString?.split(",").filter(Boolean), [sortableIdsString]);

    const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
          scriptListSortOrderMove!({
            active: `${active.id}`,
            over: `${over.id}`,
          });
        }
      },
      [scriptListSortOrderMove]
    );

    const a11y = useMemo(
      () => ({
        container: document.body,
      }),
      []
    );

    // Provide context for DraggableContainer
    const draggableContextValue = useMemo(
      () => ({
        sensors,
        sortableIds,
        handleDragEnd,
        a11y,
      }),
      [sensors, sortableIds, handleDragEnd, a11y]
    );

    const handleRowSelectionChange = useCallback((keys: any[], selectedRows: ListType[]) => {
      setSelect(selectedRows);
      setShowAction(keys.length > 0);
    }, []);

    const rowSelection = useMemo(
      () => ({
        type: "checkbox" as const,
        onChange: handleRowSelectionChange,
      }),
      [handleRowSelectionChange]
    );

    return (
      <DraggableContext.Provider value={draggableContextValue}>
        {showAction && (
          <Card>
            <div
              className="tw-flex tw-flex-row tw-justify-between tw-items-center"
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
          rowSelection={rowSelection}
        />
      </DraggableContext.Provider>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.loadingList === nextProps.loadingList &&
      prevProps.scriptList === nextProps.scriptList &&
      prevProps.sidebarOpen === nextProps.sidebarOpen
    );
  }
);
ScriptTable.displayName = "ScriptTable";

export default ScriptTable;
