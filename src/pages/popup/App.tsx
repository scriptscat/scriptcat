import MessageInternal from "@App/app/message/internal";
import { ScriptMenu } from "@App/runtime/background/runtime";
import {
  Alert,
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
import ScriptMenuList from "../components/ScriptMenuList";

const CollapseItem = Collapse.Item;

const iconStyle = {
  marginRight: 8,
  fontSize: 16,
  transform: "translateY(1px)",
};

function App() {
  const [scriptList, setScriptList] = useState<ScriptMenu[]>([]);
  const [showAlert, setShowAlert] = useState(false);
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        return;
      }
      MessageInternal.getInstance()
        .syncSend("queryPageScript", { url: tabs[0].url, tabId: tabs[0].id })
        .then((resp: { scriptList: ScriptMenu[] }) => {
          // 按照开启状态排序
          const list = resp.scriptList;
          list.sort((a, b) => (a.enable ? 0 : 1) - (b.enable ? 0 : 1));

          setScriptList(list);
        });
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
            <Button
              type="text"
              icon={<IconNotification />}
              iconOnly
              onClick={() => {
                setShowAlert(!showAlert);
              }}
            />
            <Dropdown
              droplist={
                <Menu
                  style={{
                    maxHeight: "none",
                  }}
                  onClickMenuItem={(key) => {
                    window.open(key, "_blank");
                  }}
                >
                  <Menu.Item key="/src/options.html#/script/editor">
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
        content="这是一条公告"
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

        <CollapseItem header="正在运行的后台脚本" name="background">
          <ScriptMenuList script={[]} />
        </CollapseItem>
      </Collapse>
      <div className="flex flex-row arco-card-header !h-6">
        <span className="text-1 font-500">
          v{chrome.runtime.getManifest().version}
        </span>
      </div>
    </Card>
  );
}

export default App;
