import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import SystemManager from "@App/app/service/system/manager";
import { ScriptMenu } from "@App/runtime/background/runtime";
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Dropdown,
  Menu,
} from "@arco-design/web-react";
import {
  IconBook,
  IconBug,
  IconGithub,
  IconHome,
  IconMoreVertical,
  IconNotification,
  IconPlus,
  IconSearch,
} from "@arco-design/web-react/icon";
import React, { useEffect, useState } from "react";
import { RiMessage2Line } from "react-icons/ri";
import semver from "semver";
import ScriptMenuList from "../components/ScriptMenuList";

const CollapseItem = Collapse.Item;

const iconStyle = {
  marginRight: 8,
  fontSize: 16,
  transform: "translateY(1px)",
};

function App() {
  const [scriptList, setScriptList] = useState<ScriptMenu[]>([]);
  const [backScriptList, setBackScriptList] = useState<ScriptMenu[]>([]);
  const systemManage = IoC.instance(SystemManager) as SystemManager;
  const [showAlert, setShowAlert] = useState(false);
  const [notice, setNotice] = useState("");
  const [isRead, setIsRead] = useState(true);
  const [version, setVersion] = useState(systemManage.systemConfig.version);

  const message = IoC.instance(MessageInternal) as MessageInternal;
  useEffect(() => {
    systemManage.getNotice().then((res) => {
      setNotice(res.notice);
      setIsRead(res.isRead);
    });
    systemManage.getVersion().then((res) => {
      setVersion(res);
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        return;
      }
      message
        .syncSend("queryPageScript", { url: tabs[0].url, tabId: tabs[0].id })
        .then(
          (resp: {
            scriptList: ScriptMenu[];
            backScriptList: ScriptMenu[];
          }) => {
            // 按照开启状态排序
            const list = resp.scriptList;
            list.sort((a, b) => (a.enable ? 0 : 1) - (b.enable ? 0 : 1));

            setScriptList(list);
            setBackScriptList(resp.backScriptList);
          }
        );
    });
  }, []);
  return (
    <Card
      size="small"
      title={
        <div className="flex justify-between">
          <span className="text-xl">ScriptCat</span>
          <div className="flex flex-row">
            <Button
              type="text"
              icon={<IconHome />}
              iconOnly
              href="/src/options.html"
              target="_blank"
            />
            <Badge count={isRead ? 0 : 1} dot offset={[-8, 6]}>
              <Button
                type="text"
                icon={<IconNotification />}
                iconOnly
                onClick={() => {
                  setShowAlert(!showAlert);
                  setIsRead(true);
                  systemManage.setRead(true);
                }}
              />
            </Badge>
            <Dropdown
              droplist={
                <Menu
                  style={{
                    maxHeight: "none",
                  }}
                  onClickMenuItem={(key) => {
                    switch (key) {
                      case "newScript":
                        chrome.tabs.query({ active: true }, (tab) => {
                          if (tab.length && tab[0].url?.startsWith("http")) {
                            chrome.storage.local.set({
                              activeTabUrl: {
                                url: tab[0].url,
                              },
                            });
                            window.open(
                              "/src/options.html#/script/editor?target=initial"
                            );
                          }
                        });
                        break;
                      default:
                        window.open(key, "_blank");
                        break;
                    }
                  }}
                >
                  <Menu.Item key="newScript">
                    <IconPlus style={iconStyle} />
                    新建脚本
                  </Menu.Item>
                  <Menu.Item key="https://scriptcat.org/">
                    <IconSearch style={iconStyle} />
                    获取脚本
                  </Menu.Item>
                  <Menu.Item key="https://github.com/scriptscat/scriptcat/issues">
                    <IconBug style={iconStyle} />
                    BUG/问题反馈
                  </Menu.Item>
                  <Menu.Item key="https://docs.scriptcat.org/">
                    <IconBook style={iconStyle} />
                    项目文档
                  </Menu.Item>
                  <Menu.Item key="https://bbs.tampermonkey.net.cn/">
                    <RiMessage2Line style={iconStyle} />
                    交流社区
                  </Menu.Item>
                  <Menu.Item key="https://github.com/scriptscat/scriptcat">
                    <IconGithub style={iconStyle} />
                    GitHub
                  </Menu.Item>
                </Menu>
              }
              trigger="click"
            >
              <Button type="text" icon={<IconMoreVertical />} iconOnly />
            </Dropdown>
          </div>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <Alert
        style={{ marginBottom: 20, display: showAlert ? "flex" : "none" }}
        type="info"
        // eslint-disable-next-line react/no-danger
        content={<div dangerouslySetInnerHTML={{ __html: notice }} />}
      />
      <Collapse
        bordered={false}
        defaultActiveKey={["script", "background"]}
        style={{ maxWidth: 640 }}
      >
        <CollapseItem
          header="当前页运行脚本"
          name="script"
          style={{ padding: "0" }}
          contentStyle={{ padding: "0" }}
        >
          <ScriptMenuList script={scriptList} />
        </CollapseItem>

        <CollapseItem
          header="正在运行的后台脚本"
          name="background"
          style={{ padding: "0" }}
          contentStyle={{ padding: "0" }}
        >
          <ScriptMenuList script={backScriptList} />
        </CollapseItem>
      </Collapse>
      <div className="flex flex-row arco-card-header !h-6">
        <span className="text-1 font-500">
          v{systemManage.systemConfig.version}
        </span>
        {semver.lt(systemManage.systemConfig.version, version) && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            onClick={() => {
              window.open(
                `https://github.com/scriptscat/scriptcat/releases/tag/v${version}`
              );
            }}
            className="text-1 font-500"
            style={{ cursor: "pointer" }}
          >
            有更新的版本
          </span>
        )}
      </div>
    </Card>
  );
}

export default App;
