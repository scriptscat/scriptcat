/**
 * DNR 只影响改动之后发出的请求，已打开的页面不会自己变化，所以保存成功要给一个刷新入口。
 * 只刷新各窗口里当前可见的网页标签：扩展自身页面（含本页）不在 http(s) 匹配式内，不会被刷掉。
 */
export async function reloadVisibleWebTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, url: ["http://*/*", "https://*/*"] });
  const ids = tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
  await Promise.all(ids.map((id) => chrome.tabs.reload(id)));
}
