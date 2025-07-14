import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { TbWorldWww } from "react-icons/tb";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import type { ComponentsProps } from "@arco-design/web-react/es/Table/interface";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import {
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
} from "@App/app/repo/scripts";
import { IconClockCircle, IconEdit, IconLink, IconMenu, IconSearch, IconUserAdd } from "@arco-design/web-react/icon";
import {
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiSettings3Fill,
  RiStopFill,
  RiUploadCloudFill,
} from "react-icons/ri";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { RefInputType } from "@arco-design/web-react/es/Input/interface";
import Text from "@arco-design/web-react/es/Typography/text";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import { useTranslation } from "react-i18next";
import { nextTime } from "@App/pkg/utils/cron";
import { semTime } from "@App/pkg/utils/dayjs";
import { message, systemConfig } from "@App/pages/store/global";
import { i18nName } from "@App/locales/locales";
import { ListHomeRender, ScriptIcons } from "./utils";
import { useAppDispatch, useAppSelector } from "@App/pages/store/hooks";
import type { ScriptLoading } from "@App/pages/store/features/script";
import {
  requestEnableScript,
  fetchScriptList,
  requestDeleteScript,
  selectScripts,
  sortScript,
  requestStopScript,
  requestRunScript,
  scriptClient,
  enableLoading,
  updateEnableStatus,
  synchronizeClient,
  batchDeleteScript,
} from "@App/pages/store/features/script";
import { ValueClient } from "@App/app/service/service_worker/client";
import { loadScriptFavicons } from "@App/pages/store/utils";
import { store } from "@App/pages/store/store";

type ListType = ScriptLoading;

// Memoized Avatar component to prevent unnecessary re-renders
const MemoizedAvatar = React.memo(
  ({ fav, onClick }: { fav: { match: string; icon?: string; website?: string }; onClick: () => void }) => (
    <Avatar
      key={fav.match}
      shape="square"
      style={{
        backgroundColor: "unset",
        borderWidth: 1,
      }}
      className={fav.website ? "cursor-pointer" : "cursor-default"}
      onClick={onClick}
    >
      {fav.icon ? <img title={fav.match} src={fav.icon} /> : <TbWorldWww title={fav.match} color="#aaa" size={24} />}
    </Avatar>
  )
);

MemoizedAvatar.displayName = "MemoizedAvatar";

