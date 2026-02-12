import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Avatar, Button, Card, Divider, Popconfirm, Space, Tag, Tooltip, Typography } from "@arco-design/web-react";
import { Link, useNavigate } from "react-router-dom";
import { IconClockCircle, IconDragDotVertical } from "@arco-design/web-react/icon";
import {
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiSettings3Fill,
  RiStopFill,
  RiUploadCloudFill,
} from "react-icons/ri";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import { SCRIPT_RUN_STATUS_RUNNING, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { requestEnableScript } from "@App/pages/store/features/script";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { i18nName } from "@App/locales/locales";
import { hashColor, ScriptIcons } from "../utils";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { parseTags } from "@App/app/repo/metadata";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { EnableSwitch, HomeCell, MemoizedAvatar, ScriptSearchField, SourceCell, UpdateTimeCell } from "./components";
import { useTranslation } from "react-i18next";
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from "react-icons/vsc";
import { FaThList } from "react-icons/fa";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { rectSwappingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type SearchFilterRequest } from "./SearchFilter";
import type { SearchType } from "@App/app/service/service_worker/types";

type DragCtx = Pick<ReturnType<typeof useSortable>, "listeners" | "setActivatorNodeRef"> | null;
const SortableDragCtx = createContext<DragCtx>(null);

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

type DraggableEntryProps = { recordUUID: string } & React.HTMLAttributes<HTMLDivElement>;

const DraggableEntry = React.forwardRef<HTMLDivElement, DraggableEntryProps>(({ recordUUID, ...rest }, ref) => {
  const sortable = useSortable({ id: recordUUID });
  const { setNodeRef, transform, transition, listeners, setActivatorNodeRef, isDragging } = sortable;

  const style = {
    // ScriptCard 移位渉及多个元件上下左右移动，DragEnd时不要使用 dnd-kit 提供的效果
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  const mergedRef = React.useMemo(() => composeRefs<HTMLDivElement>(setNodeRef, ref), [setNodeRef, ref]);

  const ctxValue = useMemo(
    () => ({
      listeners: listeners,
      setActivatorNodeRef: setActivatorNodeRef,
    }),
    [listeners, setActivatorNodeRef]
  );

  return (
    <SortableDragCtx.Provider value={ctxValue}>
      <div ref={mergedRef} style={style} {...rest} />
    </SortableDragCtx.Provider>
  );
});
DraggableEntry.displayName = "DraggableEntry";

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

interface ScriptCardItemProps {
  item: ScriptLoading;
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

export const ScriptCardItem = React.memo(
  ({
    item,
    updateScripts,
    setUserConfig,
    setCloudScript,
    handleDelete,
    handleConfig,
    handleRunStop,
  }: ScriptCardItemProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const { tags } = useMemo(() => {
      let metadata = item.metadata;
      if (item.selfMetadata) {
        metadata = getCombinedMeta(item.metadata, item.selfMetadata);
      }
      return { tags: parseTags(metadata) || [] };
    }, [item.metadata, item.selfMetadata]);

    const favoriteMemo = useMemo(() => {
      const fav1 = item.favorite;
      const fav2 = !fav1
        ? []
        : fav1
            .slice()
            .sort((a, b) => (a.icon && !b.icon ? -1 : !a.icon && b.icon ? 1 : a.match.localeCompare(b.match)))
            .slice(0, 8);
      return {
        trimmed: fav2,
        originalLen: fav1?.length ?? 0,
      };
    }, [item.favorite]);

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

    // console.log("Rendered - " + item.name); // 用于检查垃圾React有否过度更新

    return (
      <DraggableEntry recordUUID={item.uuid}>
        <div>
          <Card
            hoverable
            className="script-card"
            bodyStyle={{
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            <div className="tw-flex tw-flex-col tw-justify-between tw-h-full tw-gap-1">
              <div className="tw-flex tw-flex-col tw-gap-3">
                <div className="tw-flex tw-flex-row tw-justify-between tw-items-start tw-gap-1">
                  <div className="tw-flex-1 tw-min-w-0">
                    <Link
                      to={`/script/editor/${item.uuid}`}
                      style={{
                        textDecoration: "none",
                      }}
                    >
                      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                        <ScriptIcons script={item} size={24} />
                        <Typography.Text
                          style={{
                            fontSize: "16px",
                            fontWeight: 500,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={i18nName(item)}
                        >
                          {i18nName(item)}
                        </Typography.Text>
                      </div>
                    </Link>
                    {tags.length > 0 && (
                      <Space wrap>
                        {tags.map((tag) => (
                          <Tag key={tag} color={hashColor(tag)} size="small">
                            {tag}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                  <div className="script-enable" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <EnableSwitch
                      status={item.status}
                      enableLoading={item.enableLoading}
                      onChange={(checked: boolean) => {
                        updateScripts([item.uuid], { enableLoading: true });
                        requestEnableScript({ uuid: item.uuid, enable: checked });
                      }}
                    />
                    <div
                      className="script-sort"
                      role="button"
                      tabIndex={0}
                      style={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <DragHandle />
                    </div>
                  </div>
                </div>

                {/* 版本和更新时间 */}
                <div className="tw-flex tw-flex-row tw-gap-4 tw-text-sm tw-text-gray-500">
                  {item.metadata.version && (
                    <div>
                      <span className="tw-font-medium">
                        {t("version")}
                        {": "}
                      </span>
                      <span>{item.metadata.version[0]}</span>
                    </div>
                  )}
                  <div className="script-updatetime">
                    <span className="tw-font-medium">
                      {t("last_updated")}
                      {": "}
                    </span>
                    <UpdateTimeCell className="tw-text-sm tw-text-gray-500" script={item} />
                  </div>
                </div>

                {/* 运行状态 */}
                <div className="tw-flex tw-flex-row tw-gap-4">
                  {item.type !== SCRIPT_TYPE_NORMAL && (
                    <div>
                      <Tooltip
                        content={
                          item.type === SCRIPT_TYPE_BACKGROUND
                            ? t("background_script_tooltip")
                            : `${t("scheduled_script_tooltip")} ${nextTimeDisplay(item.metadata!.crontab![0])}`
                        }
                      >
                        <Tag
                          icon={<IconClockCircle />}
                          color="blue"
                          bordered
                          style={{ cursor: "pointer" }}
                          onClick={toLogger}
                        >
                          {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("running") : t("completed")}
                        </Tag>
                      </Tooltip>
                    </div>
                  )}
                  <SourceCell item={item} t={t} />
                </div>

                <div className="tw-flex tw-flex-row tw-gap-3 tw-items-center apply_to_run_status">
                  {item.type === SCRIPT_TYPE_NORMAL && (
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
                      {favoriteMemo.originalLen > 8 && <span className="tw-text-xs tw-ml-1">{"..."}</span>}
                    </Avatar.Group>
                  )}
                  <HomeCell item={item} />
                </div>
              </div>
              {/* 操作按钮 */}
              <div className="tw-flex tw-flex-col script-action">
                <Divider style={{ margin: "4px 0 14px" }} />
                <div className="tw-flex tw-flex-row tw-justify-between">
                  <div>
                    {item.type !== SCRIPT_TYPE_NORMAL && (
                      <Button
                        type="outline"
                        icon={item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? <RiStopFill /> : <RiPlayFill />}
                        loading={item.actionLoading}
                        size="mini"
                        onClick={() => handleRunStop(item)}
                      >
                        {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("stop") : t("run")}
                      </Button>
                    )}
                  </div>
                  <div className="tw-flex tw-flex-row tw-justify-between tw-items-center">
                    <Space>
                      <Link to={`/script/editor/${item.uuid}`}>
                        <Button type="outline" icon={<RiPencilFill />} size="mini">
                          {t("edit")}
                        </Button>
                      </Link>
                      {item.config && (
                        <Button
                          type="outline"
                          icon={<RiSettings3Fill />}
                          size="mini"
                          onClick={() => handleConfig(item, setUserConfig)}
                        >
                          {t("config")}
                        </Button>
                      )}
                      {item.metadata.cloudcat && (
                        <Button
                          type="outline"
                          icon={<RiUploadCloudFill />}
                          size="mini"
                          onClick={() => setCloudScript(item)}
                        >
                          {t("cloud")}
                        </Button>
                      )}
                      <Popconfirm
                        title={t("confirm_delete_script")}
                        icon={<RiDeleteBin5Fill />}
                        onOk={() => handleDelete(item)}
                      >
                        <Button
                          type="outline"
                          status="danger"
                          icon={<RiDeleteBin5Fill />}
                          loading={item.actionLoading}
                          size="mini"
                        >
                          {t("delete")}
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DraggableEntry>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.item === nextProps.item;
  }
);
ScriptCardItem.displayName = "ScriptCard";

interface ScriptCardProps {
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
  searchRequest: { keyword: string; type: SearchType };
  setSearchRequest: (mode: SearchFilterRequest) => void;
  handleDelete: (item: ScriptLoading) => void;
  handleConfig: (
    item: ScriptLoading,
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
  ) => void;
  handleRunStop: (item: ScriptLoading) => Promise<void>;
}

const ScriptCard = ({
  loadingList,
  scriptList,
  // scriptListSortOrderMove,
  scriptListSortOrderSwap,
  sidebarOpen,
  setSidebarOpen,
  setViewMode,
  updateScripts,
  setUserConfig,
  setCloudScript,
  searchRequest,
  setSearchRequest,
  handleDelete,
  handleConfig,
  handleRunStop,
}: ScriptCardProps) => {
  const { t } = useTranslation();

  // Sensors — move them here (or even higher in parent) so they're stable
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 }, // ← prevents accidental drag on click
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 基于 scriptList 的 uuid 生成稳定字串，避免因 scriptList 引用频繁变动导致 ctx 内部 sortableIds 参考出现非预期更改。
  const sortableIdsString = scriptList?.map((s) => s.uuid).join(",") || "";

  // sortableIds 应该只包含 ID 字符串数组，而不是对象数组，
  // 且确保 items 属性接收的是纯 ID 列表，这样 dnd-kit 内部对比更高效。
  const sortableIds = useMemo(() => sortableIdsString?.split(",").filter(Boolean), [sortableIdsString]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        scriptListSortOrderSwap({
          active: `${active.id}`,
          over: `${over.id}`,
        });
      }
    },
    [scriptListSortOrderSwap]
  );

  const a11y = useMemo(
    () => ({
      container: document.body,
    }),
    []
  );

  return (
    <>
      {/* 卡片视图工具栏 */}
      <Card
        className="script-list-card"
        style={{
          borderWidth: "0 0px 1px 0",
          padding: "0 16px",
        }}
      >
        <div className="tw-flex tw-flex-row tw-justify-between tw-items-center" style={{ padding: "8px 0" }}>
          <div className="tw-flex-1">
            <ScriptSearchField
              t={t}
              defaultValue={searchRequest}
              onSearch={(req) => {
                setSearchRequest(req);
              }}
            />
          </div>
          <Space size={8}>
            <Tooltip content={sidebarOpen ? t("close_sidebar") : t("open_sidebar")}>
              <Button
                icon={sidebarOpen ? <VscLayoutSidebarLeft /> : <VscLayoutSidebarLeftOff />}
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
            <Tooltip content={t("switch_to_table_mode")}>
              <Button
                icon={<FaThList />}
                type="text"
                size="small"
                style={{
                  color: "var(--color-text-2)",
                }}
                onClick={() => {
                  setViewMode("table");
                  localStorage.setItem("script-list-view-mode", "table");
                }}
              />
            </Tooltip>
          </Space>
        </div>
      </Card>
      <div
        style={{
          padding: "16px",
        }}
      >
        {scriptList.length === 0 ? (
          loadingList ? (
            <div
              style={{
                textAlign: "center",
                padding: "64px 0",
                color: "var(--color-text-3)",
              }}
            >
              <Typography.Text type="secondary">{t("loading")}</Typography.Text>
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "64px 0",
                color: "var(--color-text-3)",
              }}
            >
              <Typography.Text type="secondary">{t("no_data")}</Typography.Text>
            </div>
          )
        ) : (
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
            accessibility={a11y}
          >
            <SortableContext items={sortableIds} strategy={rectSwappingStrategy}>
              <div
                className="script-card-grid"
                style={{
                  display: "grid",
                  gap: "16px",
                }}
              >
                {scriptList.map((item) => (
                  <ScriptCardItem
                    key={item.uuid}
                    item={item}
                    updateScripts={updateScripts}
                    setUserConfig={setUserConfig}
                    setCloudScript={setCloudScript}
                    handleDelete={handleDelete}
                    handleConfig={handleConfig}
                    handleRunStop={handleRunStop}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </>
  );
};

const MemoizedScriptCard = React.memo(ScriptCard, (prevProps, nextProps) => {
  return (
    prevProps.loadingList === nextProps.loadingList &&
    prevProps.scriptList === nextProps.scriptList &&
    prevProps.sidebarOpen === nextProps.sidebarOpen &&
    prevProps.searchRequest.keyword === nextProps.searchRequest.keyword &&
    prevProps.searchRequest.type === nextProps.searchRequest.type
  );
});

MemoizedScriptCard.displayName = "ScriptCard";

export default MemoizedScriptCard;
