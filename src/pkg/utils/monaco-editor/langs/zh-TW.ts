const grantValuePrompts = {
  none: "不申請特殊 GM API 權限，腳本會以接近一般頁面腳本的方式執行。",
  unsafeWindow: "存取頁面自身的 window 物件，用於和網頁原生腳本互動。",
  GM_getValue: "讀取腳本持久化儲存中的單一值。",
  GM_getValues: "批次讀取腳本持久化儲存中的多個值。",
  GM_setValue: "寫入腳本持久化儲存中的單一值。",
  GM_setValues: "批次寫入腳本持久化儲存中的多個值。",
  GM_deleteValue: "刪除腳本持久化儲存中的單一值。",
  GM_deleteValues: "批次刪除腳本持久化儲存中的多個值。",
  GM_listValues: "列出腳本持久化儲存中的所有鍵名。",
  GM_addValueChangeListener: "監聽腳本儲存值的變化。",
  GM_removeValueChangeListener: "移除腳本儲存值變化監聽器。",
  GM_xmlhttpRequest: "發起跨來源網路請求；目標主機通常需要配合 @connect 宣告允許的網域。",
  GM_download:
    "下載檔案。支援傳入 URL 與檔名，或傳入包含 url、name、headers、saveAs 等欄位的詳細物件，並回傳可 abort 的控制代碼。",
  GM_openInTab: "開啟新分頁，並可控制前景或背景開啟等選項。",
  GM_closeInTab: "關閉由腳本開啟或管理的分頁。",
  GM_getTab: "讀取目前分頁關聯的暫存資料。",
  GM_saveTab: "儲存目前分頁關聯的暫存資料。",
  GM_getTabs: "讀取腳本儲存的所有分頁暫存資料。",
  GM_notification: "顯示瀏覽器通知，並可處理點擊、關閉等回呼。",
  GM_closeNotification: "關閉指定的腳本通知。",
  GM_updateNotification: "更新指定的腳本通知內容。",
  GM_setClipboard: "寫入系統剪貼簿。",
  GM_registerMenuCommand: "註冊腳本選單命令。",
  GM_unregisterMenuCommand: "取消註冊腳本選單命令。",
  CAT_registerMenuInput: "ScriptCat 擴充 API：註冊帶輸入框的腳本選單命令。",
  CAT_unregisterMenuInput: "ScriptCat 擴充 API：取消註冊帶輸入框的腳本選單命令。",
  GM_addStyle: "向頁面注入 CSS 樣式。",
  GM_addElement: "向頁面建立並插入元素。",
  GM_getResourceText: "讀取 @resource 宣告資源的文字內容。",
  GM_getResourceURL: "取得 @resource 宣告資源的 URL。",
  GM_cookie: "存取 Cookie API，用於讀取、寫入或刪除 Cookie。",
  GM_audio: "控制並監聽目前瀏覽器分頁的靜音與音訊播放狀態。",
  CAT_fetchBlob: "ScriptCat 內部擴充 API：讀取擴充側可存取資源並回傳 Blob。",
  CAT_fileStorage: "ScriptCat 擴充 API：存取腳本檔案儲存能力。",
  CAT_userConfig: "ScriptCat 擴充 API：存取腳本使用者設定。",
  CAT_scriptLoaded: "ScriptCat 擴充 API：在 @early-start 場景下等待腳本完整載入完成。",
  "window.close": "允許腳本呼叫 window.close()。",
  "window.focus": "允許腳本呼叫 window.focus()。",
  "window.onurlchange": "允許腳本監聽 URL 變化事件。",
} as const;

