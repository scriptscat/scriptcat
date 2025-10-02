import { Discord, DocumentationSite, ExtVersion } from "@App/app/const";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { RiMessage2Line } from "react-icons/ri";
import { VersionCompare, versionCompare } from "@App/pkg/utils/semver";
import { useTranslation } from "react-i18next";
import ScriptMenuList from "../components/ScriptMenuList";
import PopupWarnings from "../components/PopupWarnings";
import { popupClient, requestOpenBatchUpdatePage } from "../store/features/script";
import type { ScriptMenu } from "@App/app/service/service_worker/types";
import { systemConfig } from "../store/global";
import { isChineseUser, localePath } from "@App/locales/locales";
import { getCurrentTab } from "@App/pkg/utils/utils";
import { useAppContext } from "../store/AppContext";

const CollapseItem = Collapse.Item;

const iconStyle = {
  marginRight: 8,
  fontSize: 16,
};

const scriptListSorter = (a: ScriptMenu, b: ScriptMenu) =>
  //@ts-ignore
  b.enable - a.enable ||
  // 排序次序：启用优先 → 菜单数量多者优先 → 执行次数多者优先 → 更新时间新者优先
  b.menus.length - a.menus.length ||
  b.runNum - a.runNum ||
  b.updatetime - a.updatetime;

