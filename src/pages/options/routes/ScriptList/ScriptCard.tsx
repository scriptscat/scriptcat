import React, { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Divider,
  Input,
  Message,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { Link, useNavigate } from "react-router-dom";
import { IconClockCircle } from "@arco-design/web-react/icon";
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
import {
  requestDeleteScripts,
  requestEnableScript,
  requestFilterResult,
  requestRunScript,
  requestStopScript,
} from "@App/pages/store/features/script";
import { ValueClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { nextTime } from "@App/pkg/utils/cron";
import { semTime } from "@App/pkg/utils/dayjs";
import { i18nName } from "@App/locales/locales";
import { hashColor, ScriptIcons } from "../utils";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { parseTags } from "@App/app/repo/metadata";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { EnableSwitch, HomeCell, MemoizedAvatar, SourceCell } from "./components";
import { useTranslation } from "react-i18next";
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from "react-icons/vsc";
import { MdViewList } from "react-icons/md";

const { Text } = Typography;

interface ScriptCardItemProps {
  item: ScriptLoading;
  updateScriptList: (data: Partial<Script | ScriptLoading>) => void;
  updateEntry: (uuids: string[], data: Partial<Script | ScriptLoading>) => void;
  setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
  setCloudScript: (script: Script) => void;
}

export const ScriptCardItem = React.memo(
  ({ item, updateScriptList, updateEntry, setUserConfig, setCloudScript }: ScriptCardItemProps) => {
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
            .slice(0, 4);
      return {
        trimmed: fav2,
        originalLen: fav1?.length ?? 0,
      };
    }, [item.favorite]);

    const { handleDelete, handleConfig, handleRunStop, handleCloud } = {
      handleDelete: () => {
        const { uuid } = item;
        updateScriptList({ uuid, actionLoading: true });
        requestDeleteScripts([item.uuid]);
      },
      handleConfig: () => {
        new ValueClient(message).getScriptValue(item).then((newValues) => {
          setUserConfig({
            userConfig: { ...item.config! },
            script: item,
            values: newValues,
          });
        });
      },
      handleRunStop: async () => {
        if (item.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
          Message.loading({
            id: "script-stop",
            content: t("stopping_script"),
          });
          updateEntry([item.uuid], { actionLoading: true });
          await requestStopScript(item.uuid);
          updateEntry([item.uuid], { actionLoading: false });
          Message.success({
            id: "script-stop",
            content: t("script_stopped"),
            duration: 3000,
          });
        } else {
          Message.loading({
            id: "script-run",
            content: t("starting_script"),
          });
          updateEntry([item.uuid], { actionLoading: true });
          await requestRunScript(item.uuid);
          updateEntry([item.uuid], { actionLoading: false });
          Message.success({
            id: "script-run",
            content: t("script_started"),
            duration: 3000,
          });
        }
      },
      handleCloud: () => {
        setCloudScript(item);
      },
    };

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
          marginBottom: "16px",
          position: "relative",
        }}
      >
        <div className="flex flex-col gap-3">
          {/* 头部：名称和开关 */}
          <div className="flex flex-row justify-between items-start">
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
                    }}
                  >
                    {i18nName(item)}
                  </Text>
                </div>
              </Link>
              {tags.length > 0 && (
                <Space wrap style={{ marginBottom: 8 }}>
                  {tags.map((tag) => (
                    <Tag key={tag} color={hashColor(tag)} size="small">
                      {tag}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
            <EnableSwitch
              status={item.status}
              enableLoading={item.enableLoading}
              onChange={(checked: boolean) => {
                updateScriptList({ uuid: item.uuid, enableLoading: true });
                requestEnableScript({ uuid: item.uuid, enable: checked });
              }}
            />
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
            <div>
              <span className="font-medium">
                {t("last_updated")}
                {": "}
              </span>
              <span>{semTime(new Date(item.updatetime || 0))}</span>
            </div>
          </div>

          {/* 应用范围/运行状态 */}
          <div>
            {item.type === SCRIPT_TYPE_NORMAL ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {t("apply_to_run_status")}
                  {":"}
                </span>
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
                  {favoriteMemo.originalLen > 4 && <span className="text-xs ml-1">{"..."}</span>}
                </Avatar.Group>
              </div>
            ) : (
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
          </div>

          {/* 来源 */}
          <div>
            <SourceCell item={item} t={t} />
          </div>

          {/* 主页链接 */}
          {(item.metadata.homepage || item.metadata.supportUrl) && (
            <div>
              <HomeCell item={item} />
            </div>
          )}

          <Divider style={{ margin: "8px 0" }} />

          {/* 操作按钮 */}
          <div className="flex flex-row justify-between items-center">
            <Space>
              <Link to={`/script/editor/${item.uuid}`}>
                <Button type="outline" icon={<RiPencilFill />} size="small">
                  {t("edit")}
                </Button>
              </Link>
              {item.config && (
                <Button type="outline" icon={<RiSettings3Fill />} size="small" onClick={handleConfig}>
                  {t("settings")}
                </Button>
              )}
              {item.type !== SCRIPT_TYPE_NORMAL && (
                <Button
                  type="outline"
                  icon={item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? <RiStopFill /> : <RiPlayFill />}
                  loading={item.actionLoading}
                  size="small"
                  onClick={handleRunStop}
                >
                  {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("stop") : t("run")}
                </Button>
              )}
              {item.metadata.cloudcat && (
                <Button type="outline" icon={<RiUploadCloudFill />} size="small" onClick={handleCloud}>
                  {t("cloud")}
                </Button>
              )}
            </Space>
            <Popconfirm title={t("confirm_delete_script")} icon={<RiDeleteBin5Fill />} onOk={handleDelete}>
              <Button
                type="outline"
                status="danger"
                icon={<RiDeleteBin5Fill />}
                loading={item.actionLoading}
                size="small"
              >
                {t("delete")}
              </Button>
            </Popconfirm>
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
  scriptList: ScriptLoading[];
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setViewMode: (mode: "card" | "table") => void;
  updateScriptList: (data: Partial<Script | ScriptLoading>) => void;
  updateEntry: (uuids: string[], data: Partial<Script | ScriptLoading>) => void;
  setUserConfig: (config: { script: Script; userConfig: UserConfig; values: { [key: string]: any } }) => void;
  setCloudScript: (script: Script) => void;
  setFilterCache: (res: Partial<Record<string, any>>[] | null) => void;
}

export const ScriptCard = ({
  scriptList,
  sidebarOpen,
  setSidebarOpen,
  setViewMode,
  updateScriptList,
  updateEntry,
  setUserConfig,
  setCloudScript,
  setFilterCache,
}: ScriptCardProps) => {
  const [filterScriptList, setFilterScriptList] = useState<ScriptLoading[]>([]);
  const [searchValue, setSearchValue] = useState<string>("");
  const { t } = useTranslation();

  return (
    <>
      {/* 卡片视图工具栏 */}
      <Card
        style={{
          marginBottom: "16px",
          borderBottom: "1px solid var(--color-border-2)",
        }}
      >
        <div className="flex flex-row justify-between items-center" style={{ padding: "8px 0" }}>
          <div className="flex-1">
            <Input.Search
              size="small"
              searchButton
              style={{ maxWidth: 400 }}
              placeholder={t("enter_search_value", { search: `${t("name")}/${t("script_code")}` })!}
              value={searchValue}
              onChange={(value) => {
                setSearchValue(value);
              }}
              onSearch={(value) => {
                if (value) {
                  requestFilterResult({ value, type: "auto" }).then((res) => {
                    setFilterCache(res as any);
                    const cacheMap = new Map<string, any>();
                    if (res && Array.isArray(res)) {
                      for (const entry of res) {
                        cacheMap.set(entry.uuid, {
                          code: entry.code === true,
                          name: entry.name === true,
                          auto: entry.auto === true,
                        });
                      }
                    }
                    setFilterScriptList(
                      scriptList.filter((item) => {
                        const result = cacheMap.get(item.uuid);
                        return result?.auto;
                      })
                    );
                  });
                } else {
                  setFilterCache(null);
                  setFilterScriptList(scriptList);
                }
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
                icon={<MdViewList />}
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
        {filterScriptList.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 0",
              color: "var(--color-text-3)",
            }}
          >
            <Typography.Text type="secondary">{t("no_data")}</Typography.Text>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
              gap: "16px",
            }}
          >
            {filterScriptList.map((item) => (
              <ScriptCardItem
                key={item.uuid}
                item={item}
                updateScriptList={updateScriptList}
                updateEntry={updateEntry}
                setUserConfig={setUserConfig}
                setCloudScript={setCloudScript}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ScriptCard;
