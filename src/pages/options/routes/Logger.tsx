import React, { useEffect } from "react";
import {
  BackTop,
  Button,
  Card,
  DatePicker,
  Input,
  List,
  Message,
  Space,
} from "@arco-design/web-react";
import dayjs from "dayjs";
import Text from "@arco-design/web-react/es/Typography/text";
import { Logger, LoggerDAO } from "@App/app/repo/logger";
import LogLabel, { Labels, Query } from "@App/pages/components/LogLabel";
import { IconPlus } from "@arco-design/web-react/icon";
import { useSearchParams } from "react-router-dom";
import { formatUnixTime } from "@App/pkg/utils/utils";

function Subscribe() {
  const [labels, setLabels] = React.useState<Labels>({});
  const defaultQuery = JSON.parse(useSearchParams()[0].get("query") || "[{}]");
  const [init, setInit] = React.useState(0);
  const [querys, setQuerys] = React.useState<Query[]>(defaultQuery);
  const [logs, setLogs] = React.useState<Logger[]>([]);
  const [queryLogs, setQueryLogs] = React.useState<Logger[]>([]);
  const [search, setSearch] = React.useState<string>("");
  const [startTime, setStartTime] = React.useState(
    dayjs().subtract(1, "hour").unix()
  );
  const [endTime, setEndTime] = React.useState(dayjs().unix());
  const loggerDAO = new LoggerDAO();

  const onQueryLog = () => {
    const newQueryLogs: Logger[] = [];
    const regex = search && new RegExp(search);
    logs.forEach((log) => {
      for (let i = 0; i < querys.length; i += 1) {
        const query = querys[i];
        if (query.key) {
          const value = log.label[query.key];
          switch (query.condition) {
            case "=":
              // eslint-disable-next-line eqeqeq
              if (value != query.value) {
                return;
              }
              break;
            case "=~":
              if (
                typeof value === "string" &&
                value.indexOf(query.value) === -1
              ) {
                return;
              }
              break;
            case "!=":
              // eslint-disable-next-line eqeqeq
              if (value == query.value) {
                return;
              }
              break;
            case "!~":
              if (
                typeof value === "string" &&
                value.indexOf(query.value) === -1
              ) {
                return;
              }
              break;
            default:
              // eslint-disable-next-line eqeqeq
              if (value != query.value) {
                return;
              }
              break;
          }
        }
      }
      if (regex && !regex.test(log.message)) {
        return;
      }
      newQueryLogs.push(log);
    });
    setInit(4);
    setQueryLogs(newQueryLogs);
  };

  useEffect(() => {
    if (init === 1 && defaultQuery.length && defaultQuery[0].key) {
      onQueryLog();
      setInit(2);
    }
  }, [init]);

  useEffect(() => {
    loggerDAO.queryLogs(startTime * 1000, endTime * 1000).then((l) => {
      setLogs(l);
      // 计算标签
      const newLabels = labels;
      l.forEach((log) => {
        Object.keys(log.label).forEach((key) => {
          if (!newLabels[key]) {
            newLabels[key] = {};
          }
          const value = log.label[key];
          switch (typeof value) {
            case "string":
            case "number":
              newLabels[key][value] = true;
              break;
            default:
              break;
          }
        });
      });
      setLabels(newLabels);
      setQueryLogs([]);
      if (init === 0) {
        setInit(1);
      }
    });
  }, [startTime, endTime]);

  return (
    <>
      <BackTop
        visibleHeight={30}
        style={{ position: "absolute" }}
        target={() => document.getElementById("backtop")!}
      />
      <div
        id="backtop"
        style={{
          height: "100%",
          overflow: "auto",
          position: "relative",
        }}
      >
        <Space
          direction="vertical"
          className="log-space"
          style={{
            width: "100%",
          }}
        >
          <Card
            bordered={false}
            title="运行日志"
            style={{
              padding: 8,
            }}
            extra={
              <Space size="large">
                <DatePicker.RangePicker
                  style={{ width: 400 }}
                  showTime
                  shortcutsPlacementLeft
                  value={[startTime * 1000, endTime * 1000]}
                  onChange={(_, t) => {
                    setStartTime(t[0].unix());
                    setEndTime(t[1].unix());
                  }}
                  shortcuts={[
                    {
                      text: "最近5分钟",
                      value: () => [dayjs(), dayjs().add(-5, "minute")],
                    },
                    {
                      text: "最近15分钟",
                      value: () => [dayjs(), dayjs().add(-15, "minute")],
                    },
                    {
                      text: "最近30分钟",
                      value: () => [dayjs(), dayjs().add(-30, "minute")],
                    },
                    {
                      text: "最近1小时",
                      value: () => [dayjs(), dayjs().add(-1, "hour")],
                    },
                    {
                      text: "最近3小时",
                      value: () => [dayjs(), dayjs().add(-3, "hour")],
                    },
                    {
                      text: "最近6小时",
                      value: () => [dayjs(), dayjs().add(-6, "hour")],
                    },
                    {
                      text: "最近12小时",
                      value: () => [dayjs(), dayjs().add(-12, "hour")],
                    },
                    {
                      text: "最近24小时",
                      value: () => [dayjs(), dayjs().add(-24, "hour")],
                    },
                    {
                      text: "最近7天",
                      value: () => [dayjs(), dayjs().add(-7, "day")],
                    },
                  ]}
                />
                <Button type="primary" onClick={onQueryLog}>
                  查询
                </Button>
              </Space>
            }
          >
            <Space direction="vertical">
              <Space
                style={{
                  background: "var(--color-neutral-1)",
                  padding: 8,
                }}
                direction="vertical"
              >
                <div className="text-sm font-medium">labels</div>
                <Space>
                  {querys.map((query, index) => (
                    <LogLabel
                      key={query.key + query.value}
                      value={query}
                      labels={labels}
                      onChange={(v) => {
                        querys[index] = v;
                        setQuerys([...querys]);
                      }}
                      onClose={() => {
                        querys.splice(index, 1);
                        setQuerys([...querys]);
                      }}
                    />
                  ))}
                  <Button
                    iconOnly
                    onClick={() => {
                      setQuerys([
                        ...querys,
                        {
                          key: "",
                          condition: "=",
                          value: "",
                        },
                      ]);
                    }}
                    icon={<IconPlus />}
                  />
                </Space>
              </Space>
              <Space
                style={{
                  background: "var(--color-neutral-1)",
                  padding: 8,
                }}
                direction="vertical"
              >
                <div className="text-sm font-medium">搜索(支持正则)</div>
                <Input value={search} onChange={(e) => setSearch(e)} />
              </Space>
            </Space>
          </Card>
          <Card
            className="show-log-card"
            bordered={false}
            title="日志"
            extra={
              <Space>
                <Button
                  type="primary"
                  status="warning"
                  onClick={() => {
                    queryLogs.forEach((log) => {
                      loggerDAO.delete(log.id);
                    });
                    setQueryLogs([]);
                    setLogs([]);
                    Message.info("删除完成");
                  }}
                >
                  删除当前日志
                </Button>
                <Button
                  type="primary"
                  status="danger"
                  onClick={() => {
                    loggerDAO.clear();
                    setQueryLogs([]);
                    setLogs([]);
                    Message.info("清空完成");
                  }}
                >
                  清空日志
                </Button>
              </Space>
            }
            style={{
              padding: 8,
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            <Text>
              {formatUnixTime(startTime)} 到 {formatUnixTime(endTime)} 共查询到
              {logs.length}条日志
              {init === 4
                ? `,筛选后${queryLogs.length}条日志`
                : ",请输入筛选条件进行查询"}
            </Text>
            <List
              style={{
                height: "100%",
                overflow: "auto",
              }}
              size="small"
              dataSource={queryLogs}
              render={(item: Logger, index) => (
                <List.Item
                  key={index}
                  style={{
                    background:
                      // eslint-disable-next-line no-nested-ternary
                      item.level === "error"
                        ? "var(--color-danger-light-2)" // eslint-disable-next-line no-nested-ternary
                        : item.level === "warn"
                        ? "var(--color-warning-light-2)"
                        : item.level === "info"
                        ? "var(--color-success-light-2)"
                        : "var(--color-primary-light-1)",
                  }}
                >
                  {formatUnixTime(item.createtime / 1000)}{" "}
                  {typeof item.message === "object"
                    ? JSON.stringify(item.message)
                    : item.message}{" "}
                  {JSON.stringify(item.label)}
                </List.Item>
              )}
            />
          </Card>
        </Space>
      </div>
    </>
  );
}

export default Subscribe;
