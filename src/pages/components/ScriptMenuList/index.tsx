import React, { useEffect } from "react";
import MessageInternal from "@App/app/message/internal";
import { MessageSender } from "@App/app/message/message";
import { ScriptMenu } from "@App/runtime/background/runtime";
import { Button, Collapse, Empty, Space, Switch } from "@arco-design/web-react";
import {
  IconDelete,
  IconEdit,
  IconSettings,
} from "@arco-design/web-react/icon";

const CollapseItem = Collapse.Item;

// 用于popup页的脚本操作列表
const ScriptMenuList: React.FC<{
  script: ScriptMenu[];
}> = ({ script }) => {
  const sendMenuAction = (sender: MessageSender, channelFlag: string) => {
    let id = sender.tabId;
    if (sender.frameId) {
      id = sender.frameId;
    }
    MessageInternal.getInstance().broadcastChannel(
      {
        tag: sender.targetTag,
        id: [id!],
      },
      channelFlag,
      "click"
    );
  };
  // 监听菜单按键
  return (
    <>
      {script.length === 0 && <Empty />}
      {script.map((item) => (
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
                  <Switch size="small" checked={item.enable} />
                  <span>{item.name}</span>
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
              >
                编辑
              </Button>
              <Button
                className="text-left"
                status="danger"
                type="secondary"
                icon={<IconDelete />}
              >
                删除
              </Button>
            </div>
          </CollapseItem>
          <div
            className="arco-collapse-item-content-box flex flex-col"
            style={{ padding: "0 0 0 40px" }}
          >
            {item.menus?.map((menu) => {
              if (menu.accessKey) {
                document.addEventListener("keypress", (e) => {
                  if (e.key.toUpperCase() === menu.accessKey.toUpperCase()) {
                    sendMenuAction(menu.sender, menu.channelFlag);
                  }
                });
              }
              return (
                <Button
                  className="text-left"
                  key={menu.id}
                  type="secondary"
                  icon={<IconSettings />}
                  onClick={() => {
                    sendMenuAction(menu.sender, menu.channelFlag);
                  }}
                >
                  {menu.name}
                  {menu.accessKey && `(${menu.accessKey.toUpperCase()})`}
                </Button>
              );
            })}
          </div>
        </Collapse>
      ))}
    </>
  );
};

export default ScriptMenuList;
