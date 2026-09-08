import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 移动端(Android)浏览器上，软键盘默认只压缩「可视视口」(interactive-widget=resizes-visual)，
// 布局视口不变，因此高度锁定视口的整页外壳不会重排，底部工具栏/输入框被键盘挡住无法操作
// （issue #1555：编辑器、设置、导入页在安卓上几乎不可用）。声明 resizes-content 让键盘压缩
// 布局视口，配合 dvh 外壳即可把内容重排到键盘上方。
const pagesDir = path.join(process.cwd(), "src/pages");

// 高度锁定视口(dvh 外壳)的整页入口；popup.html 是固定尺寸面板、页面可整体滚动，不在此列。
const fullPages = [
  "options.html",
  "install.html",
  "import.html",
  "batchupdate.html",
  "confirm.html",
  "external_access_confirm.html",
];

describe("整页入口的移动端视口声明（#1555）", () => {
  it.each(fullPages)("%s 的 viewport 应声明 interactive-widget=resizes-content", (page) => {
    const html = fs.readFileSync(path.join(pagesDir, page), "utf8");
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1];
    expect(viewport, `${page} 缺少 viewport meta`).toBeDefined();
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("interactive-widget=resizes-content");
  });
});
