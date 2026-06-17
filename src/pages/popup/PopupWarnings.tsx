import { useCallback, useEffect, useMemo, useState } from "react";
import { TriangleAlert, ShieldCheck, X } from "lucide-react";
import { checkUserScriptsAvailable, getBrowserType, BrowserType, isPermissionOk } from "@App/pkg/utils/utils";
import { t } from "@App/locales/locales";
import edgeMobileQrCode from "@App/assets/images/edge_mobile_qrcode.png";

export type UserScriptsWarning =
  | { key: "develop_mode_guide"; browser: string }
  | { key: "lower_version_browser_guide" }
  | { key: "allow_user_script_guide"; browser: string }
  | { key: "unknown" };

/**
 * 当 UserScripts API 不可用时，根据浏览器类型决定应显示的提示文案 key。
 * 调用方需先确认 API 不可用，再调用此函数。
 */
export function getUserScriptsWarning(browserType: ReturnType<typeof getBrowserType>): UserScriptsWarning {
  if (browserType.firefox) {
    return { key: "develop_mode_guide", browser: "firefox" };
  }
  if (browserType.chrome) {
    const browser = browserType.chrome & BrowserType.Edge ? "edge" : "chrome";
    if (browserType.chrome & BrowserType.noUserScriptsAPI) return { key: "lower_version_browser_guide" };
    if (browserType.chrome & BrowserType.guardedByDeveloperMode) return { key: "develop_mode_guide", browser };
    if (browserType.chrome & BrowserType.guardedByAllowScript) return { key: "allow_user_script_guide", browser };
  }
  return { key: "unknown" };
}

/**
 * Popup 顶部警告区：
 * - UserScripts API 不可用时的开发者模式/允许用户脚本/升级浏览器引导（含重新加载链接）
 * - 申请 userScripts 权限按钮
 * - Edge 移动端二维码推广（可关闭）
 */
export default function PopupWarnings() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [showRequestButton, setShowRequestButton] = useState(false);
  const [permissionResult, setPermissionResult] = useState("");
  const [hideEdgeQr, setHideEdgeQr] = useState(() => localStorage["hideEdgeMobileQrCodeAlert"] === "1");

  const refreshAvailability = useCallback(async () => {
    const badgeText = await chrome.action.getBadgeText({});
    // badge 为 "!" 表示需要重启扩展/浏览器才会重置，视为不可用
    setIsAvailable(badgeText === "!" ? false : await checkUserScriptsAvailable());
  }, []);

  useEffect(() => {
    refreshAvailability();
  }, [refreshAvailability]);

  useEffect(() => {
    isPermissionOk("userScripts").then((ok) => {
      if (ok === false) setShowRequestButton(true);
    });
  }, []);

  const warningHTML = useMemo(() => {
    // 仅在明确不可用时显示（null=检测中，true=可用）
    if (isAvailable !== false) return "";
    const warning = getUserScriptsWarning(getBrowserType());
    if (warning.key === "unknown") return "";
    return "browser" in warning ? t(`popup:${warning.key}`, { browser: warning.browser }) : t(`popup:${warning.key}`);
  }, [isAvailable]);

  const isEdge = useMemo(() => (getBrowserType().chrome & BrowserType.Edge) > 0, []);

  const handleRequestPermission = useCallback(() => {
    chrome.permissions.request({ permissions: ["userScripts"] }, (granted) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.request:", lastError.message);
        setPermissionResult("❎");
        return;
      }
      // new-ui 的 Service Worker 通过 chrome.permissions.onAdded 自动重新注册用户脚本，无需额外消息
      setPermissionResult(granted ? "✅" : "❎");
      if (granted) refreshAvailability();
    });
  }, [refreshAvailability]);

  const handleReload = useCallback(() => {
    chrome.runtime.reload();
    try {
      // Vivaldi 重启扩展时不会自动关闭 popup
      window.close();
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleCloseEdgeQr = useCallback(() => {
    localStorage["hideEdgeMobileQrCodeAlert"] = "1";
    setHideEdgeQr(true);
  }, []);

  const showWarningBlock = warningHTML || showRequestButton;
  const showEdgeQr = isEdge && !hideEdgeQr;
  if (!showWarningBlock && !showEdgeQr) return null;

  return (
    <>
      {showWarningBlock && (
        <div className="flex flex-col gap-1.5 px-4 py-2.5 bg-warning-bg border-b border-border">
          {warningHTML && (
            <div className="flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 min-w-0">
                <div
                  className="text-[12px] text-warning-fg [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
                  dangerouslySetInnerHTML={{ __html: warningHTML }}
                />
                <button
                  type="button"
                  onClick={handleReload}
                  className="text-[12px] font-medium text-primary text-left hover:underline underline-offset-2"
                >
                  {t("popup:click_to_reload")}
                </button>
              </div>
            </div>
          )}
          {showRequestButton && (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="inline-flex items-center gap-1.5 self-start h-7 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("popup:request_permission")}
              {permissionResult && <span>{permissionResult}</span>}
            </button>
          )}
        </div>
      )}
      {showEdgeQr && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary-light border-b border-border">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-foreground">{t("popup:use_on_mobile")}</div>
            <div className="text-[11px] text-muted-foreground">{t("popup:scan_qr_to_install")}</div>
          </div>
          <img src={edgeMobileQrCode} alt="QR" className="w-14 h-14 rounded-md bg-white shrink-0" />
          <button
            type="button"
            aria-label="close"
            onClick={handleCloseEdgeQr}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
