import React, { useEffect, useRef } from "react";
import { BackTop, Button, Card, DatePicker, Input, List, Message, Space, Typography } from "@arco-design/web-react";
import dayjs from "dayjs";
import type { Logger } from "@App/app/repo/logger";
import { LoggerDAO } from "@App/app/repo/logger";
import type { Labels, Query } from "@App/pages/components/LogLabel";
import LogLabel from "@App/pages/components/LogLabel";
import { IconPlus } from "@arco-design/web-react/icon";
import { useSearchParams } from "react-router-dom";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { useTranslation } from "react-i18next";

function LoggerPage() {
  const [labels, setLabels] = React.useState<Labels>({});
  const defaultQuery = JSON.parse(useSearchParams()[0].get("query") || "[{}]");
  const [init, setInit] = React.useState(0);
  const [querys, setQuerys] = React.useState<Query[]>(defaultQuery);
  const [logs, setLogs] = React.useState<Logger[]>([]);
  const [queryLogs, setQueryLogs] = React.useState<Logger[]>([]);
  const [search, setSearch] = React.useState<string>("");
  const [startTime, setStartTime] = React.useState(dayjs().subtract(24, "hour").unix());
  const [endTime, setEndTime] = React.useState(dayjs().unix());
  // 标记 endTime 是否代表"当前时间"，默认为 true
  const [isNow, setIsNow] = React.useState(true);
  // 用于强制触发数据重新加载
  const [refreshToken, setRefreshToken] = React.useState(0);
  // 标记数据加载后是否需要自动执行过滤
  const needFilterRef = useRef(false);
  // 标记本次 onChange 是否由快捷方式触发
  const shortcutClickRef = useRef(false);
  const loggerDAO = new LoggerDAO();
  const systemConfig = { logCleanCycle: 1 };
  const { t } = useTranslation();

  const onQueryLog = (logsToFilter?: Logger[]) => {
    const data = logsToFilter ?? logs;
    const newQueryLogs: Logger[] = [];
    const regex = search && new RegExp(search);
    data.forEach((log) => {
      for (let i = 0; i < querys.length; i += 1) {
        const query = querys[i];
        if (query.key) {
          const value = log.label[query.key];
          switch (query.condition) {
            case "=":
              if (value != query.value) {
                return;
              }
              break;
            case "=~":
              if (typeof value === "string" && !value.includes(query.value)) {
                return;
              }
              break;
            case "!=":
              if (value == query.value) {
                return;
              }
              break;
            case "!~":
              if (typeof value === "string" && !value.includes(query.value)) {
                return;
              }
              break;
            default:
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
      // 如果是查询按钮触发的刷新，自动执行过滤
      if (needFilterRef.current) {
        needFilterRef.current = false;
        onQueryLog(l);
      } else {
        setQueryLogs([]);
      }
      if (init === 0) {
        setInit(1);
      }
    });
  }, [startTime, endTime, refreshToken]);

  return (
    <>
      <BackTop visibleHeight={30} style={{ position: "absolute" }} target={() => document.getElementById("backtop")!} />
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
            title={t("log_title")}
            extra={
              <Space size="large">
                <DatePicker.RangePicker
                  style={{ width: 400 }}
                  showTime
                  shortcutsPlacementLeft
                  placeholder={isNow ? ["", t("now")] : undefined}
                  value={isNow ? [startTime * 1000] : [startTime * 1000, endTime * 1000]}
                  onChange={(_, time) => {
                    if (!time || !time[0]) {
                      // 清除操作，恢复默认状态
                      setStartTime(dayjs().subtract(24, "hour").unix());
                      setEndTime(dayjs().unix());
                      setIsNow(true);
                      return;
                    }
                    setStartTime(time[0].unix());
                    setEndTime(time[1].unix());
                    if (shortcutClickRef.current) {
                      shortcutClickRef.current = false;
                      setIsNow(true);
                    } else {
                      setIsNow(false);
                    }
                  }}
                  onSelectShortcut={() => {
                    shortcutClickRef.current = true;
                  }}
                  shortcuts={[
                    {
                      text: t("last_5_minutes"),
                      value: () => [dayjs(), dayjs().add(-5, "minute")],
                    },
                    {
                      text: t("last_15_minutes"),
                      value: () => [dayjs(), dayjs().add(-15, "minute")],
                    },
                    {
                      text: t("last_30_minutes"),
                      value: () => [dayjs(), dayjs().add(-30, "minute")],
                    },
                    {
                      text: t("last_1_hour"),
                      value: () => [dayjs(), dayjs().add(-1, "hour")],
                    },
                    {
                      text: t("last_3_hours"),
                      value: () => [dayjs(), dayjs().add(-3, "hour")],
                    },
                    {
                      text: t("last_6_hours"),
                      value: () => [dayjs(), dayjs().add(-6, "hour")],
                    },
                    {
                      text: t("last_12_hours"),
                      value: () => [dayjs(), dayjs().add(-12, "hour")],
                    },
                    {
                      text: t("last_24_hours"),
                      value: () => [dayjs(), dayjs().add(-24, "hour")],
                    },
                    {
                      text: t("last_7_days"),
                      value: () => [dayjs(), dayjs().add(-7, "day")],
                    },
                  ]}
                />
                <Button
                  type="primary"
                  onClick={() => {
                    if (isNow) {
                      // 刷新 endTime 到当前时间，数据加载后自动过滤
                      needFilterRef.current = true;
                      setEndTime(dayjs().unix());
                      // 强制触发 useEffect，即使 endTime 值未变（同一秒内多次点击）
                      setRefreshToken((prev) => prev + 1);
                    } else {
                      onQueryLog();
                    }
                  }}
                >
                  {t("query")}
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
                <div className="tw-text-sm tw-font-medium">{t("labels")}</div>
                <Space>
                  {querys.map((query, index) => (
                    <LogLabel
                      key={`${query.key}_${query.value}_${index}`}
                      value={query}
                      labels={labels}
                      onChange={(v) => {
                        setQuerys((prev) => prev.map((query, i) => (i === index ? v : query)));
                      }}
                      onClose={() => {
                        setQuerys((prev) => prev.filter((_query, i) => i !== index));
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
                <div className="tw-text-sm tw-font-medium">{t("search_regex")}</div>
                <Input value={search} onChange={(e) => setSearch(e)} />
              </Space>
            </Space>
          </Card>
          <Card
            className="show-log-card"
            bordered={false}
            title={t("logs")}
            extra={
              <Space>
                <Space>
                  <span>{t("clean_schedule")}</span>
                  <Input
                    defaultValue={systemConfig.logCleanCycle.toString()}
                    style={{
                      width: "60px",
                    }}
                    type="number"
                    onChange={(e) => {
                      systemConfig.logCleanCycle = parseInt(e, 10);
                    }}
                  />
                  <span>{t("days_ago_logs")}</span>
                </Space>
                <Button
                  type="primary"
                  status="warning"
                  onClick={() => {
                    for (const log of queryLogs) {
                      loggerDAO.delete(log.id);
                    }
                    setQueryLogs([]);
                    setLogs([]);
                    Message.info(t("delete_completed")!);
                  }}
                >
                  {t("delete_current_logs")}
                </Button>
                <Button
                  type="primary"
                  status="danger"
                  onClick={() => {
                    loggerDAO.clear();
                    setQueryLogs([]);
                    setLogs([]);
                    Message.info(t("clear_completed")!);
                  }}
                >
                  {t("clear_logs")}
                </Button>
              </Space>
            }
            style={{
              padding: 8,
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            <Typography.Text>
              {formatUnixTime(startTime)} {t("to")} {isNow ? t("now") : formatUnixTime(endTime)}{" "}
              {t("total_logs", { length: logs.length })}
              {init === 4
                ? `, ${t("filtered_logs", { length: queryLogs.length })}`
                : `, ${t("enter_filter_conditions")}`}
            </Typography.Text>
            <List
              style={{
                height: "100%",
                overflow: "auto",
              }}
              size="small"
              dataSource={queryLogs}
              render={(item: Logger) => (
                <List.Item
                  key={item.id}
                  style={{
                    background:
                      item.level === "error"
                        ? "var(--color-danger-light-2)"
                        : item.level === "warn"
                          ? "var(--color-warning-light-2)"
                          : item.level === "info"
                            ? "var(--color-success-light-2)"
                            : "var(--color-primary-light-1)",
                  }}
                >
                  {formatUnixTime(item.createtime / 1000)}{" "}
                  {typeof item.message === "object" ? JSON.stringify(item.message) : item.message}{" "}
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

export default LoggerPage;
