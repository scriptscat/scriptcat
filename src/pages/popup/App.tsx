import { ExtVersion } from "@App/app/const";
import { Alert, Badge, Button, Card, Collapse, Dropdown, Menu, Switch } from "@arco-design/web-react";
import {
  IconBook,
  IconBug,
  IconGithub,
  IconMoreVertical,
  IconNotification,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSync,
} from "@arco-design/web-react/icon";
import { useCallback, useEffect, useState } from "react";
import { RiMessage2Line } from "react-icons/ri";
import semver from "semver";
import { useTranslation } from "react-i18next";
import ScriptMenuList from "../components/ScriptMenuList";
import { popupClient, scriptClient } from "../store/features/script";
import type { ScriptMenu } from "@App/app/service/service_worker/types";
import { systemConfig } from "../store/global";
import { localePath } from "@App/locales/locales";
import { getBrowserVersion, isEdge, isUserScriptsAvailable } from "@App/pkg/utils/utils";

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
  const [checkUpdate, setCheckUpdate] = useState<Parameters<typeof systemConfig.setCheckUpdate>[0]>({
    version: ExtVersion,
    notice: "",
    isRead: false,
  });
  const [currentUrl, setCurrentUrl] = useState("");
  const [isEnableScript, setIsEnableScript] = useState(true);
  const [isBlacklist, setIsBlacklist] = useState(false);
  const { t } = useTranslation();

  let url: URL | undefined;
  try {
    url = new URL(currentUrl);
  } catch (_: any) {
    // ignore error
  }

  /*
  useEffect(() => {
    let isMounted = true;
    const loadConfig = async () => {
      const [isEnableScript, checkUpdate] = await Promise.all([
        systemConfig.getEnableScript(),
        systemConfig.getCheckUpdate(),
      ]);
      if (!isMounted) return;
      setIsEnableScript(isEnableScript);
      setCheckUpdate(checkUpdate);
    };
    loadConfig();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!isMounted || !tabs.length) return;
      const newUrl = tabs[0].url || "";
      if (newUrl !== currentUrl) {
        setCurrentUrl(newUrl);
        popupClient.getPopupData({ url: tabs[0].url!, tabId: tabs[0].id! }).then((resp) => {
          if (!isMounted) return;
          // 按照开启状态和更新时间排序
          const list = resp.scriptList;
          list.sort((a, b) =>
            //@ts-ignore
            (b.enable - a.enable) || (
              // 根据菜单数排序
              (b.menus.length - a.menus.length) || (b.runNum - a.runNum) || (b.updatetime - a.updatetime)
            )
          );
          setScriptList(list);
          setBackScriptList(resp.backScriptList);
          setIsBlacklist(resp.isBlacklist);
        });
      }
    });
    return () => {
      isMounted = false;
    }
  }, [currentUrl]);
  */

  useEffect(() => {
    let isMounted = true;

    const onCurrentUrlUpdated = (tabs: chrome.tabs.Tab[]) => {
      checkScriptEnableAndUpdate();
      popupClient.getPopupData({ url: tabs[0].url!, tabId: tabs[0].id! }).then((resp) => {
        if (!isMounted) return;
        // 按照开启状态和更新时间排序
        const list = resp.scriptList;
        list.sort((a, b) =>
          //@ts-ignore
          (b.enable - a.enable) || (
            // 根据菜单数排序
            (b.menus.length - a.menus.length) || (b.runNum - a.runNum) || (b.updatetime - a.updatetime)
          )
        );
        setScriptList(list);
        setBackScriptList(resp.backScriptList);
        setIsBlacklist(resp.isBlacklist);
        checkScriptEnableAndUpdate();
      });
    }

    const checkScriptEnableAndUpdate = async () => {
      const [isEnableScript, checkUpdate] = await Promise.all([
        systemConfig.getEnableScript(),
        systemConfig.getCheckUpdate(),
      ]);
      if (!isMounted) return;
      setIsEnableScript(isEnableScript);
      setCheckUpdate(checkUpdate);
    }
    const queryTabInfo = () => {
      // 只跑一次 tab 资讯，不绑定在 currentUrl
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!isMounted || !tabs.length) return;
        const newUrl = tabs[0].url || "";
        setCurrentUrl(prev => {
          if (newUrl !== prev) {
            onCurrentUrlUpdated(tabs);
          }
          return newUrl;
        });
      });
    };

    checkScriptEnableAndUpdate();
    queryTabInfo();
    return () => { isMounted = false };
  }, []);

  const handleEnableScriptChange = useCallback((val: boolean) => {
    setIsEnableScript(val);
    systemConfig.setEnableScript(val);
  }, []);

  const handleSettingsClick = useCallback(() => {
    // 用a链接的方式,vivaldi竟然会直接崩溃
    window.open("/src/options.html", "_blank");
  }, []);

  const handleNotificationClick = useCallback(() => {
    setShowAlert(prev => !prev);
    const updatedCheckUpdate = { ...checkUpdate, isRead: true };
    setCheckUpdate(updatedCheckUpdate);
    systemConfig.setCheckUpdate(updatedCheckUpdate);
  }, [checkUpdate]);

  const handleMenuClick = useCallback(async (key: string) => {
    switch (key) {
      case "newScript":
        await chrome.storage.local.set({
          activeTabUrl: { url: currentUrl },
        });
        window.open("/src/options.html#/script/editor?target=initial", "_blank");
        break;
      case "checkUpdate":
        await scriptClient.requestCheckUpdate("");
        window.close();
        break;
      case "report_issue": {
        const browserInfo = `${navigator.userAgent}`;
        const issueUrl =
          `https://github.com/scriptscat/scriptcat/issues/new?` +
          `template=bug_report${localePath === "/en" ? "_en" : ""}.yaml&scriptcat-version=${ExtVersion}&` +
          `browser-version=${encodeURIComponent(browserInfo)}`;
        window.open(issueUrl, "_blank");
        break;
      }
      default:
        window.open(key, "_blank");
        break;
    }
  }, [currentUrl]);

  const isUserScriptsAvailableFlag = isUserScriptsAvailable();

  return (
    <>
      {!isUserScriptsAvailableFlag && (
        <Alert
          type="warning"
          content={
            <div
              dangerouslySetInnerHTML={{
                __html:
                  // Edge浏览器目前没有允许用户脚本选项，开启开发者模式即可
                  getBrowserVersion() < 120
                    ? t("lower_version_browser_guide")
                    : getBrowserVersion() >= 138 && !isEdge()
                      ? t("allow_user_script_guide")
                      : t("develop_mode_guide"),
              }}
            />
          }
        />
      )}
      {isBlacklist && <Alert type="warning" content={t("page_in_blacklist")} />}
      <Card
        size="small"
        title={
          <div className="flex justify-between">
            <span className="text-xl">ScriptCat</span>
            <div className="flex flex-row items-center">
              <Switch
                size="small"
                className="mr-1"
                checked={isEnableScript}
                onChange={handleEnableScriptChange}
              />
              <Button
                type="text"
                icon={<IconSettings />}
                iconOnly
                onClick={handleSettingsClick}
              />
              <Badge count={checkUpdate.isRead ? 0 : 1} dot offset={[-8, 6]}>
                <Button
                  type="text"
                  icon={<IconNotification />}
                  iconOnly
                  onClick={handleNotificationClick}
                />
              </Badge>
              <Dropdown
                droplist={
                  <Menu
                    style={{
                      maxHeight: "none",
                    }}
                    onClickMenuItem={handleMenuClick}
                  >
                    <Menu.Item key="newScript">
                      <IconPlus style={iconStyle} />
                      {t("create_script")}
                    </Menu.Item>
                    <Menu.Item key={`https://scriptcat.org/search?domain=${url && url.host}`}>
                      <IconSearch style={iconStyle} />
                      {t("get_script")}
                    </Menu.Item>
                    <Menu.Item key={"checkUpdate"}>
                      <IconSync style={iconStyle} />
                      {t("check_update")}
                    </Menu.Item>
                    <Menu.Item key="report_issue">
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
          style={{ display: showAlert ? "flex" : "none" }}
          type="info"
          content={<div dangerouslySetInnerHTML={{ __html: checkUpdate.notice || "" }} />}
        />
        <Collapse
          bordered={false}
          defaultActiveKey={["script", "background"]}
          style={{ maxWidth: 640, maxHeight: 500, overflow: "auto" }}
        >
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
            <ScriptMenuList script={backScriptList} isBackscript={true} currentUrl={currentUrl} />
          </CollapseItem>
        </Collapse>
        <div className="flex flex-row arco-card-header !h-6">
          <span className="text-[12px] font-500">{`v${ExtVersion}`}</span>
          {semver.lt(ExtVersion, checkUpdate.version) && (
            <span
              onClick={() => {
                window.open(`https://github.com/scriptscat/scriptcat/releases/tag/v${checkUpdate.version}`);
              }}
              className="text-[10px] font-500 cursor-pointer underline text-blue-500 underline-offset-2"
            >
              {t("popup.new_version_available")}
            </span>
          )}
        </div>
      </Card>
    </>
  );
}

export default App;
