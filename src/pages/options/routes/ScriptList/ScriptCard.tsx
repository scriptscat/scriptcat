import React, { useMemo } from "react";
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
import { nextTime } from "@App/pkg/utils/cron";
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
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppContext } from "@App/pages/store/AppContext";
import type { SetSearchRequest } from "./hooks";
import type { SearchType } from "@App/app/service/service_worker/types";

const { Text } = Typography;

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
  handleRunStop: (item: ScriptLoading, t: any) => Promise<void>;
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
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: item.uuid,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

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

    return (
      <Card
        hoverable
        className="script-card"
        style={{
          ...style,
        }}
        ref={setNodeRef}
        bodyStyle={{
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="flex flex-col justify-between h-full gap-1">
          <div className="flex flex-col gap-3">
            <div className="flex flex-row justify-between items-start gap-1">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/script/editor/${item.uuid}`}
                  style={{
                    textDecoration: "none",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ScriptIcons script={item} size={24} />
                    <Text
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
                    </Text>
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
                  {...attributes}
                  {...listeners}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "grab", padding: 6, display: "inline-flex", alignItems: "center" }}
                >
                  <IconDragDotVertical />
                </div>
              </div>
            </div>

            {/* 版本和更新时间 */}
            <div className="flex flex-row gap-4 text-sm text-gray-500">
              {item.metadata.version && (
                <div>
                  <span className="font-medium">
                    {t("version")}
                    {": "}
                  </span>
                  <span>{item.metadata.version[0]}</span>
                </div>
              )}
              <div className="script-updatetime">
                <span className="font-medium">
                  {t("last_updated")}
                  {": "}
                </span>
                <UpdateTimeCell className="text-sm text-gray-500" script={item} />
              </div>
            </div>

            {/* 运行状态 */}
            <div className="flex flex-row gap-4">
              {item.type !== SCRIPT_TYPE_NORMAL && (
                <div>
                  <Tooltip
                    content={
                      item.type === SCRIPT_TYPE_BACKGROUND
                        ? t("background_script_tooltip")
                        : `${t("scheduled_script_tooltip")} ${nextTime(item.metadata!.crontab![0])}`
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

            <div className="flex flex-row gap-3 items-center apply_to_run_status">
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
                  {favoriteMemo.originalLen > 8 && <span className="text-xs ml-1">{"..."}</span>}
                </Avatar.Group>
              )}
              <HomeCell item={item} />
            </div>
          </div>
          {/* 操作按钮 */}
          <div className="flex flex-col script-action">
            <Divider style={{ margin: "4px 0 14px" }} />
            <div className="flex flex-row justify-between">
              <div>
                {item.type !== SCRIPT_TYPE_NORMAL && (
                  <Button
                    type="outline"
                    icon={item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? <RiStopFill /> : <RiPlayFill />}
                    loading={item.actionLoading}
                    size="mini"
                    onClick={() => handleRunStop(item, t)}
                  >
                    {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("stop") : t("run")}
                  </Button>
                )}
              </div>
              <div className="flex flex-row justify-between items-center">
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
  scriptListSortOrder: (params: { active: string; over: string }) => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setViewMode: (mode: "card" | "table") => void;
  updateScripts: (uuids: string[], data: Partial<Script | ScriptLoading>) => void;
  setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
  setCloudScript: (script: Script) => void;
  searchRequest: { keyword: string; type: SearchType };
  setSearchRequest: SetSearchRequest;
  handleDelete: (item: ScriptLoading) => void;
  handleConfig: (
    item: ScriptLoading,
    setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void
  ) => void;
  handleRunStop: (item: ScriptLoading) => Promise<void>;
}

export const ScriptCard = ({
  loadingList,
  scriptList,
  scriptListSortOrder,
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
  const { guideMode } = useAppContext();

  // 如果是引导模式，且没有脚本，则创建一条演示数据
  const list = useMemo(
    () =>
      guideMode && scriptList.length === 0
        ? [
            {
              uuid: "demo-uuid-1234",
              name: "Demo Script",
              namespace: "demo",
              sort: 0,
              createtime: Date.now(),
              checktime: Date.now(),
              metadata: {},
              type: SCRIPT_TYPE_NORMAL,
              favorite: [{ match: "Example", icon: "", website: "https://example.com" }],
            } as ScriptLoading,
          ]
        : scriptList,
    [guideMode, scriptList]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortableIds = useMemo(() => scriptList.map((s) => ({ id: s.uuid })), [scriptList]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    if (active.id !== over.id) {
      scriptListSortOrder!({ active: active.id as string, over: over.id as string });
    }
  };

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
        <div className="flex flex-row justify-between items-center" style={{ padding: "8px 0" }}>
          <div className="flex-1">
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
        {list.length === 0 ? (
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
          <div
            className="script-card-grid"
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                {list.map((item) => (
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
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </>
  );
};

ScriptCard.displayName = "ScriptCard";

export default ScriptCard;
