import { Alert, Button } from "@arco-design/web-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkUserScriptsAvailable, getBrowserType, BrowserType } from "@App/pkg/utils/utils";
import edgeMobileQrCode from "@App/assets/images/edge_mobile_qrcode.png";

interface PopupWarningsProps {
  isBlacklist: boolean;
}

function PopupWarnings({ isBlacklist }: PopupWarningsProps) {
  const { t } = useTranslation();
  const [isUserScriptsAvailableState, setIsUserScriptsAvailableState] = useState<boolean | null>(null);
  const [showRequestButton, setShowRequestButton] = useState(false);
  const [permissionReqResult, setPermissionReqResult] = useState("");

  const updateIsUserScriptsAvailableState = async () => {
    const badgeText = await chrome.action.getBadgeText({});
    let displayState;
    if (badgeText === "!") {
      // 要求用户重启扩展/浏览器，会重置badge状态的
      displayState = false;
    } else {
      displayState = await checkUserScriptsAvailable();
    }
    setIsUserScriptsAvailableState(displayState);
  };

  useEffect(() => {
    updateIsUserScriptsAvailableState();
  }, []);

  const warningMessageHTML = useMemo(() => {
    if (isUserScriptsAvailableState === null) return "";
    // 可使用UserScript的话，不查browserType
    const browserType = !isUserScriptsAvailableState ? getBrowserType() : null;

    const warningMessageHTML = browserType
      ? browserType.firefox
        ? t("develop_mode_guide")
        : browserType.chrome
          ? browserType.chrome & BrowserType.chromeA
            ? t("lower_version_browser_guide")
            : browserType.chrome & BrowserType.chromeC && browserType.chrome & BrowserType.Chrome
              ? t("allow_user_script_guide")
              : t("develop_mode_guide") // Edge浏览器目前没有允许用户脚本选项，开启开发者模式即可
          : "UNKNOWN"
      : "";

    return `${warningMessageHTML} <a href="#reload" style="color: var(--color-text-1)">👉${t("click_to_reload")}</a>`;
  }, [isUserScriptsAvailableState, t]);

  const isEdgeBrowser = useMemo(() => {
    const browserType = getBrowserType();
    return (
      localStorage["hideEdgeMobileQrCodeAlert"] !== "1" && (browserType && browserType.chrome & BrowserType.Edge) > 0
    );
  }, []);

  // 权限要求详见：https://github.com/mdn/webextensions-examples/blob/main/userScripts-mv3/options.mjs
  useEffect(() => {
    //@ts-ignore
    if (chrome.permissions?.contains && chrome.permissions?.request) {
      chrome.permissions.contains(
        {
          permissions: ["userScripts"],
        },
        function (permissionOK) {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.contains:", lastError.message);
            // runtime 错误的话不显示按钮
            return;
          }
          if (permissionOK === false) {
            // 假设browser能支持 `chrome.permissions.contains` 及在 callback返回一个false值的话，
            // chrome.permissions.request 应该可以执行
            // 因此在这裡显示按钮
            setShowRequestButton(true);
          }
        }
      );
    }
  }, []);

  const handleRequestPermission = () => {
    const updateOnPermissionGranted = async (granted: boolean) => {
      if (granted) {
        granted = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "userScripts.LISTEN_CONNECTIONS" }, (resp) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              resp = false;
              console.error("chrome.runtime.lastError in chrome.permissions.request:", lastError.message);
            }
            resolve(resp === true);
          });
        });
      }
      if (granted) {
        setPermissionReqResult("✅");
        // UserScripts API相关的初始化：
        // userScripts.LISTEN_CONNECTIONS 進行 Server 通讯初始化
        // onUserScriptAPIGrantAdded 進行 腳本注冊
        updateIsUserScriptsAvailableState();
      } else {
        setPermissionReqResult("❎");
      }
    };
    chrome.permissions.request({ permissions: ["userScripts"] }, (granted) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        granted = false;
        console.error("chrome.runtime.lastError in chrome.permissions.request:", lastError.message);
      }
      updateOnPermissionGranted(granted);
    });
  };

  return (
    <>
      {warningMessageHTML && (
        <Alert
          type="warning"
          content={
            <div
              onClick={(ev) => {
                if (ev.target instanceof HTMLAnchorElement && ev.target.getAttribute("href") === "#reload") {
                  // 点击了刷新链接
                  chrome.runtime.reload();
                  ev.preventDefault();
                  return;
                }
              }}
              dangerouslySetInnerHTML={{
                __html: warningMessageHTML,
              }}
            />
          }
        />
      )}
      {isEdgeBrowser && (
        <Alert
          type="info"
          closable
          showIcon={false}
          onClose={() => {
            localStorage["hideEdgeMobileQrCodeAlert"] = "1";
          }}
          content={
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div>
                <div>{"在手机上使用脚本猫"}</div>
                <div style={{ fontSize: "12px", marginTop: "4px" }}>{"扫描二维码在手机上安装脚本猫"}</div>
              </div>
              <img src={edgeMobileQrCode} alt="qrcode" style={{ width: "80px", height: "80px" }} />
            </div>
          }
        />
      )}
      {showRequestButton && (
        <Button onClick={handleRequestPermission}>
          {t("request_permission")} {permissionReqResult}
        </Button>
      )}
      {isBlacklist && <Alert type="warning" content={t("page_in_blacklist")} />}
    </>
  );
}

export default PopupWarnings;
