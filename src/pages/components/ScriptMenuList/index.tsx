import React, { useEffect, useState } from "react";
import MessageInternal from "@App/app/message/internal";
import { MessageSender } from "@App/app/message/message";
import { ScriptMenu } from "@App/runtime/background/runtime";
import {
  Button,
  Collapse,
  Empty,
  Message,
  Popconfirm,
  Space,
  Switch,
} from "@arco-design/web-react";
import {
  IconDelete,
  IconEdit,
  IconMenu,
  IconSettings,
} from "@arco-design/web-react/icon";
import IoC from "@App/app/ioc";
import ScriptController from "@App/app/service/script/controller";
import { SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";

const CollapseItem = Collapse.Item;

// 用于popup页的脚本操作列表
const ScriptMenuList: React.FC<{
  script: ScriptMenu[];
}> = ({ script }) => {
  const [list, setList] = useState([] as ScriptMenu[]);
  const message = IoC.instance(MessageInternal) as MessageInternal;
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  useEffect(() => {
    setList(script);
  }, [script]);
  const sendMenuAction = (sender: MessageSender, channelFlag: string) => {
    let id = sender.tabId;
    if (sender.frameId) {
      id = sender.frameId;
    }
    message.broadcastChannel(
      {
        tag: sender.targetTag,
        id: [id!],
      },
      channelFlag,
      "click"
    );
    window.close();
  };
  // 监听菜单按键
  return (
    <>
      {list.length === 0 && <Empty />}
      {list.map((item) => (
        <Collapse bordered={false} expandIconPosition="right" key={item.id}>
          <CollapseItem
            header={
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Space>
                  <Switch
                    size="small"
                    checked={item.enable}
                    onChange={(checked) => {
                      let p: Promise<any>;
                      if (checked) {
                        p = scriptCtrl.enable(item.id).then(() => {
                          item.enable = true;
                        });
                      } else {
                        p = scriptCtrl.disable(item.id).then(() => {
                          item.enable = false;
                        });
                      }
                      p.catch((err) => {
                        Message.error(err);
                      }).finally(() => {
                        setList([...list]);
                      });
                    }}
                  />
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color:
                        item.runStatus &&
                        item.runStatus !== SCRIPT_RUN_STATUS_RUNNING
                          ? "rgb(var(--gray-5))"
                          : "",
                    }}
                  >
                    {item.name}
                  </span>
                </Space>
              </div>
            }
            name={item.id.toString()}
            contentStyle={{ padding: "0 0 0 40px" }}
          >
            <div className="flex flex-col">
              <Button
                className="text-left"
                type="secondary"
                icon={<IconEdit />}
                onClick={() => {
                  window.open(
                    `/src/options.html#/script/editor/${item.id}`,
                    "_blank"
                  );
                  window.close();
                }}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定要删除此脚本吗?"
                icon={<IconDelete />}
                onOk={() => {
                  setList(list.filter((i) => i.id !== item.id));
                  scriptCtrl.delete(item.id).catch((e) => {
                    Message.error(`删除失败: ${e}`);
                  });
                }}
              >
                <Button
                  className="text-left"
                  status="danger"
                  type="secondary"
                  icon={<IconDelete />}
                >
                  删除
                </Button>
              </Popconfirm>
            </div>
          </CollapseItem>
          <div
            className="arco-collapse-item-content-box flex flex-col"
            style={{ padding: "0 0 0 40px" }}
          >
            {item.menus?.map((menu) => {
              if (menu.accessKey) {
                document.addEventListener("keypress", (e) => {
                  if (e.key.toUpperCase() === menu.accessKey!.toUpperCase()) {
                    sendMenuAction(menu.sender, menu.channelFlag);
                  }
                });
              }
              return (
                <Button
                  className="text-left"
                  key={menu.id}
                  type="secondary"
                  icon={<IconMenu />}
                  onClick={() => {
                    sendMenuAction(menu.sender, menu.channelFlag);
                  }}
                >
                  {menu.name}
                  {menu.accessKey && `(${menu.accessKey.toUpperCase()})`}
                </Button>
              );
            })}
            {item.hasUserConfig && (
              <Button
                className="text-left"
                key="config"
                type="secondary"
                icon={<IconSettings />}
                onClick={() => {
                  window.open(
                    `/src/options.html#/?userConfig=${item.id}`,
                    "_blank"
                  );
                  window.close();
                }}
              >
                用户配置
              </Button>
            )}
          </div>
        </Collapse>
      ))}
    </>
  );
};

export default ScriptMenuList;
