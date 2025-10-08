const getUrlDomain = (navUrl: string) => {
  let domain = "";
  try {
    const url = new URL(navUrl);
    if (url.protocol.startsWith("http")) {
      domain = url.hostname;
    }
  } catch {
    // ignore
  }
  return domain;
};

let onUserActionDomainChanged: ((...args: any) => Promise<any>) | null = null;
let onTabURLChanged: ((...args: any) => Promise<any>) | null = null;

// 记录所有Tab的网址 （只作内部暂存检查之用）
const lastNavs: Partial<Record<string, string>> = {};
// 记录最后的连接时间，判断后台载入是否用户操作
let lastNavActionTimestamp = 0;

const isRelatedDomain = (domainA: string, domainB: string) => {
  // .www.facebook.com endsWith .facebook.com
  if (`.${domainA}`.endsWith(`.${domainB}`)) return true;
  if (`.${domainB}`.endsWith(`.${domainA}`)) return true;
  return false;
};

const onUrlNavigated = (tab: chrome.tabs.Tab) => {
  const navUrl: string | undefined = tab.pendingUrl || tab.url; // 打算连接的URL 或 已推送的URL
  if (!navUrl) return;
  const previousUrl = lastNavs[`${tab.id}`]; // 上一次记录
  if (previousUrl === `${navUrl}`) return; // loading -> complete 不执行
  lastNavs[`${tab.id}`] = `${navUrl}`; // 更新记录至本次URL
  // console.log("onUrlNavigated", navUrl, tab);
  if (!tab.frozen && !tab.incognito) {
    // 正常Tab （ 非私隐模式 非省电 ）
    if (tab.active || (!previousUrl && Date.now() - lastNavActionTimestamp > 100)) {
      // 用户正在点击的页面，或新打开的页面

      lastNavActionTimestamp = Date.now(); // 记录用户操作时间（仅用于内部处理。不要永久记录）
      const oldDomain = previousUrl ? getUrlDomain(previousUrl) : ""; // 新分页没有oldDomain
      const newDomain = getUrlDomain(navUrl);
      // !previousUrl - initial tab
      // !oldDomain - not initial tab but previously it is not http (e.g. chrome://newtab/)
      if (
        newDomain &&
        (!previousUrl || !oldDomain || (oldDomain !== newDomain && !isRelatedDomain(oldDomain, newDomain)))
      ) {
        // new tab or change of domain

        // console.log("onUrlNavigated - Triggered with Domain Change Or New Tab", tab);

        if (onUserActionDomainChanged) onUserActionDomainChanged(oldDomain, newDomain, previousUrl, navUrl, tab);
      }
    }
  }
  onTabURLChanged?.(navUrl);
};

const onTabRemoved = (tabId: number) => {
  delete lastNavs[`${tabId}`];
};

const setOnUserActionDomainChanged = (f: ((...args: any) => Promise<any> | any) | null = null) => {
  onUserActionDomainChanged = f;
};

const setOnTabURLChanged = (f: ((...args: any) => Promise<any> | any) | null = null) => {
  onTabURLChanged = f;
};

export { onUrlNavigated, onTabRemoved, setOnUserActionDomainChanged, setOnTabURLChanged };
