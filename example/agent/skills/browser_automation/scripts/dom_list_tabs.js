// ==CATTool==
// @name         dom_list_tabs
// @description  列出所有打开的标签页（tabId、URL、标题、是否活跃），用于确定操作目标
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  const tabs = await CAT.agent.dom.listTabs();
  if (!tabs || tabs.length === 0) {
    return "当前没有打开的标签页";
  }
  const lines = tabs.map((t) => {
    const active = t.active ? " [active]" : "";
    return `- tabId=${t.tabId}${active} | ${t.title || "(无标题)"} | ${t.url}`;
  });
  return lines.join("\n");
} catch (e) {
  return `列出标签页失败: ${e.message || e}`;
}
