import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Input,
  Message,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { ComponentsProps } from "@arco-design/web-react/es/Table/interface";
import {
  Script,
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  UserConfig,
} from "@App/app/repo/scripts";
import {
  IconBug,
  IconClockCircle,
  IconCode,
  IconCommon,
  IconEdit,
  IconHome,
  IconLink,
  IconMenu,
  IconSearch,
  IconUserAdd,
} from "@arco-design/web-react/icon";
import { nextTime, semTime } from "@App/pkg/utils/utils";
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
import ValueManager from "@App/app/service/value/manager";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import { scriptListSort } from "./utils";

type ListType = Script & { loading?: boolean };

function getValues(script: Script) {
  const { config } = script;
  return (IoC.instance(ValueManager) as ValueManager)
    .getValues(script)
    .then((data) => {
      const newValues: { [key: string]: any } = {};
      Object.keys(config!).forEach((tabKey) => {
        const tab = config![tabKey];
        Object.keys(tab).forEach((key) => {
          newValues[`${tabKey}.${key}`] =
            data[`${tabKey}.${key}`] === undefined
              ? config![tabKey][key].default
              : data[`${tabKey}.${key}`].value;
        });
      });
      return newValues;
    });
}

function ScriptList() {
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const runtimeCtrl = IoC.instance(RuntimeController) as RuntimeController;
  const [scriptList, setScriptList] = useState<ListType[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const navigate = useNavigate();
  const openUserConfig = parseInt(
    useSearchParams()[0].get("userConfig") || "",
    10
  );

  useEffect(() => {
    // 监听脚本运行状态
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
      dataIndex: "id",
      width: 70,
      key: "id",
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: "开启",
      width: 100,
      key: "enable",
      sorter(a, b) {
        return a.status - b.status;
      },
      filters: [
        {
          text: "开启",
          value: SCRIPT_STATUS_ENABLE,
        },
        {
          text: "关闭",
          value: SCRIPT_STATUS_DISABLE,
        },
      ],
      onFilter: (value, row) => row.status === value,
      render: (col, item: ListType, index) => {
        return (
          <Switch
            checked={item.status === SCRIPT_STATUS_ENABLE}
            loading={item.loading}
            disabled={item.loading}
            onChange={(checked) => {
              scriptList[index].loading = true;
              setScriptList([...scriptList]);
              let p: Promise<any>;
              if (checked) {
                p = scriptCtrl.enable(item.id).then(() => {
                  scriptList[index].status = SCRIPT_STATUS_ENABLE;
                });
              } else {
                p = scriptCtrl.disable(item.id).then(() => {
                  scriptList[index].status = SCRIPT_STATUS_DISABLE;
                });
              }
              p.catch((err) => {
                Message.error(err);
              }).finally(() => {
                scriptList[index].loading = false;
                setScriptList([...scriptList]);
              });
            }}
          />
        );
      },
    },
    {
      title: "名称",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      filterIcon: <IconSearch />,
      key: "name",
      // eslint-disable-next-line react/no-unstable-nested-components
      filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
        return (
          <div className="arco-table-custom-filter">
            <Input.Search
              ref={inputRef}
              searchButton
              placeholder="请输入脚本名"
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
      onFilter: (value, row) => (value ? row.name.indexOf(value) !== -1 : true),
      onFilterDropdownVisibleChange: (visible) => {
        if (visible) {
          setTimeout(() => inputRef.current!.focus(), 150);
        }
      },
      className: "max-w-[240px]",
      render: (col) => {
        return (
          <Tooltip content={col} position="tl">
            <Text
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {col}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 120,
      align: "center",
      render(col, item: Script) {
        return item.metadata.version && item.metadata.version[0];
      },
    },
    {
      title: "应用至/运行状态",
      dataIndex: "status",
      width: 140,
      key: "status",
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
            <Tooltip content="前台页面脚本,会在指定的页面上运行">
              <Tag
                style={{
                  cursor: "pointer",
                }}
                icon={<IconCommon color="" />}
                color="cyan"
                bordered
                onClick={toLogger}
              >
                页面脚本
              </Tag>
            </Tooltip>
          );
        }
        let tooltip = "";
        if (item.type === SCRIPT_TYPE_BACKGROUND) {
          tooltip = "后台脚本,会在指定的页面上运行";
        } else {
          tooltip = `定时脚本,下一次运行时间: ${nextTime(
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
                ? "运行中"
                : "运行完毕"}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "来源",
      dataIndex: "origin",
      key: "origin",
      width: 100,
      render(col, item: Script) {
        if (item.subscribeUrl) {
          return (
            <Tooltip
              content={
                <p style={{ margin: 0 }}>
                  订阅链接: {decodeURIComponent(item.subscribeUrl)}
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
                订阅安装
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
              手动新建
            </Tag>
          );
        }
        return (
          <Tooltip
            content={
              <p style={{ margin: 0, padding: 0 }}>
                脚本链接: {decodeURIComponent(item.origin)}
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
              用户安装
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "主页",
      dataIndex: "home",
      align: "center",
      key: "home",
      width: 100,
      render(col, item: Script) {
        return (
          <Space size="mini">
            {item.metadata.homepage && (
              <Tooltip content="脚本主页">
                <Button
                  type="text"
                  iconOnly
                  icon={<IconHome />}
                  size="small"
                  href={item.metadata.homepage[0]}
                  target="_blank"
                />
              </Tooltip>
            )}
            {item.metadata.homepageurl && (
              <Tooltip content="脚本主页">
                <Button
                  type="text"
                  iconOnly
                  icon={<IconHome />}
                  size="small"
                  href={item.metadata.homepageurl[0]}
                  target="_blank"
                />
              </Tooltip>
            )}
            {item.metadata.website && (
              <Tooltip content="脚本站点">
                <Button
                  type="text"
                  iconOnly
                  icon={<IconHome />}
                  size="small"
                  href={item.metadata.website[0]}
                  target="_blank"
                />
              </Tooltip>
            )}
            {item.metadata.source && (
              <Tooltip content="脚本源码">
                <Button
                  type="text"
                  iconOnly
                  icon={<IconCode />}
                  size="small"
                  href={item.metadata.source[0]}
                  target="_blank"
                />
              </Tooltip>
            )}
            {item.metadata.supporturl && (
              <Tooltip content="BUG反馈/脚本支持站点">
                <Button
                  type="text"
                  iconOnly
                  icon={<IconBug />}
                  size="small"
                  href={item.metadata.supporturl[0]}
                  target="_blank"
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "排序",
      dataIndex: "sort",
      key: "sort",
      width: 80,
      sorter: (a, b) => a.sort - b.sort,
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
      title: "最后更新",
      dataIndex: "updatetime",
      align: "center",
      key: "updatetime",
      width: 100,
      render(col, script: Script) {
        return (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            style={{
              cursor: "pointer",
            }}
            onClick={() => {
              if (!script.checkUpdateUrl) {
                Message.warning("该脚本不支持检查更新");
                return;
              }
              Message.info({
                id: "checkupdate",
                content: "检查更新中...",
              });
              scriptCtrl
                .checkUpdate(script.id)
                .then((res) => {
                  if (res) {
                    Message.warning({
                      id: "checkupdate",
                      content: "存在新版本",
                    });
                  } else {
                    Message.success({
                      id: "checkupdate",
                      content: "已是最新版本",
                    });
                  }
                })
                .catch((e) => {
                  Message.error({
                    id: "checkupdate",
                    content: `检查更新失败: ${e.message}`,
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
      title: "操作",
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
              title="确定要删除此脚本吗?"
              icon={<RiDeleteBin5Fill />}
              onOk={() => {
                setScriptList((list) => {
                  return list.filter((i) => i.id !== item.id);
                });
                scriptCtrl.delete(item.id).catch((e) => {
                  Message.error(`删除失败: ${e}`);
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
                  // 获取value
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
                    // 停止脚本
                    Message.loading({
                      id: "script-stop",
                      content: "正在停止脚本",
                    });
                    await runtimeCtrl.stopScript(item.id);
                    Message.success({
                      id: "script-stop",
                      content: "脚本已停止",
                      duration: 3000,
                    });
                    setScriptList((list) => {
                      for (let i = 0; i < list.length; i += 1) {
                        if (list[i].id === item.id) {
                          list[i].runStatus = SCRIPT_RUN_STATUS_COMPLETE;
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
              ) : (
                <Button
                  type="text"
                  icon={<RiPlayFill />}
                  onClick={async () => {
                    // 启动脚本
                    Message.loading({
                      id: "script-run",
                      content: "正在启动脚本...",
                    });
                    await runtimeCtrl.startScript(item.id);
                    Message.success({
                      id: "script-run",
                      content: "脚本已启动",
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

  useEffect(() => {
    const dao = new ScriptDAO();
    dao.table
      .orderBy("sort")
      .toArray()
      .then(async (scripts) => {
        // 新脚本加入时是-1,进行一次排序
        scriptListSort(scripts);
        // 打开用户配置面板
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
  }, []);

  // 处理拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // eslint-disable-next-line react/no-unstable-nested-components
  const SortableWrapper = (props: any) => {
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
          <tbody {...props} />
        </SortableContext>
      </DndContext>
    );
  };

  // eslint-disable-next-line react/no-unstable-nested-components
  const SortableItem = (props: any) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: props!.record.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    // 替换第七列,使其可以拖拽
    // eslint-disable-next-line react/destructuring-assignment
    props.children[7] = (
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
    body: {
      tbody: SortableWrapper,
      row: SortableItem,
    },
  };

  return (
    <Card
      className="script-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <Table
        className="arco-drag-table-container"
        components={components}
        rowKey="id"
        tableLayoutFixed
        columns={columns}
        data={scriptList}
        pagination={{
          total: scriptList.length,
          pageSize: scriptList.length,
          hideOnSinglePage: true,
        }}
        style={{
          minWidth: "1100px",
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
    </Card>
  );
}

export default ScriptList;
