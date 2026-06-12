import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { installScriptByCode, openOptionsPage } from "./utils";

/**
 * UserConfig YAML 原型链污染防护 (#1494, Security)
 *
 * 修复：parseUserConfig 改用 Object.create(null) 承载结果，并拒绝任何出现在
 * Object.prototype 上的分组键（__proto__、constructor、toString 等），
 * 防止不可信的用户脚本 @userConfig 元数据污染原型链。
 *
 * 解析发生在 Service Worker（安装时 parseScriptFromCode → parseUserConfig）。
 * 端到端可观察点：
 *  - 合法 @userConfig 仍正常工作（回归）：脚本安装成功、配置面板能打开并渲染字段
 *  - 含 __proto__ 分组键的恶意 @userConfig 被拒绝：脚本不会被安装；且 SW 与页面的
 *    Object.prototype 均未被污染
 */

const validCfg = `// ==UserScript==
// @name         UC Valid E2E
// @namespace    https://e2e.test
// @version      1.0.0
// @match        http://example.com/*
// @grant        none
// ==/UserScript==
/* ==UserConfig==
group1:
  configA:
    title: 配置A标题
    type: text
    default: hello
==/UserConfig== */
(function(){})();
`;

const evilCfg = `// ==UserScript==
// @name         UC Evil E2E
// @namespace    https://e2e.test
// @version      1.0.0
// @match        http://example.com/*
// @grant        none
// ==/UserScript==
/* ==UserConfig==
__proto__:
  polluted:
    title: x
    type: text
    default: yes
==/UserConfig== */
(function(){})();
`;

async function getScriptInfo(page: Page, name: string): Promise<{ uuid: string; config: any } | null> {
  return page.evaluate((n: string) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        for (const k of Object.keys(all)) {
          if (k.startsWith("script:") && all[k]?.name === n) {
            resolve({ uuid: all[k].uuid, config: all[k].config });
            return;
          }
        }
        resolve(null);
      });
    });
  }, name);
}

test.describe("UserConfig YAML prototype pollution (#1494)", () => {
  test("合法 @userConfig 正常安装、解析结构正确、配置面板可打开", async ({ context, extensionId }) => {
    await installScriptByCode(context, extensionId, validCfg);

    const list = await openOptionsPage(context, extensionId);
    const info = await getScriptInfo(list, "UC Valid E2E");
    await list.close();

    // 解析结构正确（基于 Object.create(null) 的解析仍然有效）
    expect(info, "合法配置脚本未安装").not.toBeNull();
    expect(info!.config?.group1?.configA?.title).toBe("配置A标题");
    expect(info!.config?.group1?.configA?.type).toBe("text");
    expect(info!.config?.["#options"]?.sort).toContain("group1");

    // 通过 URL 参数直接打开配置面板，断言字段渲染
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options.html#/?userConfig=${info!.uuid}`);
    await page.waitForLoadState("domcontentloaded");
    const modal = page.locator(".modal-config");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal).toContainText("配置A标题");
    await page.close();
  });

  test("含 __proto__ 分组键的恶意 @userConfig 被拒绝，原型链未被污染", async ({ context, extensionId }) => {
    // SW 解析前：原型干净
    const sw = context.serviceWorkers()[0];
    expect(sw, "未找到 service worker").toBeTruthy();
    const before = await sw.evaluate(() => (Object.prototype as any).polluted);
    expect(before).toBeUndefined();

    // 尝试安装恶意脚本（parseUserConfig 应抛错并阻止安装）
    await installScriptByCode(context, extensionId, evilCfg);

    const list = await openOptionsPage(context, extensionId);
    const evilInfo = await getScriptInfo(list, "UC Evil E2E");

    // 恶意脚本不应被安装
    expect(evilInfo, "恶意 __proto__ 配置脚本不应被安装").toBeNull();

    // SW 与页面的 Object.prototype 均未被污染
    const swAfter = await sw.evaluate(() => (Object.prototype as any).polluted);
    expect(swAfter).toBeUndefined();
    const pageAfter = await list.evaluate(() => (Object.prototype as any).polluted);
    expect(pageAfter).toBeUndefined();

    await list.close();
  });
});