function App() {
  const [loading, setLoading] = useState(true);
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
  const [collapseActiveKey, setCollapseActiveKey] = useState<string[]>(["script"]);
  const { t } = useTranslation();
  const pageTabIdRef = useRef(0);

  const urlHost = useMemo(() => {
    let url: URL | undefined;
    try {
      url = new URL(currentUrl);
    } catch (_: any) {
      // 容错：URL 解析失败时忽略错误（不影响后续 UI）
    }
    return url?.hostname ?? "";
  }, [currentUrl]);

  const { subscribeMessage } = useAppContext();
  useEffect(() => {
    let isMounted = true;

    const unhook = subscribeMessage("popupMenuRecordUpdated", ({ tabId, uuid }: { tabId: number; uuid: string }) => {
      // 仅处理当前页签(tab)的菜单更新，其他页签的变更忽略
      if (pageTabIdRef.current !== tabId) return;
      let url: string = "";
      // 透过 setState 回呼取得最新的 currentUrl（避免闭包读到旧值）
      setCurrentUrl((v) => {
        url = v || "";
        return v;
      });
      if (!url) return;
      popupClient.getPopupData({ url, tabId }).then((resp) => {
        if (!isMounted) return;

        // 响应健全性检查：必须包含 scriptList，否则忽略此次更新
        if (!resp || !resp.scriptList) {
          console.warn("Invalid popup data response:", resp);
          return;
        }

        // 仅抽取该 uuid 最新的 menus；仅更新 menus 栏位以维持其他属性的引用稳定
        const newMenus = resp.scriptList.find((item) => item.uuid === uuid)?.menus;
        if (!newMenus) return;
        setScriptList((prev) => {
          // 只针对 uuid 进行更新。其他项目保持参考一致
          const list = prev.map((item) => {
            return item.uuid !== uuid
              ? item
              : {
                  ...item,
                  menus: [...newMenus],
                };
          });
          // 若 menus 数量变动，可能影响排序结果，因此需重新 sort
          list.sort(scriptListSorter);
          return list;
        });
      });
    });

    const onCurrentUrlUpdated = (url: string, tabId: number) => {
      pageTabIdRef.current = tabId;
      checkScriptEnableAndUpdate();
      popupClient
        .getPopupData({ url, tabId })
        .then((resp) => {
          if (!isMounted) return;

          // 确保响应有效
          if (!resp || !resp.scriptList) {
            console.warn("Invalid popup data response:", resp);
            return;
          }

          // 依启用状态、菜单数量、执行次数与更新时间排序（见 scriptListSorter）
          const list = resp.scriptList;
          list.sort(scriptListSorter);
          setScriptList(list);
          setBackScriptList(resp.backScriptList || []);
          setIsBlacklist(resp.isBlacklist || false);
          checkScriptEnableAndUpdate();
          if (resp.backScriptList.length > 0) {
            setCollapseActiveKey(["script", "background"]);
          }
        })
        .catch((error) => {
          console.error("Failed to get popup data:", error);
          if (!isMounted) return;
          // 设为安全预设，避免 UI 因错误状态而崩溃
          setScriptList([]);
          setBackScriptList([]);
          setIsBlacklist(false);
        })
        .finally(() => {
          if (!isMounted) return;
          setLoading(false);
        });
    };

    const checkScriptEnableAndUpdate = async () => {
      const [isEnableScript, checkUpdate] = await Promise.all([
        systemConfig.getEnableScript(),
        systemConfig.getCheckUpdate(),
      ]);
      if (!isMounted) return;
      setIsEnableScript(isEnableScript);
      setCheckUpdate(checkUpdate);
    };
    const queryTabInfo = async () => {
      // 仅在挂载时读取一次页签资讯；不绑定 currentUrl 以避免重复查询
      try {
        const tab = await getCurrentTab();
        if (!isMounted || !tab) return;
        const newUrl = tab.url || "";
        setCurrentUrl((prev) => {
          if (newUrl !== prev) {
            const { url, id: tabId } = tab;
            if (url && tabId) onCurrentUrlUpdated(url, tabId);
          }
          return newUrl;
        });
      } catch (e) {
        console.error(e);
      }
    };

    checkScriptEnableAndUpdate();
    queryTabInfo();
    return () => {
      isMounted = false;
      unhook();
    };
  }, []);

  const { handleEnableScriptChange, handleSettingsClick, handleNotificationClick } = {
    handleEnableScriptChange: (val: boolean) => {
      setIsEnableScript(val);
      systemConfig.setEnableScript(val);
    },
    handleSettingsClick: () => {
      // 使用 window.open 而非 <a> 连结：避免 Vivaldi 等浏览器偶发崩溃
      window.open("/src/options.html", "_blank");
    },
    handleNotificationClick: () => {
      setShowAlert((prev) => !prev);
      setCheckUpdate((checkUpdate) => {
        const updatedCheckUpdate = { ...checkUpdate, isRead: true };
        systemConfig.setCheckUpdate(updatedCheckUpdate);
        return updatedCheckUpdate;
      });
    },
  };

  const getUrlDomain = (navUrl: string) => {
    let domain = "";
    try {
      const url = new URL(navUrl);
      if (url.protocol.startsWith("http")) {
        domain = url.hostname;
      }
    } catch {
      // 容错：无效 URL 直接忽略
    }
    return domain;
  };

  const doCheckUpdateInPopupMenu = async () => {
    const domain = getUrlDomain(currentUrl);
    await requestOpenBatchUpdatePage(`autoclose=-1${domain ? `&site=${domain}` : ""}`);
  };
  const handleMenuClick = async (key: string) => {
    switch (key) {
      case "newScript":
        await chrome.storage.local.set({
          activeTabUrl: { url: currentUrl },
        });
        window.open("/src/options.html#/script/editor?target=initial", "_blank");
        break;
      case "checkUpdate":
        await doCheckUpdateInPopupMenu(); // 在service_worker打开新tab及进行检查。
        break;
      case "report_issue": {
        const browserInfo = `${navigator.userAgent}`;
        const issueUrl =
          `https://github.com/scriptscat/scriptcat/issues/new?` +
          `template=bug_report${isChineseUser() ? "" : "_en"}.yaml&scriptcat-version=${ExtVersion}&` +
          `browser-version=${encodeURIComponent(browserInfo)}`;
        window.open(issueUrl, "_blank");
        break;
      }
      default:
        window.open(key, "_blank");
        break;
    }
  };

  return (
    <>
      <PopupWarnings isBlacklist={isBlacklist} />
      <Card
        size="small"
        title={
          <div className="flex justify-between">
            <div className="text-xl inline-flex flex-row items-center gap-x-1">
              <span>{"ScriptCat"}</span>
            </div>
            <div className="flex flex-row items-center">
              <Switch size="small" className="mr-1" checked={isEnableScript} onChange={handleEnableScriptChange} />
              <Button type="text" icon={<IconSettings />} iconOnly onClick={handleSettingsClick} />
              <Badge count={checkUpdate.isRead ? 0 : 1} dot offset={[-8, 6]}>
                <Button type="text" icon={<IconNotification />} iconOnly onClick={handleNotificationClick} />
              </Badge>
              <Dropdown
                onVisibleChange={(visible) => {
                  if (!visible) return;
                  // 下拉开启时校正位置：视窗过小可能导致菜单显示超出可视区域
                  setTimeout(() => {
                    const dropdowns = document.getElementsByClassName("arco-dropdown");
                    if (dropdowns.length > 0) {
                      const dropdown = dropdowns[0] as HTMLElement;
                      // 若面板 top 为负值则矫正为 0，避免被裁切
                      if (parseInt(dropdown.style.top) < 0) {
                        dropdown.style.top = "0px";
                      }
                    }
                  }, 100);
                }}
                droplist={
                  <Menu
                    style={{
                      maxHeight: "none",
                    }}
                    onClickMenuItem={handleMenuClick}
                  >
                    <Menu.Item key="newScript" className="flex flex-row items-center">
                      <IconPlus style={iconStyle} />
                      {t("create_script")}
                    </Menu.Item>
                    <Menu.Item
                      key={`https://scriptcat.org/search?domain=${urlHost}`}
                      className="flex flex-row items-center"
                    >
                      <IconSearch style={iconStyle} />
                      {t("get_script")}
                    </Menu.Item>
                    <Menu.Item key={"checkUpdate"} className="flex flex-row items-center">
                      <IconSync style={iconStyle} />
                      {t("check_update")}
                    </Menu.Item>
                    <Menu.Item key="report_issue" className="flex flex-row items-center">
                      <IconBug style={iconStyle} />
                      {t("report_issue")}
                    </Menu.Item>
                    <Menu.Item key={`${DocumentationSite}${localePath}`} className="flex flex-row items-center">
                      <IconBook style={iconStyle} />
                      {t("project_docs")}
                    </Menu.Item>
                    <Menu.Item
                      key={isChineseUser() ? "https://bbs.tampermonkey.net.cn/" : Discord}
                      className="flex flex-row items-center"
                    >
                      <RiMessage2Line style={iconStyle} />
                      {t("community")}
                    </Menu.Item>
                    <Menu.Item key="https://github.com/scriptscat/scriptcat" className="flex flex-row items-center">
                      <IconGithub style={iconStyle} />
                      {"GitHub"}
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
          activeKey={collapseActiveKey}
          onChange={(_, keys) => {
            setCollapseActiveKey(keys);
          }}
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
            style={{
              padding: "0",
              // 未加载完成期间关闭动画，避免 collapseActiveKey 变更造成闪烁
              ...(loading ? { transform: "none" } : { transform: "height 0.2s cubic-bezier(0.34, 0.69, 0.1, 1)" }),
            }}
            contentStyle={{ padding: "0" }}
          >
            <ScriptMenuList script={backScriptList} isBackscript={true} currentUrl={currentUrl} />
          </CollapseItem>
        </Collapse>
        <div className="flex flex-row arco-card-header !h-6">
          <span className="text-[12px] font-500">{`v${ExtVersion}`}</span>
          {versionCompare(ExtVersion, checkUpdate.version) === VersionCompare.LESS && (
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
