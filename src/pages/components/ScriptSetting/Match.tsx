import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import { Space, Popconfirm, Button, Divider, Typography, Modal, Input } from "@arco-design/web-react";
import Table, { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete } from "@arco-design/web-react/icon";
import { scriptClient } from "@App/pages/store/features/script";

type MatchItem = {
  // id是为了避免match重复
  id: number;
  match: string;
  byUser: boolean;
  hasMatch: boolean; // 是否已经匹配
  isExclude: boolean; // 是否是排除项
};

const Match: React.FC<{
  script: Script;
}> = ({ script }) => {
  const scriptDAO = new ScriptDAO();
  const [match, setMatch] = useState<MatchItem[]>([]);
  const [exclude, setExclude] = useState<MatchItem[]>([]);
  const [matchValue, setMatchValue] = useState<string>("");
  const [matchVisible, setMatchVisible] = useState<boolean>(false);
  const [excludeValue, setExcludeValue] = useState<string>("");
  const [excludeVisible, setExcludeVisible] = useState<boolean>(false);
  const { t } = useTranslation(); // 使用 react-i18next 的 useTranslation 钩子函数获取翻译函数

  useEffect(() => {
    if (script) {
      // 从数据库中获取是简单处理数据一致性的问题
      scriptDAO.get(script.uuid).then((res) => {
        if (!res) {
          return;
        }
        const matchArr = res.selfMetadata?.match || res.metadata.match || [];
        const matchMap = new Map<string, boolean>();
        res.metadata.match?.forEach((m) => {
          matchMap.set(m, true);
        });
        const v: MatchItem[] = [];
        matchArr.forEach((value, index) => {
          v.push({
            id: index,
            match: value,
            byUser: !matchMap.has(value),
            hasMatch: false,
            isExclude: false,
          });
        });
        setMatch(v);

        const excludeArr = res.selfMetadata?.exclude || res.metadata.exclude || [];
        const excludeMap = new Map<string, boolean>();
        res.metadata.exclude?.forEach((m) => {
          excludeMap.set(m, true);
        });
        const e: MatchItem[] = [];
        excludeArr.forEach((value, index) => {
          const hasMatch = matchMap.has(value);
          e.push({
            id: index,
            match: value,
            byUser: !excludeMap.has(value),
            hasMatch,
            isExclude: true,
          });
        });
        setExclude(e);
      });
    }
  }, [script, exclude, match]);

  const columns: ColumnProps[] = [
    {
      title: t("match"),
      dataIndex: "match",
      key: "match",
    },
    {
      title: t("user_setting"),
      dataIndex: "byUser",
      key: "byUser",
      width: 100,
      render(col) {
        if (col) {
          return <span style={{ color: "#52c41a" }}>{t("yes")}</span>;
        }
        return <span style={{ color: "#c4751a" }}>{t("no")}</span>;
      },
    },
    {
      title: t("action"),
      render(_, item: MatchItem) {
        if (item.isExclude) {
          return (
            <Space>
              <Popconfirm
                title={`${t("confirm_delete_exclude")}${item.hasMatch ? ` ${t("after_deleting_match_item")}` : ""}`}
                onOk={() => {
                  exclude.splice(exclude.indexOf(item), 1);
                  // 删除所有排除
                  scriptClient
                    .resetExclude(
                      script.uuid,
                      exclude.map((m) => m.match)
                    )
                    .then(() => {
                      setExclude([...exclude]);
                      // 如果包含在里面，再加回match
                      if (item.hasMatch) {
                        match.push(item);
                        // 重置匹配
                        scriptClient
                          .resetMatch(
                            script.uuid,
                            match.map((m) => m.match)
                          )
                          .then(() => {
                            setMatch([...match]);
                          });
                      }
                    });
                }}
              >
                <Button type="text" iconOnly icon={<IconDelete />} />
              </Popconfirm>
            </Space>
          );
        }
        return (
          <Space>
            <Popconfirm
              title={`${t("confirm_delete_match")}${item.byUser ? "" : ` ${t("after_deleting_exclude_item")}`}`}
              onOk={() => {
                match.splice(match.indexOf(item), 1);
                scriptClient
                  .resetMatch(
                    script.uuid,
                    match.map((m) => m.match)
                  )
                  .then(() => {
                    setMatch([...match]);
                    // 添加到exclue
                    if (!item.byUser) {
                      exclude.push(item);
                      scriptClient
                        .resetExclude(
                          script.uuid,
                          exclude.map((m) => m.match)
                        )
                        .then(() => {
                          setExclude([...exclude]);
                        });
                    }
                  });
              }}
            >
              <Button type="text" iconOnly icon={<IconDelete />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Modal
        title={t("add_match")}
        visible={matchVisible}
        onCancel={() => setMatchVisible(false)}
        onOk={() => {
          if (matchValue) {
            match.push({
              id: Math.random(),
              match: matchValue,
              byUser: true,
              hasMatch: false,
              isExclude: false,
            });
            scriptClient
              .resetMatch(
                script.uuid,
                match.map((m) => m.match)
              )
              .then(() => {
                setMatch([...match]);
                setMatchVisible(false);
              });
          }
        }}
      >
        <Input
          value={matchValue}
          onChange={(e) => {
            setMatchValue(e);
          }}
        />
      </Modal>
      <Modal
        title={t("add_exclude")}
        visible={excludeVisible}
        onCancel={() => setExcludeVisible(false)}
        onOk={() => {
          if (excludeValue) {
            exclude.push({
              id: Math.random(),
              match: excludeValue,
              byUser: true,
              hasMatch: false,
              isExclude: true,
            });
            scriptClient
              .resetExclude(
                script.uuid,
                exclude.map((m) => m.match)
              )
              .then(() => {
                setExclude([...exclude]);
                setExcludeVisible(false);
              });
          }
        }}
      >
        <Input
          value={excludeValue}
          onChange={(e) => {
            setExcludeValue(e);
          }}
        />
      </Modal>
      <div className="flex flex-row justify-between pb-2">
        <Typography.Title heading={6}>{t("website_match")}</Typography.Title>
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setMatchValue("");
              setMatchVisible(true);
            }}
          >
            {t("add_match")}
          </Button>
          <Popconfirm
            title={t("confirm_reset")}
            onOk={() => {
              scriptClient.resetMatch(script.uuid, undefined).then(() => {
                setMatch([]);
              });
            }}
          >
            <Button type="primary" size="small" status="warning">
              {t("reset")}
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Table columns={columns} data={match} rowKey="id" pagination={false} />
      <Divider />
      <div className="flex flex-row justify-between pb-2">
        <Typography.Title heading={6}>{t("website_exclude")}</Typography.Title>
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setExcludeValue("");
              setExcludeVisible(true);
            }}
          >
            {t("add_exclude")}
          </Button>
          <Popconfirm
            title={t("confirm_reset")}
            onOk={() => {
              scriptClient.resetExclude(script.uuid, undefined).then(() => {
                setExclude([]);
              });
            }}
          >
            <Button type="primary" size="small" status="warning">
              {t("reset")}
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Table columns={columns} data={exclude} rowKey="id" pagination={false} />
      <Divider />
    </>
  );
};

export default Match;
