import { ExtVersion } from "@App/app/const";
import { Alert, Badge, Button, Card, Collapse, Dropdown, Menu, Switch } from "@arco-design/web-react";
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
import { useTranslation } from "react-i18next";
import ScriptMenuList from "../components/ScriptMenuList";
import { popupClient } from "../store/features/script";
import { ScriptMenu } from "@App/app/service/service_worker/popup";

const CollapseItem = Collapse.Item;

const iconStyle = {
  marginRight: 8,
  fontSize: 16,
  transform: "translateY(1px)",
};

function App() {
  const [scriptList, setScriptList] = useState<ScriptMenu[]>([]);
  const [backScriptList, setBackScriptList] = useState<ScriptMenu[]>([]);
  const [showAlert, setShowAlert] = useState(false);
  const [notice, setNotice] = useState("");
  const [isRead, setIsRead] = useState(true);
  const [version, setVersion] = useState(ExtVersion);
  const [currentUrl, setCurrentUrl] = useState("");
  const [isEnableScript, setIsEnableScript] = useState(localStorage.enable_script !== "false");
  const { t } = useTranslation();

  let url: URL | undefined;
  try {
    url = new URL(currentUrl);
  } catch (e) {
    // ignore error
  }

  useEffect(() => {
    // systemManage.getNotice().then((res) => {
    //   if (res) {
    //     setNotice(res.notice);
    //     setIsRead(res.isRead);
    //   }
    // });
    // systemManage.getVersion().then((res) => {
    //   res && setVersion(res);
    // });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        return;
      }
      setCurrentUrl(tabs[0].url || "");
      popupClient.getPopupData({ url: tabs[0].url!, tabId: tabs[0].id! }).then((resp) => {
        console.log(resp);
        // 按照开启状态和更新时间排序
        const list = resp.scriptList;
        list.sort((a, b) => {
          if (a.enable === b.enable) {
            // 根据菜单数排序
            if (a.menus.length !== b.menus.length) {
              return b.menus.length - a.menus.length;
            }
            if (a.runNum !== b.runNum) {
              return b.runNum - a.runNum;
            }
            return b.updatetime - a.updatetime;
          }
          return a.enable ? -1 : 1;
        });
        setScriptList(list);
        setBackScriptList(resp.backScriptList);
      });
    });
  }, []);
  return (
    <Card
      size="small"
      title={
        <div className="flex justify-between">
          <span className="text-xl">ScriptCat</span>
          <div className="flex flex-row items-center">
            <Switch
              size="small"
              checked={isEnableScript}
              onChange={(val) => {
                setIsEnableScript(val);
                if (val) {
                  localStorage.enable_script = "true";
                } else {
                  localStorage.enable_script = "false";
                }
              }}
            />
            <Button
              type="text"
              icon={<IconHome />}
              iconOnly
              onClick={() => {
                // 用a链接的方式,vivaldi竟然会直接崩溃
                window.open("/src/options.html", "_blank");
              }}
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
                  onClickMenuItem={async (key) => {
                    switch (key) {
                      case "newScript":
                        await chrome.storage.local.set({
                          activeTabUrl: {
                            url: currentUrl,
                          },
                        });
                        window.open("/src/options.html#/script/editor?target=initial", "_blank");
                        break;
                      default:
                        window.open(key, "_blank");
                        break;
                    }
                  }}
                >
                  <Menu.Item key="newScript">
                    <IconPlus style={iconStyle} />
                    {t("create_script")}
                  </Menu.Item>
                  <Menu.Item key={`https://scriptcat.org/search?domain=${url && url.host}`}>
                    <IconSearch style={iconStyle} />
                    {t("get_script")}
                  </Menu.Item>
                  <Menu.Item key="https://github.com/scriptscat/scriptcat/issues">
                    <IconBug style={iconStyle} />
                    {t("report_issue")}
                  </Menu.Item>
                  <Menu.Item key="https://docs.scriptcat.org/">
                    <IconBook style={iconStyle} />
                    {t("project_docs")}
                  </Menu.Item>
                  <Menu.Item key="https://bbs.tampermonkey.net.cn/">
                    <RiMessage2Line style={iconStyle} />
                    {t("community")}
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
        content={<div dangerouslySetInnerHTML={{ __html: notice }} />}
      />
      <Collapse bordered={false} defaultActiveKey={["script", "background"]} style={{ maxWidth: 640 }}>
        <CollapseItem
          header={t("current_page_scripts")}
          name="script"
          style={{ padding: "0" }}
          contentStyle={{ padding: "0" }}
        >
          <ScriptMenuList script={scriptList} isBackscript={false} currentUrl={currentUrl} />
        </CollapseItem>

        <CollapseItem
          header={t("enabled_background_scripts")}
          name="background"
          style={{ padding: "0" }}
          contentStyle={{ padding: "0" }}
        >
          <ScriptMenuList script={backScriptList} isBackscript currentUrl={currentUrl} />
        </CollapseItem>
      </Collapse>
      <div className="flex flex-row arco-card-header !h-6">
        <span className="text-[12px] font-500">{`v${ExtVersion}`}</span>
        {semver.lt(ExtVersion, version) && (
          <span
            onClick={() => {
              window.open(`https://github.com/scriptscat/scriptcat/releases/tag/v${version}`);
            }}
            className="text-1 font-500"
            style={{ cursor: "pointer" }}
          >
            {t("popup.new_version_available")}
          </span>
        )}
      </div>
    </Card>
  );
}

export default App;