export default {
  title: "繁體中文",
  thisIsAUserScript: "一個使用者腳本",
  undefinedPrompt: "未定義的提示符",
  quickfix: "修復 {0} 問題",
  addEslintDisableNextLine: "新增 eslint-disable-next-line 註解",
  addEslintDisable: "新增 eslint-disable 註解",
  declareGlobal: "將 '{0}' 宣告為全域變數 (/* global */)",
  removeConnectWildcard: "移除 @connect 萬用字元，改為 {0}",
  replaceMatchTldWildcardWithInclude: "將 @match 頂級網域萬用字元改為 @include {0}",
  replaceIncludeWithMatch: "將 @include 改為 @match {0}",
  grantConflict: "@grant none 不能和 GM API 同時使用；請移除 none 或所有 GM API。",
  grantValuePrompts,
  prompt: {
    name: "腳本名稱",
    namespace: "腳本命名空間",
    copyright: "腳本的版權資訊",
    license: "腳本的開源協議",
    version: "腳本版本",
    description: "腳本描述",
    icon: "腳本圖示",
    iconURL: "腳本圖示",
    defaulticon: "腳本圖示",
    icon64: "64x64 大小的腳本圖示",
    icon64URL: "64x64 大小的腳本圖示",
    grant: "腳本特殊 Api 權限申請",
    author: "腳本作者",
    "run-at":
      "腳本的執行時間<br>`document-start`：在前端匹配到網址後，以最快速度將腳本注入頁面<br>`document-end`：DOM 載入完成後注入腳本，此時頁面腳本與圖像資源可能仍在載入<br>`document-idle`：所有內容載入完成後注入腳本<br>`document-body`：僅在頁面存在 body 元素時才注入腳本",
    "run-in": "腳本注入的環境",
    homepage: "腳本首頁",
    homepageURL: "腳本首頁",
    website: "腳本首頁",
    background: "背景腳本",
    include: "腳本匹配 url 執行的頁面",
    match: "腳本匹配 url 執行的頁面",
    exclude: "腳本匹配 url 不執行的頁面",
    connect: "取得網站的存取權限",
    resource: "引入資源檔案",
    require: "引入外部 js 檔",
    "require-css": "引入外部 css 檔",
    noframes: "表示腳本不在 `<frame>` 中執行",
    compatible: "用於在 GreasyFork 中顯示腳本相容性資訊",
    "inject-into":
      "腳本注入環境<br>`content`：將腳本注入 content 環境<br>`page`：將腳本注入網頁環境（預設）<br>註：SC 不支援依據 CSP 判斷是否注入 content 環境的 `inject-into: auto`。",
    "early-start":
      "配合 `run-at: document-start` 使用，`early-start` 可以比網頁更早載入並執行腳本，但可能造成效能問題與 GM API 限制。（SC 獨有）",
    unwrap:
      "讓使用者腳本不經過沙箱封裝，直接注入並執行於頁面的原生全域作用域中。<br>腳本可直接存取並修改頁面真實的全域變數，但將無法使用 GM.* 等使用者腳本的特權 API。<br>常用於需要與頁面原生腳本深度互動，或從一般頁面腳本遷移的場景。",
    definition: "ScriptCat 特有功能：一個 `.d.ts` 檔案的引用網址，可啟用編輯器自動提示",
    antifeature: `與腳本市場相關，不受歡迎的功能需要加上此描述值
referral-link：此腳本會修改或重新導向至作者的返傭連結
ads：此腳本會在您存取的頁面上插入廣告
payment：此腳本需要您付費才能正常使用
miner：此腳本存在挖礦行為
membership：此腳本需要註冊會員才能正常使用
tracking：此腳本會追蹤您的使用者資訊`.replace(/\n/g, "<br>"),
    updateURL: "腳本檢查更新的 url",
    downloadURL: "腳本更新的下載網址",
    supportURL: "支援站點、錯誤回報頁面",
    source: "腳本原始碼頁面",
    scriptUrl: "訂閱腳本中引用的使用者腳本網址",
    storageName: "腳本值儲存空間名稱，用於讓多個腳本共享同一個儲存空間",
    tag: "腳本標籤，多個標籤可用逗號或空格分隔",
    cloudCat: "標記腳本支援匯出為 CloudCat 雲端腳本套件",
    cloudServer: "腳本使用的 CloudCat 雲端服務",
    exportValue: "匯出為雲端腳本時需要匯出的腳本儲存值",
    exportCookie: "匯出為雲端腳本時需要匯出的 Cookie",
    crontab: `排程腳本 crontab 參考（不適用於雲端腳本）
* * * * * * 每秒執行一次
* * * * * 每分鐘執行一次
0 */6 * * * 每 6 小時的第 0 分執行一次
15 */6 * * * 每 6 小時的第 15 分執行一次
* once * * * 每小時執行一次
* * once * * 每天執行一次
* 10 once * * 每天 10:00-10:59 執行一次，若在 10:04 已執行，當日 10:05-10:59 不再執行
* 1,3,5 once * * 每天 1/3/5 點執行一次，若 1 點已執行，當天 3、5 點不再執行
* */4 once * * 每隔 4 小時檢查並執行一次，若 4 點已執行，當天 8/12/16/20/24 點不再執行
* 10-23 once * * 每天 10:00-23:59 執行一次，若 10:04 已執行，當日 10:05-23:59 不再執行
* once 13 * * 每月 13 號的每小時執行一次
* once(9-17) * * * 每天 9 時至 17 時期間，每小時執行一次
0,30 once * * * 每小時在 0 分或 30 分中最早命中的那次執行，本小時不再重複
* * once(9-18) * * 每月 9 號至 18 號期間，每天執行一次
* * * * once(1-5) 每週一至週五期間，每週執行一次`.replace(/\n/g, "<br>"),
  },
} as const;