function ScriptList() {
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const dispatch = useAppDispatch();
  const scriptList = useAppSelector(selectScripts);
  const inputRef = useRef<RefInputType>(null);
  const navigate = useNavigate();
  const openUserConfig = useSearchParams()[0].get("userConfig") || "";
  const [showAction, setShowAction] = useState(false);
  const [action, setAction] = useState("");
  const [select, setSelect] = useState<Script[]>([]);
  const [selectColumn, setSelectColumn] = useState(0);
  const { t } = useTranslation();
  const [components, setComponents] = useState<ComponentsProps | undefined>(undefined);
  const [dealColumns, setDealColumns] = useState<ColumnProps[]>([]);

  useEffect(() => {
    dispatch(fetchScriptList()).then((action) => {
      if (fetchScriptList.fulfilled.match(action)) {
        // 在脚本列表加载完成后，加载favicon
        loadScriptFavicons(action.payload);
      }
    });
  }, [dispatch]);

  const columns: ColumnProps[] = useMemo(
    () => [
      {
        title: "#",
        dataIndex: "sort",
        width: 70,
        key: "#",
        sorter: (a, b) => a.sort - b.sort,
        render(col) {
          if (col < 0) {
            return "-";
          }
          return col + 1;
        },
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
        render: (col, item: ScriptLoading) => {
          return (
            <Switch
              checked={item.status === SCRIPT_STATUS_ENABLE}
              loading={item.enableLoading}
              disabled={item.enableLoading}
              onChange={(checked) => {
                dispatch(requestEnableScript({ uuid: item.uuid, enable: checked }));
              }}
            />
          );
        },
      },
      {
        key: "name",
        title: t("name"),
        dataIndex: "name",
        sorter: (a, b) => a.name.localeCompare(b.name),
        filterIcon: <IconSearch />,
        filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
          return (
            <div className="arco-table-custom-filter">
              <Input.Search
                ref={inputRef}
                searchButton
                placeholder={t("enter_script_name")!}
                value={filterKeys[0] || ""}
                onChange={(value) => {
                  setFilterKeys(value ? [value] : []);
                }}
                onSearch={() => {
                  confirm();
                }}
              />
            </div>
          );
        },
        onFilter: (value: string, row) => {
          if (!value) {
            return true;
          }
          value = value.toLocaleLowerCase();
          row.name = row.name.toLocaleLowerCase();
          const i18n = i18nName(row).toLocaleLowerCase();
          // 空格分开关键字搜索
          const keys = value.split(" ");
          for (const key of keys) {
            if (row.name.includes(key) || i18n.includes(key)) {
              return true;
            }
          }
          return false;
        },
        onFilterDropdownVisibleChange: (visible) => {
          if (visible) {
            setTimeout(() => inputRef.current!.focus(), 150);
          }
        },
        className: "max-w-[240px]",
        render: (col, item: ListType) => {
          return (
            <Tooltip content={col} position="tl">
              <Link
                to={`/script/editor/${item.uuid}`}
                style={{
                  textDecoration: "none",
                }}
              >
                <Text
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
                </Text>
              </Link>
            </Tooltip>
          );
        },
      },
      {
        title: t("version"),
        dataIndex: "version",
        key: "version",
        width: 120,
        align: "center",
        render(col, item: Script) {
          return item.metadata.version && item.metadata.version[0];
        },
      },
      {
        key: "apply_to_run_status",
        title: t("apply_to_run_status"),
        width: t("script_list_apply_to_run_status_width"),
        className: "apply_to_run_status",
        render(col, item: ListType) {
          const toLogger = () => {
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
            });
          };
          if (item.type === SCRIPT_TYPE_NORMAL) {
            // 处理站点icon
            return (
              <>
                <Avatar.Group size={20}>
                  {item.favorite &&
                    // 排序并且只显示前5个
                    // 排序将有icon的放在前面
                    [...item.favorite]
                      .sort((a, b) => {
                        if (a.icon && !b.icon) return -1;
                        if (!a.icon && b.icon) return 1;
                        return a.match.localeCompare(b.match);
                      })
                      .slice(0, 4)
                      .map((fav) => (
                        <MemoizedAvatar
                          key={fav.match}
                          fav={fav}
                          onClick={() => {
                            if (fav.website) {
                              window.open(fav.website, "_blank");
                            }
                          }}
                        />
                      ))}
                  {item.favorite && item.favorite.length > 4 && "..."}
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
          );
        },
      },
      {
        title: t("source"),
        dataIndex: "origin",
        key: "origin",
        width: 100,
        render(col, item: Script) {
          if (item.subscribeUrl) {
            return (
              <Tooltip
                content={
                  <p style={{ margin: 0 }}>
                    {t("subscription_link")}: {decodeURIComponent(item.subscribeUrl)}
                  </p>
                }
              >
                <Tag
                  icon={<IconLink />}
                  color="orange"
                  bordered
                  style={{
                    cursor: "pointer",
                  }}
                >
                  {t("subscription_installation")}
                </Tag>
              </Tooltip>
            );
          }
          if (!item.origin) {
            return (
              <Tag
                icon={<IconEdit />}
                color="purple"
                bordered
                style={{
                  cursor: "pointer",
                }}
              >
                {t("manually_created")}
              </Tag>
            );
          }
          return (
            <Tooltip
              content={
                <p style={{ margin: 0, padding: 0 }}>
                  {t("script_link")}: {decodeURIComponent(item.origin)}
                </p>
              }
            >
              <Tag
                icon={<IconUserAdd color="" />}
                color="green"
                bordered
                style={{
                  cursor: "pointer",
                }}
              >
                {t("user_installation")}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: t("home"),
        dataIndex: "home",
        align: "center",
        key: "home",
        width: 100,
        render(col, item: Script) {
          return <ListHomeRender script={item} />;
        },
      },
      {
        title: t("sorting"),
        className: "script-sort",
        key: "sort",
        width: 80,
        align: "center",
        render() {
          return (
            <IconMenu
              style={{
                cursor: "move",
              }}
            />
          );
        },
      },
      {
        title: t("last_updated"),
        dataIndex: "updatetime",
        align: "center",
        key: "updatetime",
        width: t("script_list_last_updated_width"),
        sorter: (a, b) => a.updatetime - b.updatetime,
        render(col, script: Script) {
          return (
            <span
              style={{
                cursor: "pointer",
              }}
              onClick={() => {
                if (!script.checkUpdateUrl) {
                  Message.warning(t("update_not_supported")!);
                  return;
                }
                Message.info({
                  id: "checkupdate",
                  content: t("checking_for_updates"),
                });
                scriptClient
                  .requestCheckUpdate(script.uuid)
                  .then((res) => {
                    console.log("res", res);
                    if (res) {
                      Message.warning({
                        id: "checkupdate",
                        content: t("new_version_available"),
                      });
                    } else {
                      Message.success({
                        id: "checkupdate",
                        content: t("latest_version"),
                      });
                    }
                  })
                  .catch((e) => {
                    Message.error({
                      id: "checkupdate",
                      content: `${t("update_check_failed")}: ${e.message}`,
                    });
                  });
              }}
            >
              {semTime(new Date(col))}
            </span>
          );
        },
      },
      {
        title: t("action"),
        dataIndex: "action",
        key: "action",
        width: 160,
        render(col, item: ScriptLoading) {
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
              <Popconfirm
                title={t("confirm_delete_script")}
                icon={<RiDeleteBin5Fill />}
                onOk={() => {
                  dispatch(requestDeleteScript(item.uuid));
                }}
              >
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
                  onClick={() => {
                    new ValueClient(message).getScriptValue(item).then((newValues) => {
                      setUserConfig({
                        userConfig: { ...item.config! },
                        script: item,
                        values: newValues,
                      });
                    });
                  }}
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
                  onClick={async () => {
                    if (item.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
                      // Stop script
                      Message.loading({
                        id: "script-stop",
                        content: t("stopping_script"),
                      });
                      await dispatch(requestStopScript(item.uuid));
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
                      await dispatch(requestRunScript(item.uuid));
                      Message.success({
                        id: "script-run",
                        content: t("script_started"),
                        duration: 3000,
                      });
                    }
                  }}
                  style={{
                    color: "var(--color-text-2)",
                  }}
                />
              )}
              {item.metadata.cloudcat && (
                <Button
                  type="text"
                  icon={<RiUploadCloudFill />}
                  onClick={() => {
                    setCloudScript(item);
                  }}
                  style={{
                    color: "var(--color-text-2)",
                  }}
                />
              )}
            </Button.Group>
          );
        },
      },
    ],
    [t, dispatch, inputRef, navigate]
  );

  const [newColumns, setNewColumns] = useState<ColumnProps[]>([]);

  // 设置列和判断是否打开用户配置
  useEffect(() => {
    if (openUserConfig) {
      const dao = new ScriptDAO();
      dao.get(openUserConfig).then((script) => {
        if (script && script.config) {
          new ValueClient(message).getScriptValue(script).then((values) => {
            setUserConfig({
              script,
              userConfig: script.config!,
              values: values,
            });
          });
        }
      });
    }
    systemConfig.getScriptListColumnWidth().then((columnWidth) => {
      setNewColumns(
        columns.map((item) => ({
          ...item,
          width: columnWidth[item.key!] ?? item.width,
        }))
      );
    });
  }, []);

  // 处理拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!newColumns.length) {
      return;
    }
    const SortableWrapper = (props: any, ref: any) => {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over) {
              return;
            }
            if (active.id !== over.id) {
              dispatch(sortScript({ active: active.id as string, over: over.id as string }));
            }
          }}
        >
          <SortableContext
            items={store.getState().script.scripts.map((s) => ({ ...s, id: s.uuid }))}
            strategy={verticalListSortingStrategy}
          >
            <table ref={ref} {...props} />
          </SortableContext>
        </DndContext>
      );
    };
    const dealColumns: ColumnProps[] = [];

    newColumns.forEach((item) => {
      switch (item.width) {
        case -1:
          break;
        default:
          dealColumns.push(item);
          break;
      }
    });

    const sortIndex = dealColumns.findIndex((item) => item.key === "sort");
    let SortableItem;
    if (sortIndex !== -1) {
      const SortableItemComponent = (props: any) => {
        const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props!.record.uuid });

        const style = {
          transform: CSS.Transform.toString(transform),
          transition,
        };

        // 替换排序列,使其可以拖拽
        props.children[sortIndex + 1] = (
          <td
            className="arco-table-td"
            style={{
              textAlign: "center",
            }}
            key="drag"
          >
            <div className="arco-table-cell">
              <IconMenu
                style={{
                  cursor: "move",
                }}
                {...listeners}
              />
            </div>
          </td>
        );

        return <tr ref={setNodeRef} style={style} {...attributes} {...props} />;
      };
      SortableItemComponent.displayName = "SortableItem";
      SortableItem = SortableItemComponent;
    }

    setComponents({
      table: React.forwardRef(SortableWrapper),
      body: {
        // tbody: SortableWrapper,
        row: SortableItem,
      },
    });
    setDealColumns(dealColumns);
  }, [newColumns]);

  return (
    <Card
      id="script-list"
      className="script-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <Space direction="vertical">
        {showAction && (
          <Card>
            <div
              className="flex flex-row justify-between items-center"
              style={{
                padding: "8px 6px",
              }}
            >
              <Space direction="horizontal">
                <Typography.Text>{t("batch_operations")}:</Typography.Text>
                <Select
                  style={{ minWidth: "100px" }}
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
                      dispatch(enableLoading({ uuids: uuids, loading: true }));
                      Promise.allSettled(uuids.map((uuid) => scriptClient.enable(uuid, enable))).finally(() => {
                        dispatch(updateEnableStatus({ uuids: uuids, enable: enable }));
                        dispatch(enableLoading({ uuids: uuids, loading: false }));
                      });
                    };
                    let l: number | undefined;
                    switch (action) {
                      case "enable":
                        enableAction(true);
                        break;
                      case "disable":
                        enableAction(false);
                        break;
                      case "export": {
                        const uuids: string[] = [];
                        select.forEach((item) => {
                          uuids.push(item.uuid);
                        });
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
                          dispatch(batchDeleteScript(uuids));
                          Promise.allSettled(uuids.map((uuid) => scriptClient.delete(uuid)));
                        }
                        break;
                      case "pin_to_top": {
                        // 将选中的脚本置顶
                        l = select.length;
                        if (l > 0) {
                          // 获取当前所有脚本列表
                          const currentScripts = store.getState().script.scripts;
                          // 将选中的脚本依次置顶（从后往前，保持选中脚本之间的相对顺序）
                          for (let i = l - 1; i >= 0; i--) {
                            const script = select[i];
                            // 找到脚本当前的位置
                            const scriptIndex = currentScripts.findIndex((s) => s.uuid === script.uuid);
                            if (scriptIndex > 0) {
                              // 如果不是已经在最顶部
                              // 将脚本置顶（移动到第一个位置）
                              dispatch(sortScript({ active: script.uuid, over: currentScripts[0].uuid }));
                            }
                          }
                          Message.success({
                            content: t("scripts_pinned_to_top"),
                            duration: 3000,
                          });
                        }
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
                <Typography.Text>{t("resize_column_width")}:</Typography.Text>
                <Select
                  style={{ minWidth: "80px" }}
                  size="mini"
                  value={newColumns[selectColumn].title?.toString()}
                  onChange={(val) => {
                    const index = parseInt(val as string, 10);
                    setSelectColumn(index);
                  }}
                >
                  {newColumns.map((column, index) => (
                    <Select.Option key={index} value={index}>
                      {column.title}
                    </Select.Option>
                  ))}
                </Select>
                <Dropdown
                  droplist={
                    <Menu>
                      <Menu.Item
                        key="auto"
                        onClick={() => {
                          setNewColumns((cols) =>
                            cols.map((col, i) => (i === selectColumn ? { ...col, width: 0 } : col))
                          );
                        }}
                      >
                        {t("auto")}
                      </Menu.Item>
                      <Menu.Item
                        key="hide"
                        onClick={() => {
                          setNewColumns((cols) =>
                            cols.map((col, i) => (i === selectColumn ? { ...col, width: -1 } : col))
                          );
                        }}
                      >
                        {t("hide")}
                      </Menu.Item>
                      <Menu.Item
                        key="custom"
                        onClick={() => {
                          setNewColumns((cols) =>
                            cols.map((col, i) =>
                              i === selectColumn
                                ? {
                                    ...col,
                                    width:
                                      (newColumns[selectColumn].width as number) > 0
                                        ? newColumns[selectColumn].width
                                        : columns[selectColumn].width,
                                  }
                                : col
                            )
                          );
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
                    onChange={(val) => {
                      setNewColumns((cols) =>
                        cols.map((col, i) => (i === selectColumn ? { ...col, width: parseInt(val, 10) } : col))
                      );
                    }}
                  />
                </Dropdown>
                <Button
                  type="primary"
                  size="mini"
                  onClick={() => {
                    const newWidth: { [key: string]: number } = {};
                    newColumns.forEach((column) => {
                      newWidth[column.key! as string] = column.width as number;
                    });
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
          className="arco-drag-table-container"
          components={components}
          rowKey="uuid"
          tableLayoutFixed
          columns={dealColumns.length ? dealColumns : columns}
          data={scriptList}
          pagination={{
            total: scriptList.length,
            pageSize: scriptList.length,
            hideOnSinglePage: true,
          }}
          style={{
            minWidth: "1200px",
          }}
          rowSelection={{
            type: "checkbox",
            onChange(_, selectedRows) {
              setShowAction(true);
              setSelect(selectedRows);
            },
          }}
        />
        {userConfig && (
          <UserConfigPanel script={userConfig.script} userConfig={userConfig.userConfig} values={userConfig.values} />
        )}
        <CloudScriptPlan
          script={cloudScript}
          onClose={() => {
            setCloudScript(undefined);
          }}
        />
      </Space>
    </Card>
  );
}

export default ScriptList;
