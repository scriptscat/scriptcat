import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { lazyScriptName } from "@App/pkg/config/config";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { ScriptCodeDAO } from "@App/app/repo/scripts";
import type { EditorTab } from "./useEditorTabs";

const scriptCodeDAO = new ScriptCodeDAO();

// 读取脚本源码（轻量，直接走 DAO）
export async function loadScriptCode(uuid: string): Promise<string> {
  const code = await scriptCodeDAO.get(uuid);
  return code?.code || "";
}

// 从激活标签 URL 推断 normal 模板的 @match / @icon
async function resolveInitialMatch(): Promise<[string, string]> {
  return new Promise<[string, string]>((resolve) => {
    chrome.storage.local.get(["activeTabUrl"], (result) => {
      const lastError = chrome.runtime.lastError;
      let retUrl = "https://*/*";
      let retIcon = "";
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        void chrome.storage.local.remove(["activeTabUrl"]);
      } else {
        void chrome.storage.local.remove(["activeTabUrl"]);
        const pageUrl = (result?.activeTabUrl as { url?: string } | undefined)?.url;
        if (pageUrl) {
          try {
            const { protocol, pathname, hostname, search } = new URL(pageUrl);
            if (protocol && pathname && hostname) {
              retUrl = `${protocol}//${hostname}${pathname}${search.length > 1 ? search : ""}`;
              if (protocol === "http:" || protocol === "https:") {
                retIcon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
              }
            }
          } catch {
            // ignore malformed url
          }
        }
      }
      resolve([retUrl, retIcon]);
    });
  });
}

// 新建空脚本（移植 v1.4 emptyScript）
export async function emptyScript(template: string, target?: string): Promise<EditorTab> {
  let code = "";
  switch (template) {
    case "background":
      code = lazyScriptName(backgroundTpl);
      break;
    case "crontab":
      code = lazyScriptName(crontabTpl);
      break;
    default: {
      code = lazyScriptName(normalTpl);
      const [url, icon] = target === "initial" ? await resolveInitialMatch() : ["https://*/*", ""];
      if (icon) {
        code = code.replace("{{match}}", url).replace("{{icon}}", icon);
      } else {
        code = code.replace("{{match}}", url).replace(/[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
      }
      break;
    }
  }
  const { script } = await prepareScriptByCode(code, "", uuidv4());
  script.createtime = 0; // 标记为未保存的新脚本
  return { uuid: script.uuid, script, code, isChanged: false };
}
