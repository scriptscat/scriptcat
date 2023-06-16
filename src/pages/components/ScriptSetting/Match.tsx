import React, { useEffect, useState } from "react";
import { Script } from "@App/app/repo/scripts";
import IoC from "@App/app/ioc";
import ScriptController from "@App/app/service/script/controller";
import {
  Space,
  Popconfirm,
  Button,
  Divider,
  Typography,
  Modal,
  Input,
} from "@arco-design/web-react";
import Table, { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete } from "@arco-design/web-react/icon";

type MatchItem = {
  // id是为了避免match重复
  id: number;
  match: string;
  self: boolean;
  hasMatch: boolean;
  isExclude: boolean;
};

const Match: React.FC<{
  script: Script;
}> = ({ script }) => {
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const [match, setMatch] = useState<MatchItem[]>([]);
  const [exclude, setExclude] = useState<MatchItem[]>([]);
  const [matchValue, setMatchValue] = useState<string>("");
  const [matchVisible, setMatchVisible] = useState<boolean>(false);
  const [excludeValue, setExcludeValue] = useState<string>("");
  const [excludeVisible, setExcludeVisible] = useState<boolean>(false);

  useEffect(() => {
    if (script) {
      // 从数据库中获取是简单处理数据一致性的问题
      scriptCtrl.scriptDAO.findById(script.id).then((res) => {
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
          if (matchMap.has(value)) {
            v.push({
              id: index,
              match: value,
              self: false,
              hasMatch: false,
              isExclude: false,
            });
          } else {
            v.push({
              id: index,
              match: value,
              self: true,
              hasMatch: false,
              isExclude: false,
            });
          }
        });
        setMatch(v);

        const excludeArr =
          res.selfMetadata?.exclude || res.metadata.exclude || [];
        const excludeMap = new Map<string, boolean>();
        res.metadata.exclude?.forEach((m) => {
          excludeMap.set(m, true);
        });
        const e: MatchItem[] = [];
        excludeArr.forEach((value, index) => {
          const hasMatch = matchMap.has(value);
          if (excludeMap.has(value)) {
            e.push({
              id: index,
              match: value,
              self: false,
              hasMatch,
              isExclude: true,
            });
          } else {
            e.push({
              id: index,
              match: value,
              self: true,
              hasMatch,
              isExclude: true,
            });
          }
        });
        setExclude(e);
      });
    }
  }, [script, exclude, match]);

  const columns: ColumnProps[] = [
    {
      title: "match",
      dataIndex: "match",
      key: "match",
    },
    {
      title: "用户设定",
      dataIndex: "self",
      key: "self",
      width: 100,
      render(col) {
        if (col) {
          return <span style={{ color: "#52c41a" }}>是</span>;
        }
        return <span style={{ color: "#c4751a" }}>否</span>;
      },
    },
    {
      title: "操作",
      render(_, item: MatchItem) {
        if (item.isExclude) {
          return (
            <Space>
              <Popconfirm
                title={`确认删除该排除?${
                  item.hasMatch
                    ? "脚本设定的匹配项删除后会自动添加到匹配项中"
                    : ""
                }`}
                onOk={() => {
                  exclude.splice(exclude.indexOf(item), 1);
                  scriptCtrl
                    .resetExclude(
                      script.id,
                      exclude.map((m) => m.match)
                    )
                    .then(() => {
                      setExclude([...exclude]);
                      if (item.hasMatch) {
                        match.push(item);
                        scriptCtrl
                          .resetMatch(
                            script.id,
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
              title={`确认删除该匹配?${
                item.self ? "" : "脚本设定的匹配项删除后会自动添加到排除项中"
              }`}
              onOk={() => {
                match.splice(match.indexOf(item), 1);
                scriptCtrl
                  .resetMatch(
                    script.id,
                    match.map((m) => m.match)
                  )
                  .then(() => {
                    setMatch([...match]);
                    // 添加到exclue
                    if (!item.self) {
                      exclude.push(item);
                      scriptCtrl
                        .resetExclude(
                          script.id,
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
        title="添加匹配"
        visible={matchVisible}
        onCancel={() => setMatchVisible(false)}
        onOk={() => {
          if (matchValue) {
            match.push({
              id: Math.random(),
              match: matchValue,
              self: true,
              hasMatch: false,
              isExclude: false,
            });
            scriptCtrl
              .resetMatch(
                script.id,
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
        title="添加排除"
        visible={excludeVisible}
        onCancel={() => setExcludeVisible(false)}
        onOk={() => {
          if (excludeValue) {
            exclude.push({
              id: Math.random(),
              match: excludeValue,
              self: true,
              hasMatch: false,
              isExclude: true,
            });
            scriptCtrl
              .resetExclude(
                script.id,
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
        <Typography.Title heading={6}>网站匹配(@match)</Typography.Title>
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setMatchValue("");
              setMatchVisible(true);
            }}
          >
            添加匹配
          </Button>
          <Popconfirm
            title="确定重置?"
            onOk={() => {
              scriptCtrl.resetMatch(script.id, undefined).then(() => {
                setMatch([]);
              });
            }}
          >
            <Button type="primary" size="small" status="warning">
              重置
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Table columns={columns} data={match} rowKey="id" />
      <Divider />
      <div className="flex flex-row justify-between pb-2">
        <Typography.Title heading={6}>网站排除(@exclude)</Typography.Title>
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setExcludeValue("");
              setExcludeVisible(true);
            }}
          >
            添加排除
          </Button>
          <Popconfirm
            title="确定重置?"
            onOk={() => {
              scriptCtrl.resetExclude(script.id, undefined).then(() => {
                setExclude([]);
              });
            }}
          >
            <Button type="primary" size="small" status="warning">
              重置
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Table columns={columns} data={exclude} rowKey="id" />
      <Divider />
    </>
  );
};

export default Match;
