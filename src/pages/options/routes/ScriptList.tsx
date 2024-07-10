import React, { useEffect, useRef, useState } from "react";
import {
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
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { ComponentsProps } from "@arco-design/web-react/es/Table/interface";
import {
  Script,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  UserConfig,
} from "@App/app/repo/scripts";
import {
  IconClockCircle,
  IconCommon,
  IconEdit,
  IconLink,
  IconMenu,
  IconSearch,
  IconUserAdd,
} from "@arco-design/web-react/icon";
import {
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiSettings3Fill,
  RiStopFill,
  RiUploadCloudFill,
} from "react-icons/ri";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ScriptController from "@App/app/service/script/controller";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import Text from "@arco-design/web-react/es/Typography/text";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import IoC from "@App/app/ioc";
import RuntimeController from "@App/runtime/content/runtime";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import SynchronizeController from "@App/app/service/synchronize/controller";
import { useTranslation } from "react-i18next";
import { nextTime, semTime } from "@App/pkg/utils/utils";
import { i18nName } from "@App/locales/locales";
import { SystemConfig } from "@App/pkg/config/config";
import {
  getValues,
  ListHomeRender,
  ScriptIcons,
  scriptListSort,
} from "./utils";

type ListType = Script & { loading?: boolean };

function ScriptList() {
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const synchronizeCtrl = IoC.instance(
    SynchronizeController
  ) as SynchronizeController;
  const runtimeCtrl = IoC.instance(RuntimeController) as RuntimeController;
  const [scriptList, setScriptList] = useState<ListType[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const navigate = useNavigate();
  const openUserConfig = parseInt(
    useSearchParams()[0].get("userConfig") || "",
    10
  );
  const [showAction, setShowAction] = useState(false);
  const [action, setAction] = useState("");
  const [select, setSelect] = useState<Script[]>([]);
  const [selectColumn, setSelectColumn] = useState(0);
  const systemConfig = IoC.instance(SystemConfig) as SystemConfig;

  const { t } = useTranslation();

  useEffect(() => {
    // Monitor script running status
    const channel = runtimeCtrl.watchRunStatus();
    channel.setHandler(([id, status]: any) => {
      setScriptList((list) => {
        return list.map((item) => {
          if (item.id === id) {
            item.runStatus = status;
          }
          return item;
        });
      });
    });
    return () => {
      channel.disChannel();
    };
  }, []);

  const columns: ColumnProps[] = [
    {
      title: "#",
      dataIndex: "sort",
      width: 70,
      key: "#",
      sorter: (a, b) => a.sort - b.sort,
      render(col) {
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
      render: (col, item: ListType) => {
        return (
          <Switch
            checked={item.status === SCRIPT_STATUS_ENABLE}
            loading={item.loading}
            disabled={item.loading}
            onChange={(checked) => {
              setScriptList((list) => {
                const index = list.findIndex((script) => script.id === item.id);
                list[index].loading = true;
                let p: Promise<any>;
                if (checked) {
                  p = scriptCtrl.enable(item.id).then(() => {
                    list[index].status = SCRIPT_STATUS_ENABLE;
                  });
                } else {
                  p = scriptCtrl.disable(item.id).then(() => {
                    list[index].status = SCRIPT_STATUS_DISABLE;
                  });
                }
                p.catch((err) => {
                  Message.error(err);
                }).finally(() => {
                  list[index].loading = false;
                  setScriptList([...list]);
                });
                return list;
              });
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
      // eslint-disable-next-line react/no-unstable-nested-components
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
              to={`/script/editor/${item.id}`}
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
      render(col, item: Script) {
        const toLogger = () => {
          navigate({
            pathname: "logger",
            search: `query=${encodeURIComponent(
              JSON.stringify([
                { key: "scriptId", value: item.id },
                {
                  key: "component",
                  value: "GM_log",
                },
              ])
            )}`,
          });
        };
        if (item.type === SCRIPT_TYPE_NORMAL) {
          return (
            <Tooltip content={t("foreground_page_script_tooltip")}>
              <Tag
                style={{
                  cursor: "pointer",
                }}
                icon={<IconCommon color="" />}
                color="cyan"
                bordered
                onClick={toLogger}
              >
                {t("page_script")}
              </Tag>
            </Tooltip>
          );
        }
        let tooltip = "";
        if (item.type === SCRIPT_TYPE_BACKGROUND) {
          tooltip = t("background_script_tooltip");
        } else {
          tooltip = `${t("scheduled_script_tooltip")} ${nextTime(
            item.metadata.crontab[0]
          )}`;
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
              {item.runStatus === SCRIPT_RUN_STATUS_RUNNING
                ? t("running")
                : t("completed")}
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
                  {t("subscription_link")}:{" "}
                  {decodeURIComponent(item.subscribeUrl)}
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
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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
              scriptCtrl
                .checkUpdate(script.id)
                .then((res) => {
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
      render(col, item: Script) {
        return (
          <Button.Group>
            <Link to={`/script/editor/${item.id}`}>
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
                setScriptList((list) => {
                  return list.filter((i) => i.id !== item.id);
                });
                scriptCtrl.delete(item.id).catch((e) => {
                  Message.error(`${t("delete_failed")}: ${e}`);
                });
              }}
            >
              <Button
                type="text"
                icon={<RiDeleteBin5Fill />}
                onClick={() => {}}
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
                  // Get value
                  getValues(item).then((newValues) => {
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
            {item.type !== SCRIPT_TYPE_NORMAL &&
              (item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? (
                <Button
                  type="text"
                  icon={<RiStopFill />}
                  onClick={async () => {
                    // Stop script
                    Message.loading({
                      id: "script-stop",
                      content: t("stopping_script"),
                    });
                    await runtimeCtrl.stopScript(item.id);
                    Message.success({
                      id: "script-stop",
                      content: t("script_stopped"),
                      duration: 3000,
                    });
                  }}
                  style={{
                    color: "var(--color-text-2)",
                  }}
                />
              ) : (
                <Button
                  type="text"
                  icon={<RiPlayFill />}
                  onClick={async () => {
                    // Start script
                    Message.loading({
                      id: "script-run",
                      content: t("starting_script"),
                    });
                    await runtimeCtrl.startScript(item.id);
                    Message.success({
                      id: "script-run",
                      content: t("script_started"),
                      duration: 3000,
                    });
                    setScriptList((list) => {
                      for (let i = 0; i < list.length; i += 1) {
                        if (list[i].id === item.id) {
                          list[i].runStatus = SCRIPT_RUN_STATUS_RUNNING;
                          break;
                        }
                      }
                      return [...list];
                    });
                  }}
                  style={{
                    color: "var(--color-text-2)",
                  }}
                />
              ))}
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
  ];

  const [newColumns, setNewColumns] = useState<ColumnProps[]>([]);

  useEffect(() => {
    const dao = new ScriptDAO();
    dao.table
      .orderBy("sort")
      .toArray()
      .then(async (scripts) => {
        // Sort when a new script is added (-1)
        scriptListSort(scripts);
        // Open user config panel
        if (openUserConfig) {
          const script = scripts.find((item) => item.id === openUserConfig);
          if (script && script.config) {
            setUserConfig({
              script,
              userConfig: script.config,
              values: await getValues(script),
            });
          }
        }
        setScriptList(scripts);
      });

    setNewColumns(
      columns.map((item) => {
        item.width =
          systemConfig.scriptListColumnWidth[item.key!] ?? item.width;
        return item;
      })
    );
  }, []);

  // 处理拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // eslint-disable-next-line react/no-unstable-nested-components
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
            setScriptList((items) => {
              let oldIndex = 0;
              let newIndex = 0;
              items.forEach((item, index) => {
                if (item.id === active.id) {
                  oldIndex = index;
                } else if (item.id === over.id) {
                  newIndex = index;
                }
              });
              const newItems = arrayMove(items, oldIndex, newIndex);
              scriptListSort(newItems);
              return newItems;
            });
          }
        }}
      >
        <SortableContext
          items={scriptList}
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

  // eslint-disable-next-line react/no-unstable-nested-components
  const SortableItem = (props: any) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: props!.record.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    // 替换排序列,使其可以拖拽
    // eslint-disable-next-line react/destructuring-assignment
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

  const components: ComponentsProps = {
    table: React.forwardRef(SortableWrapper),
    body: {
      // tbody: SortableWrapper,
      row: SortableItem,
    },
  };

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
                  <Select.Option value="enable">{t("enable")}</Select.Option>
                  <Select.Option value="disable">{t("disable")}</Select.Option>
                  <Select.Option value="export">{t("export")}</Select.Option>
                  <Select.Option value="delete">{t("delete")}</Select.Option>
                  <Select.Option value="check_update">
                    {t("check_update")}
                  </Select.Option>
                </Select>
                <Button
                  type="primary"
                  size="mini"
                  onClick={() => {
                    const ids: number[] = [];
                    switch (action) {
                      case "enable":
                        select.forEach((item) => {
                          scriptCtrl.enable(item.id).then(() => {
                            const list = scriptList.map((script) => {
                              if (script.id === item.id) {
                                script.status = SCRIPT_STATUS_ENABLE;
                              }
                              return script;
                            });
                            setScriptList(list);
                          });
                        });
                        break;
                      case "disable":
                        select.forEach((item) => {
                          scriptCtrl.disable(item.id).then(() => {
                            const list = scriptList.map((script) => {
                              if (script.id === item.id) {
                                script.status = SCRIPT_STATUS_DISABLE;
                              }
                              return script;
                            });
                            setScriptList(list);
                          });
                        });
                        break;
                      case "export":
                        select.forEach((item) => {
                          ids.push(item.id);
                        });
                        synchronizeCtrl.backup(ids);
                        break;
                      case "delete":
                        // eslint-disable-next-line no-restricted-globals, no-alert
                        if (confirm(t("list.confirm_delete")!)) {
                          select.forEach((item) => {
                            scriptCtrl.delete(item.id).then(() => {
                              setScriptList((list) => {
                                return list.filter((script) => {
                                  return script.id !== item.id;
                                });
                              });
                            });
                          });
                        }
                        break;
                      // 批量检查更新
                      case "check_update":
                        // eslint-disable-next-line no-restricted-globals, no-alert
                        if (confirm(t("list.confirm_update")!)) {
                          select.forEach((item, index, array) => {
                            if (!item.checkUpdateUrl) {
                              return;
                            }
                            Message.warning({
                              id: "checkupdateStart",
                              content: t("starting_updates"),
                            });
                            scriptCtrl
                              .checkUpdate(item.id)
                              .then((res) => {
                                if (res) {
                                  // 需要更新
                                  Message.warning({
                                    id: "checkupdate",
                                    content: `${i18nName(item)} ${t(
                                      "new_version_available"
                                    )}`,
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
                                  content: `${t("update_check_failed")}: ${
                                    e.message
                                  }`,
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
                    <Select.Option value={index}>{column.title}</Select.Option>
                  ))}
                </Select>
                <Dropdown
                  droplist={
                    <Menu>
                      <Menu.Item
                        key="auto"
                        onClick={() => {
                          setNewColumns((cols) => {
                            cols[selectColumn].width = 0;
                            return [...cols];
                          });
                        }}
                      >
                        自动
                      </Menu.Item>
                      <Menu.Item
                        key="hide"
                        onClick={() => {
                          setNewColumns((cols) => {
                            cols[selectColumn].width = -1;
                            return [...cols];
                          });
                        }}
                      >
                        隐藏
                      </Menu.Item>
                      <Menu.Item
                        key="custom"
                        onClick={() => {
                          setNewColumns((cols) => {
                            cols[selectColumn].width =
                              (newColumns[selectColumn].width as number) > 0
                                ? newColumns[selectColumn].width
                                : columns[selectColumn].width;
                            return [...cols];
                          });
                        }}
                      >
                        自定义
                      </Menu.Item>
                    </Menu>
                  }
                  position="bl"
                >
                  <Input
                    type={
                      newColumns[selectColumn].width === 0 ||
                      newColumns[selectColumn].width === -1
                        ? ""
                        : "number"
                    }
                    style={{ width: "80px" }}
                    size="mini"
                    value={
                      // eslint-disable-next-line no-nested-ternary
                      newColumns[selectColumn].width === 0
                        ? t("auto")
                        : newColumns[selectColumn].width === -1
                        ? t("hide")
                        : newColumns[selectColumn].width?.toString()
                    }
                    onChange={(val) => {
                      setNewColumns((cols) => {
                        cols[selectColumn].width = parseInt(val, 10);
                        return [...cols];
                      });
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
                    systemConfig.scriptListColumnWidth = newWidth;
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
          className="arco-drag-table-container"
          components={components}
          rowKey="id"
          tableLayoutFixed
          columns={dealColumns}
          data={scriptList}
          pagination={{
            total: scriptList.length,
            pageSize: scriptList.length,
            hideOnSinglePage: true,
          }}
          style={{
            minWidth: "1100px",
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
          <UserConfigPanel
            script={userConfig.script}
            userConfig={userConfig.userConfig}
            values={userConfig.values}
          />
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
