import React, { useEffect, useState } from "react";
import {
  Button,
  Message,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import {
  Script,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
} from "@App/app/repo/scripts";
import { IconClockCircle, IconCommon } from "@arco-design/web-react/icon";
import { nextTime } from "@App/utils/utils";
import {
  RiBugFill,
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiStopFill,
} from "react-icons/ri";
import { Link } from "react-router-dom";
import ScriptController from "@App/app/service/script/controller";

type ListType = Script & { loading?: boolean };

function ScriptList() {
  const [scriptList, setScriptList] = useState<ListType[]>([]);
  const columns: ColumnProps[] = [
    {
      title: "#",
      dataIndex: "id",
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: "开启",
      sorter(a, b) {
        return a.status - b.status;
      },
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
                p = ScriptController.getInstance()
                  .enable(item.id)
                  .then(() => {
                    scriptList[index].status = SCRIPT_STATUS_ENABLE;
                  });
              } else {
                p = ScriptController.getInstance()
                  .disable(item.id)
                  .then(() => {
                    scriptList[index].status = SCRIPT_STATUS_DISABLE;
                  });
              }
              p.catch((err) => {
                Message.error(err);
              }).finally(() => {
                console.log(scriptList);
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
      sorter: (a, b) => a.name.length - b.name.length,
    },
    {
      title: "版本",
      dataIndex: "version",
      render(col, item: Script) {
        return item.metadata.version && item.metadata.version[0];
      },
    },
    {
      title: "应用至/运行状态",
      dataIndex: "status",
      render(col, item: Script) {
        if (item.type === SCRIPT_TYPE_NORMAL) {
          return (
            <Tooltip content="前台页面脚本,会在指定的页面上运行">
              <Tag icon={<IconCommon color="" />} color="cyan" bordered>
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
            <Tag icon={<IconClockCircle />} color="lime" bordered>
              运行完毕
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "特性",
      dataIndex: "origin",
    },
    {
      title: "主页",
      dataIndex: "home",
    },
    {
      title: "最后更新",
      dataIndex: "updatetime",
    },
    {
      title: "操作",
      dataIndex: "action",
      render(col, item: Script) {
        return (
          <Button.Group>
            <Button
              type="text"
              icon={<RiBugFill />}
              style={{
                color: "var(--color-text-2)",
              }}
            />
            <Link to={`/script/editor/${item.id}`}>
              <Button
                type="text"
                icon={<RiPencilFill />}
                style={{
                  color: "var(--color-text-2)",
                }}
              />
            </Link>
            <Button
              type="text"
              icon={<RiDeleteBin5Fill />}
              style={{
                color: "var(--color-text-2)",
              }}
            />
            <Button
              type="text"
              icon={<RiPlayFill />}
              style={{
                color: "var(--color-text-2)",
              }}
            />
            <Button
              type="text"
              icon={<RiStopFill />}
              style={{
                color: "var(--color-text-2)",
              }}
            />
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
      .then((scripts) => {
        setScriptList(scripts);
      });
  }, []);
  return (
    <div>
      <Table
        className="p-4"
        rowKey="id"
        columns={columns}
        data={scriptList}
        pagination={{
          total: scriptList.length,
          hideOnSinglePage: true,
        }}
        rowSelection={{
          type: "checkbox",
        }}
      />
    </div>
  );
}

export default ScriptList;
