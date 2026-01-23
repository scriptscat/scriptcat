import { useEffect, useState } from "react";
import {
  requestBatchUpdateListAction,
  requestCheckScriptUpdate,
  requestOpenUpdatePageByUUID,
  scriptClient,
} from "../store/features/script";

import type { CollapseProps } from "@arco-design/web-react";
import { Collapse, Card, Link, Divider, Grid, Tooltip, Typography, Tag, Space } from "@arco-design/web-react";
import { useTranslation } from "react-i18next";
import {
  BatchUpdateListActionCode,
  UpdateStatusCode,
  type TBatchUpdateRecord,
  type TBatchUpdateRecordObject,
} from "@App/app/service/service_worker/types";
import { dayFormat } from "@App/pkg/utils/day_format";
import { IconSync } from "@arco-design/web-react/icon";
import { useAppContext } from "../store/AppContext";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";

const CollapseItem = Collapse.Item;
const { GridItem } = Grid;

const { Text } = Typography;

// pageExecute is to store subscribe function(s) globally
const pageExecute: Record<string, (data: any) => void> = {};

function App() {
  const { subscribeMessage } = useAppContext();

  const AUTO_CLOSE_PAGE = 8; // after 8s, auto close
  const getUrlParam = (key: string): string => {
    return (location.search?.includes(`${key}=`) ? new URLSearchParams(location.search).get(`${key}`) : "") || "";
  };
  // unit: milisecond
  const initialTimeForAutoClosePage = parseInt(getUrlParam("autoclose")) || AUTO_CLOSE_PAGE;
  const paramSite = getUrlParam("site");
  const { t } = useTranslation();

  const [mInitial, setInitial] = useState<boolean>(false);

  const [mRecords, setRecords] = useState<{
    site: TBatchUpdateRecord[];
    other: TBatchUpdateRecord[];
    ignored: TBatchUpdateRecord[];
  } | null>(null);

  const [mStatusText, setStatusText] = useState<string>("");

  // unit: second
  const [mTimeClose, setTimeClose] = useState<number>(initialTimeForAutoClosePage);
  useEffect(() => {
    if (mTimeClose < 0) return;
    if (mTimeClose === 0) {
      window.close(); // 会切回到原网页
      return;
    }
    setTimeout(() => {
      // 如 tab 在背景, 不倒数，等用户切回来
      requestAnimationFrame(() => {
        setTimeClose((t) => (t >= 1 ? t - 1 : t));
      });
    }, 1000);
  }, [mTimeClose]);

  const getBatchUpdateRecord = async (): Promise<TBatchUpdateRecordObject | null> => {
    let resultText = "";
    let r;
    let i = 0;
    while (true) {
      r = await scriptClient.getBatchUpdateRecordLite(i++);
      if (!r) break;
      const chunk = r.chunk;
      if (typeof chunk !== "string") break;
      resultText += chunk;
      if (r.ended) break;
    }
    return resultText ? JSON.parse(resultText) : null;
  };

  const updateRecord = () => {
    getBatchUpdateRecord().then((batchUpdateRecordObjectLite) => {
      const list = batchUpdateRecordObjectLite?.list || [];
      const site = [] as TBatchUpdateRecord[];
      const other = [] as TBatchUpdateRecord[];
      const ignored = [] as TBatchUpdateRecord[];
      for (const entry of list) {
        if (!entry.checkUpdate) {
          site.push(entry);
          continue;
        }
        const isIgnored = entry.script.ignoreVersion === entry.newMeta?.version?.[0];
        const mEntry = {
          ...entry,
        };

        if (isIgnored) {
          ignored.push(mEntry);
        } else {
          if (!paramSite || mEntry.sites?.includes(paramSite)) {
            site.push(mEntry);
          } else {
            other.push(mEntry);
          }
        }
      }
      setRecords({ site, other, ignored });
    });
  };

  const onScriptUpdateCheck = (data: any) => {
    if (
      mRecords === null &&
      ((data.status ?? 0) & UpdateStatusCode.CHECKING_UPDATE) === 0 &&
      ((data.status ?? 0) & UpdateStatusCode.CHECKED_BEFORE) === UpdateStatusCode.CHECKED_BEFORE
    ) {
      setStatusText(
        t("updatepage.status_last_check").replace("$0", data.checktime ? dayFormat(new Date(data.checktime)) : "")
      );
      updateRecord();
      setCheckUpdateSpin(false);
    } else if (((data.status ?? 0) & UpdateStatusCode.CHECKING_UPDATE) === UpdateStatusCode.CHECKING_UPDATE) {
      setStatusText(t("updatepage.status_checking_updates"));
      setRecords(null);
      setCheckUpdateSpin(true);
    } else if (mRecords !== null && data.refreshRecord === true) {
      updateRecord();
    }
  };

  // 每次render会重新定义 pageExecute 的 onScriptUpdateCheck
  pageExecute.onScriptUpdateCheck = onScriptUpdateCheck;

  // 只在第一次render执行
  const doInitial = () => {
    // faster than useEffect
    setInitial(true);
    subscribeMessage("onScriptUpdateCheck", (msg) => pageExecute.onScriptUpdateCheck!(msg));
    scriptClient.fetchCheckUpdateStatus();
    scriptClient.sendUpdatePageOpened();
  };

  mInitial === false && doInitial();

  //   const { t } = useTranslation();

  const onUpdateClick = async (uuid: string) => {
    if (!uuid) return;
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    setIsDoingTask(true);
    await requestBatchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid }],
    });
    setIsDoingTask(false);
  };

  const onIgnoreClick = async (uuid: string, ignoreVersion: string | undefined) => {
    if (!ignoreVersion || !uuid) return;
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    setIsDoingTask(true);
    await requestBatchUpdateListAction({
      actionCode: BatchUpdateListActionCode.IGNORE,
      actionPayload: [{ uuid, ignoreVersion }],
    });
    setIsDoingTask(false);
  };

  const onUpdateAllClick = async (s: "site" | "other" | "ignored") => {
    const data = (mRecords![s] || null) as TBatchUpdateRecord[] | null;
    if (!data) {
      console.error("No Data");
      return;
    }
    if (!data.length) {
      console.error("Invalid Array");
      return;
    }
    const targets = data.filter((entry) => entry.checkUpdate);
    const targetUUIDs = targets.map((entry) => entry.uuid);
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    setIsDoingTask(true);
    await requestBatchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: targetUUIDs.map((uuid) => ({ uuid })),
    });
    setIsDoingTask(false);
  };

  const onIgnoreAllClick = async (s: "site" | "other" | "ignored") => {
    const data = (mRecords![s] || null) as TBatchUpdateRecord[] | null;
    if (!data) {
      console.error("No Data");
      return;
    }
    if (!data.length) {
      console.error("Invalid Array");
      return;
    }
    const targets = data.filter((entry) => entry.checkUpdate && entry.uuid && entry.newMeta?.version?.[0]);
    const payloadScripts = targets.map((entry) => ({
      uuid: entry.uuid,
      ignoreVersion: entry.newMeta!.version[0],
    }));
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    setIsDoingTask(true);
    await requestBatchUpdateListAction({
      actionCode: BatchUpdateListActionCode.IGNORE,
      actionPayload: payloadScripts,
    });
    setIsDoingTask(false);
  };

  const openUpdatePage = async (uuid: string) => {
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    // this.openUpdatePage(script, "system");
    await requestOpenUpdatePageByUUID(uuid);
  };

  const onCheckUpdateClick = async () => {
    if (checkUpdateSpin) return;
    setTimeClose(-1); // 用户操作，不再倒数，等用户按完用户自行关
    setCheckUpdateSpin(true);
    await requestCheckScriptUpdate({ checkType: "user" });
    setCheckUpdateSpin(false);
  };

  const getNewConnects = (oldConnects: string[] | undefined, newConnects: string[] | undefined) => {
    oldConnects = oldConnects || ([] as string[]);
    newConnects = newConnects || ([] as string[]);
    const oldConnect = new Set<string>(oldConnects || []);
    const newConnect = new Set<string>(newConnects || []);
    const res = [];
    // 老的里面没有新的就需要用户确认了
    for (const key of newConnect) {
      if (!oldConnect.has(key)) {
        res.push(key);
      }
    }
    return res;
  };

  const makeGrids = (list: TBatchUpdateRecord[] | undefined) => {
    return list?.length ? (
      <Grid cols={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }} colGap={12} rowGap={16} className="card-grid">
        {list?.map(
          (item, _index) =>
            item?.checkUpdate && (
              <GridItem className={`card-grid-item`} key={item.uuid}>
                <Card
                  size="small"
                  className={`script-card card-${item.script.status === SCRIPT_STATUS_ENABLE ? "enabled" : "disabled"}`}
                  title={
                    <span
                      onClick={() => openUpdatePage(item.uuid)}
                      className="text-clickable text-gray-900 dark:text-gray-100 !hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <Typography.Ellipsis rows={1} expandable={false} showTooltip={{ mini: true }}>
                        {item.script?.name}
                      </Typography.Ellipsis>
                    </span>
                  }
                  hoverable
                  extra={
                    <>
                      <Link disabled={isDoingTask} onClick={() => onUpdateClick(item.uuid)}>
                        {t("updatepage.update")}
                      </Link>
                      {item.script.ignoreVersion !== item.newMeta?.version?.[0] ? (
                        <>
                          <Divider type="vertical" />
                          <Link
                            disabled={isDoingTask}
                            onClick={() => onIgnoreClick(item.uuid, item.newMeta?.version?.[0])}
                          >
                            {t("updatepage.ignore")}
                          </Link>
                        </>
                      ) : (
                        <></>
                      )}
                    </>
                  }
                >
                  <Space className="pb-2">
                    <Space direction="vertical">
                      <Text>{t("updatepage.old_version_")}</Text>
                      <Text>{t("updatepage.new_version_")}</Text>
                    </Space>

                    <Space direction="vertical">
                      <Tooltip content={`${t("current_version")}: v${item.script?.metadata?.version?.[0] || "N/A"}`}>
                        <Tag bordered>{item.script?.metadata?.version?.[0] || "N/A"}</Tag>
                      </Tooltip>
                      <Tooltip content={`${t("update_version")}: v${item.newMeta?.version?.[0] || "N/A"}`}>
                        <Tag bordered>{item.newMeta?.version?.[0] || "N/A"}</Tag>
                      </Tooltip>
                    </Space>
                  </Space>

                  <br />
                  <Space>
                    {item.script.status === 1 ? (
                      <Tooltip mini content={`${t("updatepage.tooltip_enabled")}`}>
                        <Tag color="orangered" bordered>
                          {t("updatepage.enabled")}
                        </Tag>
                      </Tooltip>
                    ) : item.script.status === 2 ? (
                      <Tooltip mini content={`${t("updatepage.tooltip_disabled")}`} color="gray">
                        <Tag color="gray" bordered>
                          {t("updatepage.disabled")}
                        </Tag>
                      </Tooltip>
                    ) : (
                      <></>
                    )}
                    {item.codeSimilarity < 0.75 ? (
                      <Tooltip mini content={`${t("updatepage.similarity_")}${item.codeSimilarity}`} color="red">
                        <Tag color="red">{t("updatepage.codechange_major")}</Tag>
                      </Tooltip>
                    ) : item.codeSimilarity < 0.95 ? (
                      <Tooltip mini content={`${t("updatepage.similarity_")}${item.codeSimilarity}`} color="blue">
                        <Tag color="arcoblue">{t("updatepage.codechange_noticeable")}</Tag>
                      </Tooltip>
                    ) : (
                      <Tooltip mini content={`${t("updatepage.similarity_")}${item.codeSimilarity}`} color="green">
                        <Tag color="green">{t("updatepage.codechange_tiny")}</Tag>
                      </Tooltip>
                    )}
                    {item.withNewConnect ? (
                      <Tooltip
                        mini
                        content={`${t("updatepage.new_connects_")}${getNewConnects(item.script.metadata.connect, item.newMeta.connect).join(", ")}`}
                        color="rgb(var(--orangered-4))"
                      >
                        <Tag color="rgb(var(--orangered-3))">{t("updatepage.tag_new_connect")}</Tag>
                      </Tooltip>
                    ) : (
                      <></>
                    )}
                  </Space>
                </Card>
              </GridItem>
            )
        )}
      </Grid>
    ) : (
      <></>
    );
  };

  const [activeKey, setActiveKey] = useState<string[]>([]);
  const [isDoingTask, setIsDoingTask] = useState<boolean>(false);
  const [checkUpdateSpin, setCheckUpdateSpin] = useState<boolean>(false);
  const handleChange: CollapseProps["onChange"] = (_key, keys) => {
    // `keys` is the current list of open panels
    setActiveKey(keys);
  };

  useEffect(() => {
    setActiveKey((prev: string[]) => {
      const s = new Set(prev);
      if (mRecords?.site?.length) {
        s.add("list-current");
      }
      if (mRecords?.other?.length) {
        s.add("list-other");
      }
      return [...s];
    });
  }, [mRecords]);

  return (
    <>
      {
        <div className="mb-2 text-gray-800 dark:text-gray-200">
          <div className="flex flex-row items-center gap-2">
            <Typography.Title heading={6} className="!m-0 text-gray-900 dark:text-gray-100">
              {t("updatepage.main_header")}
            </Typography.Title>
            <IconSync
              spin={checkUpdateSpin}
              onClick={() => onCheckUpdateClick()}
              className="cursor-pointer text-gray-700 dark:text-gray-300"
            />
          </div>
          <div className="flex flex-row indent-4">
            <Typography.Text className="text-gray-700 dark:text-gray-300">{mStatusText}</Typography.Text>
          </div>
          {mRecords === null ? (
            <></>
          ) : (
            <>
              {mRecords.site.length === 0 && mRecords.other.length === 0 ? (
                <div className="flex flex-row indent-4">
                  <Text className="text-gray-700 dark:text-gray-300">{t("updatepage.status_no_update")}</Text>
                </div>
              ) : (
                <div className="flex flex-row indent-4">
                  <Text className="text-gray-700 dark:text-gray-300">
                    {t("updatepage.status_n_update").replace("$0", `${mRecords.site.length + mRecords.other.length}`)}
                  </Text>
                </div>
              )}
              {mRecords.ignored.length === 0 ? (
                // <div><Text>{"没有已忽略的更新"}</Text></div>
                <></>
              ) : (
                <div className="flex flex-row indent-4">
                  <Text className="text-gray-700 dark:text-gray-300">
                    {t("updatepage.status_n_ignored").replace("$0", `${mRecords.ignored.length}`)}
                  </Text>
                </div>
              )}
              {mTimeClose >= 0 ? (
                <div className="flex flex-row indent-4">
                  <Text className="text-gray-700 dark:text-gray-300">
                    {t("updatepage.status_autoclose").replace("$0", `${mTimeClose}`)}
                  </Text>
                </div>
              ) : (
                <></>
              )}
            </>
          )}
        </div>
      }
      {mRecords === null ? (
        <div>
          <div></div>
        </div>
      ) : (
        <div>
          <div>
            <Collapse
              defaultActiveKey={[]}
              className={[
                "justify-self-center",
                mRecords.site.length === 0 && mRecords.other.length === 0 && mRecords.ignored.length === 0
                  ? "hidden"
                  : "",
              ]}
              style={{ width: "calc(100vw - 64px)" }}
              activeKey={activeKey}
              onChange={handleChange}
            >
              {mRecords.site.length === 0 && mRecords.other.length === 0 ? (
                <></>
              ) : (
                <>
                  <CollapseItem
                    header={
                      paramSite
                        ? `${t("updatepage.header_site_specific").replace("$0", paramSite)}`
                        : `${t("updatepage.header_site_all")}`
                    }
                    name="list-current"
                    disabled={!mRecords?.site?.length || isDoingTask}
                    extra={
                      mRecords?.site?.length ? (
                        <>
                          <Link disabled={isDoingTask} onClick={() => onUpdateAllClick("site")}>
                            {t("updatepage.update_all")}
                          </Link>
                          <Divider type="vertical" />
                          <Link disabled={isDoingTask} onClick={() => onIgnoreAllClick("site")}>
                            {t("updatepage.ignore_all")}
                          </Link>
                        </>
                      ) : (
                        <></>
                      )
                    }
                  >
                    {makeGrids(mRecords?.site)}
                  </CollapseItem>
                  <CollapseItem
                    header={`${t("updatepage.header_other_update")}`}
                    name="list-other"
                    className={[paramSite ? "" : "hidden"]}
                    disabled={!mRecords?.other?.length || isDoingTask}
                    extra={
                      mRecords?.other?.length ? (
                        <>
                          <Link disabled={isDoingTask} onClick={() => onUpdateAllClick("other")}>
                            {t("updatepage.update_all")}
                          </Link>
                          <Divider type="vertical" />
                          <Link disabled={isDoingTask} onClick={() => onIgnoreAllClick("other")}>
                            {t("updatepage.ignore_all")}
                          </Link>
                        </>
                      ) : (
                        <></>
                      )
                    }
                  >
                    {makeGrids(mRecords?.other)}
                  </CollapseItem>
                </>
              )}

              {mRecords.ignored.length === 0 ? (
                <></>
              ) : (
                <>
                  <CollapseItem
                    header={`${t("updatepage.header_ignored")}`}
                    name="list-ignored"
                    disabled={!mRecords?.ignored?.length || isDoingTask}
                    extra={
                      mRecords?.ignored?.length ? (
                        <>
                          <Link disabled={isDoingTask} onClick={() => onUpdateAllClick("ignored")}>
                            {t("updatepage.update_all")}
                          </Link>
                        </>
                      ) : (
                        <></>
                      )
                    }
                  >
                    {makeGrids(mRecords?.ignored)}
                  </CollapseItem>
                </>
              )}
            </Collapse>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
