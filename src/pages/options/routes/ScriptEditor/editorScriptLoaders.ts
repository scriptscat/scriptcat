import { uuidv4 } from "@App/pkg/utils/uuid";
import { lazyScriptName, nextScriptName } from "@App/pkg/config/config";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import {
  DEFAULT_TEMPLATE_MATCH,
  renderScriptTemplate,
  resolveScriptTemplate,
  type ScriptTemplateType,
} from "@App/pkg/utils/script_template";
import { ScriptCodeDAO } from "@App/app/repo/scripts";
import { systemConfig } from "@App/pages/store/global";
import type { EditorTab } from "./useEditorTabs";

const scriptCodeDAO = new ScriptCodeDAO();

// 读取脚本源码（轻量，直接走 DAO）
export async function loadScriptCode(uuid: string): Promise<string> {
  const code = await scriptCodeDAO.get(uuid);
  return code?.code || "";
}

// 模板中与当前页面相关的变量；没有活动标签页时除 match 外都为空，对应行会被删除
type PageVars = { match: string; icon: string; domain: string; title: string };

const EMPTY_PAGE_VARS: PageVars = { match: DEFAULT_TEMPLATE_MATCH, icon: "", domain: "", title: "" };

// 从激活标签（由 popup 写入）推断模板变量
async function resolveActiveTabVars(): Promise<PageVars> {
  return new Promise<PageVars>((resolve) => {
    chrome.storage.local.get(["activeTabUrl"], (result) => {
      const lastError = chrome.runtime.lastError;
      void chrome.storage.local.remove(["activeTabUrl"]);
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        resolve(EMPTY_PAGE_VARS);
        return;
      }
      const activeTab = result?.activeTabUrl as { url?: string; title?: string } | undefined;
      const pageUrl = activeTab?.url;
      const vars: PageVars = { ...EMPTY_PAGE_VARS, title: activeTab?.title || "" };
      if (pageUrl) {
        try {
          const { protocol, pathname, hostname, search } = new URL(pageUrl);
          if (protocol && pathname && hostname) {
            vars.match = `${protocol}//${hostname}${pathname}${search.length > 1 ? search : ""}`;
            vars.domain = hostname;
            if (protocol === "http:" || protocol === "https:") {
              vars.icon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
            }
          }
        } catch {
          // ignore malformed url
        }
      }
      resolve(vars);
    });
  });
}

function toTemplateType(template: string): ScriptTemplateType {
  return template === "background" || template === "crontab" ? template : "normal";
}

// 新建空脚本（移植 v1.4 emptyScript）
export async function emptyScript(template: string, target?: string): Promise<EditorTab> {
  const type = toTemplateType(template);
  const [overrides, pageVars] = await Promise.all([
    systemConfig.getScriptTemplates(),
    target === "initial" ? resolveActiveTabVars() : Promise.resolve(EMPTY_PAGE_VARS),
  ]);
  const name = nextScriptName();
  const code = renderScriptTemplate(lazyScriptName(resolveScriptTemplate(overrides, type), name), {
    name,
    ...pageVars,
    date: new Date(),
  });
  const { script } = await prepareScriptByCode(code, "", uuidv4());
  script.createtime = 0; // 标记为未保存的新脚本
  return { uuid: script.uuid, script, code, subView: "code", isChanged: false };
}
