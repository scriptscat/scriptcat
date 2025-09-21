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

// 記錄所有Tab的網址 （只作內部暫存檢查之用）
const lastNavs: Partial<Record<string, string>> = {};
// 記錄最後的連接時間，判斷後台載入是否用戶操作
let lastNavActionTimestamp = 0;

const isRelatedDomain = (domainA: string, domainB: string) => {
  // .www.facebook.com endsWith .facebook.com
  if (`.${domainA}`.endsWith(`.${domainB}`)) return true;
  if (`.${domainB}`.endsWith(`.${domainA}`)) return true;
  return false;
};

const onUrlNavigated = (tab: chrome.tabs.Tab) => {
  const navUrl: string | undefined = tab.pendingUrl || tab.url; // 打算連接的URL 或 已推送的URL
  if (!navUrl) return;
  const previousUrl = lastNavs[`${tab.id}`]; // 上一次記錄
  if (previousUrl === `${navUrl}`) return; // loading -> complete 不執行
  lastNavs[`${tab.id}`] = `${navUrl}`; // 更新記錄至本次URL
  // console.log("onUrlNavigated", navUrl, tab);
  if (!tab.frozen && !tab.incognito) {
    // 正常Tab （ 非私隱模式 非省電 ）
    if (tab.active || (!previousUrl && Date.now() - lastNavActionTimestamp > 100)) {
      // 用戶正在點擊的頁面，或新打開的頁面

      lastNavActionTimestamp = Date.now(); // 記錄用戶操作時間（僅用於內部處理。不要永久記錄）
      const oldDomain = previousUrl ? getUrlDomain(previousUrl) : ""; // 新分頁沒有oldDomain
      const newDomain = getUrlDomain(navUrl);
      console.log(1288, tab, oldDomain, newDomain);
      // !previousUrl - initial tab
      // !oldDomain - not initial tab but previously it is not http (e.g. chrome://newtab/)
      if (
        newDomain &&
        (!previousUrl || !oldDomain || (oldDomain !== newDomain && !isRelatedDomain(oldDomain, newDomain)))
      ) {
        // new tab or change of domain

        console.log("onUrlNavigated - Triggered with Domain Change Or New Tab", tab);

        if (onUserActionDomainChanged) onUserActionDomainChanged(oldDomain, newDomain, previousUrl, navUrl, tab);
      }
    }
  }
};

const onTabRemoved = (tabId: number) => {
  delete lastNavs[`${tabId}`];
};

const setOnUserActionDomainChanged = (f: ((...args: any) => Promise<any>) | null = null) => {
  onUserActionDomainChanged = f;
};

export { onUrlNavigated, onTabRemoved, setOnUserActionDomainChanged };
