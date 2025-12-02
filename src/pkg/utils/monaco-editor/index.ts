import { globalCache, systemConfig, messageQueue } from "@App/pages/store/global";
import { SystemConfigChange } from "@App/pkg/config/config";
import type { TKeyValue } from "@Packages/message/message_queue";
import EventEmitter from "eventemitter3";
import { languages } from "monaco-editor";

// 注册eslint
const linterWorker = new Worker("/src/linter.worker.js");
const langPromise = systemConfig.getLanguage();

const langs = {
  "zh-CN": {
    title: "简体中文",
    thisIsAUserScript: "一个用户脚本",
    undefinedPrompt: "未定义的提示符",
    quickfix: "修复 {0} 问题",
    addEslintDisableNextLine: "添加 eslint-disable-next-line 注释",
    addEslintDisable: "添加 eslint-disable 注释",
    prompt: {
      name: "脚本名称",
      namespace: "脚本命名空间",
      copyright: "脚本的版权信息",
      license: "脚本的开源协议",
      version: "脚本版本",
      description: "脚本描述",
      icon: "脚本图标",
      iconURL: "脚本图标",
      defaulticon: "脚本图标",
      icon64: "64x64 大小的脚本图标",
      icon64URL: "64x64 大小的脚本图标",
      grant: "脚本特殊 Api 权限申请",
      author: "脚本作者",
      "run-at":
        "脚本的运行时间<br>`document-start`：在前端匹配到网址后，以最快的速度注入脚本到页面中<br>`document-end`：DOM 加载完成后注入脚本，此时页面脚本和图像等资源可能仍在加载<br>`document-idle`：所有内容加载完成后注入脚本<br>`document-body`：脚本只会在页面中有 body 元素时才会注入",
      "run-in": "脚本注入的环境",
      homepage: "脚本主页",
      homepageURL: "脚本主页",
      website: "脚本主页",
      background: "后台脚本",
      include: "脚本匹配 url 运行的页面",
      match: "脚本匹配 url 运行的页面",
      exclude: "脚本匹配 url 不运行的页面",
      connect: "获取网站的访问权限",
      resource: "引入资源文件",
      require: "引入外部 js 文件",
      "require-css": "引入外部 css 文件",
      noframes: "表示脚本不运行在 `<frame>` 中",
      compatible: "用于在 GreasyFork 中显示脚本的兼容性支持",
      "inject-into":
        "脚本注入环境<br>`content`：脚本注入到 content 环境<br>`page`：脚本注入到网页环境（默认）<br>注：SC 不支持以 CSP 判断是否需要脚本注入到 content 环境的 `inject-into: auto` 设计。",
      "early-start":
        "配合 `run-at: document-start` 的声明，使用 `early-start` 可以比网页更快地加载并执行脚本，但存在一定性能问题与 GM API 使用限制。（SC 独有）",
      definition: "ScriptCat 特有功能：一个 `.d.ts` 文件的引用地址，能够自动补全编辑器的提示",
      // https://bbs.tampermonkey.net.cn/thread-3036-1-1.html#%40antifeature%E8%A7%84%E5%88%99
      antifeature: `与脚本市场有关，不受欢迎的功能需要加上此描述值
referral-link：该脚本会修改或重定向到作者的返佣链接
ads：该脚本会在访问的页面上插入广告
payment：该脚本需要付费才能够正常使用
miner：该脚本存在利用用户资源但不为用户产生收益或收益极其微弱的行为
membership：该脚本需要注册会员/关注公众号才能正常使用
tracking：该脚本会追踪你的用户信息`.replace(/\n/g, "<br>"),
      updateURL: "脚本检查更新的 url",
      downloadURL: "脚本更新的下载地址",
      supportURL: "支持站点、bug 反馈页面",
      source: "脚本源码页",
      crontab: `定时脚本 crontab 参考（不适用于云端脚本）
* * * * * * 每秒运行一次
* * * * * 每分钟运行一次
0 */6 * * * 每 6 小时的 0 分执行一次
15 */6 * * * 每 6 小时的 15 分执行一次
* once * * * 每小时运行一次
* * once * * 每天运行一次
* 10 once * * 每天 10:00-10:59 运行一次，若 10:04 已运行，本日 10:05-10:59 不再运行
* 1,3,5 once * * 每天 1/3/5 点运行一次，若 1 点已运行，当天 3、5 点不再运行
* */4 once * * 每隔 4 小时检测并运行一次，若 4 点已运行，当天 8/12/16/20/24 点不再运行
* 10-23 once * * 每天 10:00-23:59 运行一次，若 10:04 已运行，当日 10:05-23:59 不再运行
* once 13 * * 每个月 13 号的每小时运行一次`.replace(/\n/g, "<br>"),
    },
  },

  "en-US": {
    title: "English",
    thisIsAUserScript: "A user script",
    undefinedPrompt: "Undefined Prompt",
    quickfix: "Fix {0} Issue",
    addEslintDisableNextLine: "Add eslint-disable-next-line Comment",
    addEslintDisable: "Add eslint-disable Comment",
    prompt: {
      name: "Script name",
      namespace: "Script namespace",
      copyright: "Script copyright information",
      license: "Script open-source license",
      version: "Script version",
      description: "Script description",
      icon: "Script icon",
      iconURL: "Script icon",
      defaulticon: "Script icon",
      icon64: "64x64 script icon",
      icon64URL: "64x64 script icon",
      grant: "Request special script API permissions",
      author: "Script author",
      "run-at":
        "When the script runs<br>`document-start`: inject as early as possible after URL match<br>`document-end`: inject after DOM has loaded (images etc. may still load)<br>`document-idle`: inject after all content has finished loading<br>`document-body`: inject only when a body element exists",
      "run-in": "Environment in which the script is injected",
      homepage: "Script homepage",
      homepageURL: "Script homepage",
      website: "Script homepage",
      background: "Background script",
      include: "Pages whose URLs match and run this script",
      match: "Pages whose URLs match and run this script",
      exclude: "Pages whose URLs match and do NOT run this script",
      connect: "Sites the script can access",
      resource: "Imported resource files",
      require: "Imported external JS files",
      "require-css": "Imported external CSS files",
      noframes: "Do not run the script inside `<frame>`",
      compatible: "Compatibility information shown on GreasyFork",
      "inject-into":
        "Script injection context<br>`content`: inject into content context<br>`page`: inject into page context (default)<br>Note: SC does not support `inject-into: auto`, which chooses context based on CSP.",
      "early-start":
        "Used with `run-at: document-start`. `early-start` lets the script execute even earlier than the page, but may affect performance and limit GM APIs. (SC only)",
      definition: "ScriptCat-only: URL of a `.d.ts` file used for editor auto-completion",
      antifeature: "For script markets: describe any unwanted or controversial features",
      updateURL: "URL used to check for script updates",
      downloadURL: "URL used to download script updates",
      supportURL: "Support site / bug report page",
      source: "Script source code page",
      crontab: `Scheduled script crontab examples (not for cloud scripts)
* * * * * * Run every second
* * * * * Run every minute
0 */6 * * * Run once at minute 0 every 6 hours
15 */6 * * * Run once at minute 15 every 6 hours
* once * * * Run once every hour
* * once * * Run once every day
* 10 once * * Run once between 10:00-10:59 each day; if it runs at 10:04, it won't run again that day between 10:05-10:59
* 1,3,5 once * * Run once at 1:00, 3:00, 5:00 each day; if it runs at 1:00, it won't run again at 3:00 or 5:00
* */4 once * * Check and run once every 4 hours; if it runs at 4:00, it won't run again that day at 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Run once between 10:00-23:59 each day; if it runs at 10:04, it won't run again that day between 10:05-23:59
* once 13 * * Run once every hour on the 13th day of each month`.replace(/\n/g, "<br>"),
    },
  },

  "zh-TW": {
    title: "繁體中文",
    thisIsAUserScript: "一個使用者腳本",
    undefinedPrompt: "未定義的提示符",
    quickfix: "修復 {0} 問題",
    addEslintDisableNextLine: "新增 eslint-disable-next-line 註解",
    addEslintDisable: "新增 eslint-disable 註解",
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
      definition: "ScriptCat 特有功能：一個 `.d.ts` 檔案的引用網址，可啟用編輯器自動提示",
      antifeature: "與腳本市場相關，不受歡迎的功能需要在此描述",
      updateURL: "腳本檢查更新的 url",
      downloadURL: "腳本更新的下載網址",
      supportURL: "支援站點、錯誤回報頁面",
      source: "腳本原始碼頁面",
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
* once 13 * * 每月 13 號的每小時執行一次`.replace(/\n/g, "<br>"),
    },
  },

  "ja-JP": {
    title: "日本語",
    thisIsAUserScript: "ユーザースクリプト",
    undefinedPrompt: "未定義のプロンプト",
    quickfix: "{0} の問題を修正",
    addEslintDisableNextLine: "eslint-disable-next-line コメントを追加",
    addEslintDisable: "eslint-disable コメントを追加",
    prompt: {
      name: "スクリプト名",
      namespace: "スクリプトの名前空間",
      copyright: "スクリプトの著作権情報",
      license: "スクリプトのライセンス",
      version: "スクリプトのバージョン",
      description: "スクリプトの説明",
      icon: "スクリプトのアイコン",
      iconURL: "スクリプトのアイコン",
      defaulticon: "スクリプトのアイコン",
      icon64: "64x64 サイズのスクリプトアイコン",
      icon64URL: "64x64 サイズのスクリプトアイコン",
      grant: "スクリプトが要求する特別な API 権限",
      author: "スクリプトの作者",
      "run-at":
        "スクリプトの実行タイミング<br>`document-start`：URL がマッチした直後、できるだけ早くスクリプトを注入<br>`document-end`：DOM 読み込み完了後に注入（画像などは読み込み中の可能性あり）<br>`document-idle`：ページ内のすべての読み込み完了後に注入<br>`document-body`：body 要素が存在する場合のみ注入",
      "run-in": "スクリプトを注入するコンテキスト",
      homepage: "スクリプトのホームページ",
      homepageURL: "スクリプトのホームページ",
      website: "スクリプトのホームページ",
      background: "バックグラウンドスクリプト",
      include: "スクリプトを実行する URL パターン",
      match: "スクリプトを実行する URL パターン",
      exclude: "スクリプトを実行しない URL パターン",
      connect: "アクセス権を要求するサイト",
      resource: "読み込むリソースファイル",
      require: "読み込む外部 JS ファイル",
      "require-css": "読み込む外部 CSS ファイル",
      noframes: "スクリプトを `<frame>` 内では実行しない",
      compatible: "GreasyFork に表示される互換性情報",
      "inject-into":
        "スクリプトの注入コンテキスト<br>`content`：コンテンツスクリプト環境に注入<br>`page`：ページコンテキストに注入（既定）<br>注：SC は CSP に基づき自動でコンテキストを切り替える `inject-into: auto` には対応していません。",
      "early-start":
        "`run-at: document-start` と併用します。`early-start` を指定するとページよりも早くスクリプトを実行できますが、パフォーマンスへの影響や GM API の制限が発生する場合があります（SC 独自機能）。",
      definition: "ScriptCat 専用機能：`.d.ts` ファイルの URL。エディタの補完を有効にします。",
      antifeature: "スクリプトマーケット向け：好まれない機能がある場合、ここに説明を記載します。",
      updateURL: "スクリプト更新を確認する URL",
      downloadURL: "スクリプト更新をダウンロードする URL",
      supportURL: "サポートサイト・バグ報告ページ",
      source: "スクリプトのソースコードページ",
      crontab: `スケジュールスクリプトの crontab 例（クラウドスクリプトには非対応）
* * * * * * 毎秒実行
* * * * * 毎分実行
0 */6 * * * 6 時間ごとに 0 分に 1 回実行
15 */6 * * * 6 時間ごとに 15 分に 1 回実行
* once * * * 毎時 1 回実行
* * once * * 毎日 1 回実行
* 10 once * * 毎日 10:00-10:59 の間に 1 回実行。10:04 に実行された場合、その日は 10:05-10:59 に再実行されません
* 1,3,5 once * * 毎日 1/3/5 時に 1 回実行。1 時に実行された場合、その日は 3 時と 5 時に再実行されません
* */4 once * * 4 時間ごとに確認して 1 回実行。4 時に実行された場合、その日は 8/12/16/20/24 時に再実行されません
* 10-23 once * * 毎日 10:00-23:59 の間に 1 回実行。10:04 に実行された場合、その日は 10:05-23:59 に再実行されません
* once 13 * * 毎月 13 日の各時間帯で 1 回実行`.replace(/\n/g, "<br>"),
    },
  },

  "de-DE": {
    title: "Deutsch",
    thisIsAUserScript: "Ein Benutzerskript",
    undefinedPrompt: "Undefinierter Prompt",
    quickfix: "${0}-Problem beheben",
    addEslintDisableNextLine: "eslint-disable-next-line Kommentar hinzufügen",
    addEslintDisable: "eslint-disable Kommentar hinzufügen",
    prompt: {
      name: "Skriptname",
      namespace: "Skript-Namensraum",
      copyright: "Urheberrechtsinformationen des Skripts",
      license: "Open-Source-Lizenz des Skripts",
      version: "Skriptversion",
      description: "Skriptbeschreibung",
      icon: "Skript-Symbol",
      iconURL: "Skript-Symbol",
      defaulticon: "Skript-Symbol",
      icon64: "64x64 Skript-Symbol",
      icon64URL: "64x64 Skript-Symbol",
      grant: "Angeforderte spezielle API-Berechtigungen",
      author: "Skriptautor",
      "run-at":
        "Zeitpunkt der Skriptausführung<br>`document-start`: so früh wie möglich nach URL-Match injizieren<br>`document-end`: nach dem Laden des DOM injizieren (Bilder usw. können noch laden)<br>`document-idle`: nach vollständigem Laden aller Inhalte injizieren<br>`document-body`: nur injizieren, wenn ein body-Element vorhanden ist",
      "run-in": "Kontext, in den das Skript injiziert wird",
      homepage: "Skript-Homepage",
      homepageURL: "Skript-Homepage",
      website: "Skript-Homepage",
      background: "Hintergrundskript",
      include: "Seiten-URLs, auf denen das Skript ausgeführt wird",
      match: "Seiten-URLs, auf denen das Skript ausgeführt wird",
      exclude: "Seiten-URLs, auf denen das Skript nicht ausgeführt wird",
      connect: "Websites, auf die das Skript zugreifen darf",
      resource: "Zu ladende Ressourcendateien",
      require: "Zu ladende externe JS-Dateien",
      "require-css": "Zu ladende externe CSS-Dateien",
      noframes: "Skript nicht innerhalb von `<frame>` ausführen",
      compatible: "Kompatibilitätsinformationen für GreasyFork",
      "inject-into":
        "Skript-Injektionskontext<br>`content`: in den Content-Kontext injizieren<br>`page`: in den Seitenkontext injizieren (Standard)<br>Hinweis: SC unterstützt `inject-into: auto` nicht, bei dem der Kontext über CSP gewählt wird.",
      "early-start":
        "Wird mit `run-at: document-start` verwendet. `early-start` lässt das Skript noch vor der Seite laufen, kann aber die Leistung beeinträchtigen und GM-APIs einschränken. (Nur in SC)",
      definition: "Nur für ScriptCat: URL zu einer `.d.ts`-Datei für Editor-Autovervollständigung",
      antifeature: "Für Script-Marktplätze: hier unerwünschte oder kontroverse Funktionen beschreiben",
      updateURL: "URL zur Aktualisierungsprüfung des Skripts",
      downloadURL: "URL zum Herunterladen von Skriptaktualisierungen",
      supportURL: "Support-Seite / Bugtracker",
      source: "Quellcode-Seite des Skripts",
      crontab: `Beispiele für geplante Skripte (crontab, nicht für Cloud-Skripte)
* * * * * * Jede Sekunde ausführen
* * * * * Jede Minute ausführen
0 */6 * * * Alle 6 Stunden zur Minute 0 ausführen
15 */6 * * * Alle 6 Stunden zur Minute 15 ausführen
* once * * * Einmal pro Stunde ausführen
* * once * * Einmal pro Tag ausführen
* 10 once * * Einmal täglich zwischen 10:00-10:59; wenn um 10:04 ausgeführt, an diesem Tag nicht erneut zwischen 10:05-10:59
* 1,3,5 once * * Einmal täglich um 1:00, 3:00, 5:00; wenn um 1:00 ausgeführt, an diesem Tag nicht erneut um 3:00 oder 5:00
* */4 once * * Alle 4 Stunden prüfen und einmal ausführen; wenn um 4:00 ausgeführt, an diesem Tag nicht erneut um 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Einmal täglich zwischen 10:00-23:59; wenn um 10:04 ausgeführt, an diesem Tag nicht erneut zwischen 10:05-23:59
* once 13 * * Einmal stündlich am 13. Tag jedes Monats ausführen`.replace(/\n/g, "<br>"),
    },
  },

  "vi-VN": {
    title: "Tiếng Việt",
    thisIsAUserScript: "Một user script",
    undefinedPrompt: "Prompt chưa được định nghĩa",
    quickfix: "Sửa lỗi ${0}",
    addEslintDisableNextLine: "Thêm chú thích eslint-disable-next-line",
    addEslintDisable: "Thêm chú thích eslint-disable",
    prompt: {
      name: "Tên script",
      namespace: "Namespace của script",
      copyright: "Thông tin bản quyền của script",
      license: "Giấy phép mã nguồn mở của script",
      version: "Phiên bản script",
      description: "Mô tả script",
      icon: "Biểu tượng script",
      iconURL: "Biểu tượng script",
      defaulticon: "Biểu tượng script",
      icon64: "Biểu tượng script kích thước 64x64",
      icon64URL: "Biểu tượng script kích thước 64x64",
      grant: "Quyền API đặc biệt mà script yêu cầu",
      author: "Tác giả script",
      "run-at":
        "Thời điểm chạy script<br>`document-start`: chèn script sớm nhất có thể sau khi khớp URL<br>`document-end`: chèn sau khi DOM tải xong (ảnh v.v. có thể vẫn đang tải)<br>`document-idle`: chèn sau khi toàn bộ nội dung đã tải xong<br>`document-body`: chỉ chèn khi trang có phần tử body",
      "run-in": "Ngữ cảnh mà script được chèn vào",
      homepage: "Trang chủ script",
      homepageURL: "Trang chủ script",
      website: "Trang chủ script",
      background: "Script nền (background)",
      include: "Trang có URL khớp và chạy script",
      match: "Trang có URL khớp và chạy script",
      exclude: "Trang có URL khớp nhưng KHÔNG chạy script",
      connect: "Trang web mà script được phép truy cập",
      resource: "Tệp tài nguyên được import",
      require: "Tệp JS bên ngoài được import",
      "require-css": "Tệp CSS bên ngoài được import",
      noframes: "Không chạy script bên trong `<frame>`",
      compatible: "Thông tin tương thích hiển thị trên GreasyFork",
      "inject-into":
        "Ngữ cảnh chèn script<br>`content`: chèn vào ngữ cảnh content<br>`page`: chèn vào ngữ cảnh trang (mặc định)<br>Lưu ý: SC không hỗ trợ `inject-into: auto`, lựa chọn ngữ cảnh dựa trên CSP.",
      "early-start":
        "Dùng cùng với `run-at: document-start`. `early-start` cho phép script chạy sớm hơn cả trang, nhưng có thể gây ảnh hưởng hiệu năng và giới hạn một số GM API. (Chỉ có trong SC)",
      definition: "Tính năng riêng của ScriptCat: URL tới tệp `.d.ts` giúp bật gợi ý tự động trong trình soạn thảo",
      antifeature: "Dùng cho chợ script: mô tả các tính năng không được người dùng ưa thích",
      updateURL: "URL dùng để kiểm tra cập nhật script",
      downloadURL: "URL tải về bản cập nhật script",
      supportURL: "Trang hỗ trợ / báo lỗi",
      source: "Trang mã nguồn script",
      crontab: `Ví dụ crontab cho script chạy định kỳ (không áp dụng cho script trên cloud)
* * * * * * Chạy mỗi giây
* * * * * Chạy mỗi phút
0 */6 * * * Chạy 1 lần vào phút 0 mỗi 6 giờ
15 */6 * * * Chạy 1 lần vào phút 15 mỗi 6 giờ
* once * * * Chạy 1 lần mỗi giờ
* * once * * Chạy 1 lần mỗi ngày
* 10 once * * Chạy 1 lần mỗi ngày trong khoảng 10:00-10:59; nếu chạy lúc 10:04 thì hôm đó không chạy lại trong 10:05-10:59
* 1,3,5 once * * Chạy 1 lần lúc 1:00, 3:00, 5:00 mỗi ngày; nếu chạy lúc 1:00 thì hôm đó không chạy lại lúc 3:00 hoặc 5:00
* */4 once * * Kiểm tra và chạy 1 lần mỗi 4 giờ; nếu chạy lúc 4:00 thì hôm đó không chạy lại lúc 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Chạy 1 lần mỗi ngày trong khoảng 10:00-23:59; nếu chạy lúc 10:04 thì hôm đó không chạy lại trong 10:05-23:59
* once 13 * * Chạy 1 lần mỗi giờ vào ngày 13 hằng tháng`.replace(/\n/g, "<br>"),
    },
  },

  "ru-RU": {
    title: "Русский",
    thisIsAUserScript: "Пользовательский скрипт",
    undefinedPrompt: "Неопределённый промпт",
    quickfix: "Исправить проблему {0}",
    addEslintDisableNextLine: "Добавить комментарий eslint-disable-next-line",
    addEslintDisable: "Добавить комментарий eslint-disable",
    prompt: {
      name: "Имя скрипта",
      namespace: "Пространство имён скрипта",
      copyright: "Информация об авторских правах скрипта",
      license: "Лицензия с открытым исходным кодом",
      version: "Версия скрипта",
      description: "Описание скрипта",
      icon: "Иконка скрипта",
      iconURL: "Иконка скрипта",
      defaulticon: "Иконка скрипта",
      icon64: "Иконка скрипта 64x64",
      icon64URL: "Иконка скрипта 64x64",
      grant: "Запрашиваемые специальные права доступа к API",
      author: "Автор скрипта",
      "run-at":
        "Момент запуска скрипта<br>`document-start`: внедрить как можно раньше после совпадения URL<br>`document-end`: внедрить после загрузки DOM (изображения и др. могут ещё загружаться)<br>`document-idle`: внедрить после полной загрузки содержимого<br>`document-body`: внедрить только если на странице есть элемент body",
      "run-in": "Контекст, в который внедряется скрипт",
      homepage: "Домашняя страница скрипта",
      homepageURL: "Домашняя страница скрипта",
      website: "Домашняя страница скрипта",
      background: "Фоновый скрипт",
      include: "Страницы, на которых скрипт выполняется (совпадение URL)",
      match: "Страницы, на которых скрипт выполняется (совпадение URL)",
      exclude: "Страницы, на которых скрипт НЕ выполняется (совпадение URL)",
      connect: "Сайты, к которым скрипт может обращаться",
      resource: "Подключаемые ресурсные файлы",
      require: "Подключаемые внешние JS-файлы",
      "require-css": "Подключаемые внешние CSS-файлы",
      noframes: "Не запускать скрипт внутри `<frame>`",
      compatible: "Информация о совместимости, отображаемая на GreasyFork",
      "inject-into":
        "Контекст внедрения скрипта<br>`content`: внедрить в контекст content<br>`page`: внедрить в контекст страницы (по умолчанию)<br>Примечание: SC не поддерживает `inject-into: auto`, когда контекст выбирается по CSP.",
      "early-start":
        "Используется совместно с `run-at: document-start`. `early-start` позволяет выполнять скрипт раньше загрузки страницы, но может ухудшать производительность и ограничивать некоторые GM API. (Только в SC)",
      definition: "Особенность ScriptCat: URL файла `.d.ts`, используемого для автодополнения в редакторе",
      antifeature: "Для маркетплейсов скриптов: опишите здесь нежелательные / спорные функции",
      updateURL: "URL для проверки обновлений скрипта",
      downloadURL: "URL для загрузки обновлений скрипта",
      supportURL: "Страница поддержки / отчёта об ошибках",
      source: "Страница с исходным кодом скрипта",
      crontab: `Примеры crontab для планового запуска скриптов (не для облачных скриптов)
* * * * * * Запуск каждую секунду
* * * * * Запуск каждую минуту
0 */6 * * * Запуск раз в 6 часов в 00 минут
15 */6 * * * Запуск раз в 6 часов в 15 минут
* once * * * Запуск раз в час
* * once * * Запуск раз в день
* 10 once * * Запуск раз в день между 10:00-10:59; если выполнен в 10:04, в этот день не запустится снова между 10:05-10:59
* 1,3,5 once * * Запуск раз в день в 1:00, 3:00, 5:00; если выполнен в 1:00, в этот день не запустится в 3:00 и 5:00
* */4 once * * Проверка и запуск раз в 4 часа; если выполнен в 4:00, в этот день не запустится в 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Запуск раз в день между 10:00-23:59; если выполнен в 10:04, в этот день не запустится снова между 10:05-23:59
* once 13 * * Запуск каждый час в течение 13-го числа месяца`.replace(/\n/g, "<br>"),
    },
  },
} as const;

type LangCode = keyof typeof langs;
type Prompt = (typeof langs)["zh-CN"]["prompt"];
type LangEntry = (typeof langs)["zh-CN"];

export default function registerEditor() {
  window.MonacoEnvironment = {
    getWorkerUrl(moduleId: any, label: any) {
      if (label === "typescript" || label === "javascript") {
        return "/src/ts.worker.js";
      }
      return "/src/editor.worker.js";
    },
  };
  function asLangEntry<T extends keyof typeof langs>(key: T) {
    return langs[key] as LangEntry;
  }
  let multiLang = asLangEntry("en-US");
  const updateLang = (lang: string) => {
    lang = (lang || "") as LangCode | "";
    const key = (lang && (lang in langs ? lang : "en-US")) || ("en-US" as LangCode);
    multiLang = asLangEntry(key as LangCode);
  };
  langPromise.then((res) => {
    updateLang(res);
  });

  messageQueue.subscribe(SystemConfigChange, ({ key, value }: TKeyValue) => {
    if (key === "language") {
      updateLang(value);
    }
  });

  const META_LINE = /\/\/[ \t]*@(\S+)[ \t]*(.*)$/;
  languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      return new Promise((resolve) => {
        const line = model.getLineContent(position.lineNumber);
        const m = META_LINE.exec(line);
        if (m) {
          const key = m[1] as keyof Prompt;
          const prompt = multiLang.prompt;
          resolve({
            contents: [
              {
                value: prompt[key] || multiLang.undefinedPrompt,
                supportHtml: true,
              },
            ],
          });
        } else if (/==UserScript==/.test(line)) {
          // 匹配==UserScript==
          resolve({
            contents: [{ value: multiLang.thisIsAUserScript }],
          });
        } else {
          resolve(null);
        }
      });
    },
  });

  // 处理quick fix
  languages.registerCodeActionProvider("javascript", {
    provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
      const actions: languages.CodeAction[] = [];
      const eslintFix = <Map<string, any>>globalCache.get("eslint-fix");
      for (let i = 0; i < context.markers.length; i += 1) {
        // 判断有没有修复方案
        const val = context.markers[i];
        const code = typeof val.code === "string" ? val.code : val.code!.value;
        const fix = eslintFix.get(
          `${code}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`
        );
        if (fix) {
          const edit: languages.IWorkspaceTextEdit = {
            resource: model.uri,
            textEdit: {
              range: fix.range,
              text: fix.text,
            },
            versionId: undefined,
          };
          actions.push(<languages.CodeAction>{
            title: multiLang.quickfix.replace("{0}", `${code}`),
            diagnostics: [val],
            kind: "quickfix",
            edit: {
              edits: [edit],
            },
            isPreferred: true,
          });
        }
        // 添加eslint-disable-next-line和eslint-disable
        actions.push(<languages.CodeAction>{
          title: multiLang.addEslintDisableNextLine,
          diagnostics: [val],
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: val.startLineNumber,
                    endLineNumber: val.startLineNumber,
                    startColumn: 1,
                    endColumn: 1,
                  },
                  text: `// eslint-disable-next-line ${typeof val.code === "string" ? val.code : val.code!.value}\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        });
        actions.push(<languages.CodeAction>{
          title: multiLang.addEslintDisable,
          diagnostics: [val],
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: 1,
                    endLineNumber: 1,
                    startColumn: 1,
                    endColumn: 1,
                  },
                  text: `/* eslint-disable ${typeof val.code === "string" ? val.code : val.code!.value} */\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        });
      }

      // const actions = context.markers.map((error) => {
      //   const edit: languages.IWorkspaceTextEdit = {
      //     resource: model.uri,
      //     textEdit: {
      //       range,
      //       text: "console.log(1)",
      //     },
      //     versionId: undefined,
      //   };
      //   return <languages.CodeAction>{
      //     title: ``,
      //     diagnostics: [error],
      //     kind: "quickfix",
      //     edit: {
      //       edits: [edit],
      //     },
      //     isPreferred: true,
      //   };
      // });
      return {
        actions,
        dispose: () => {},
      };
    },
  });

  Promise.all([systemConfig.getEditorConfig(), systemConfig.getEditorTypeDefinition()]).then(
    ([editorConfig, typeDefinition]) => {
      // 设置编辑器设置
      const options = JSON.parse(editorConfig) as languages.typescript.CompilerOptions;
      languages.typescript.javascriptDefaults.setCompilerOptions({
        allowNonTsExtensions: true,
        ...options,
      });
      // 注册类型定义
      languages.typescript.javascriptDefaults.addExtraLib(typeDefinition, "scriptcat.d.ts");
    }
  );
}

export class LinterWorker {
  static hook = new EventEmitter<string, any>();

  static sendLinterMessage(data: unknown) {
    linterWorker.postMessage(data);
  }
}

linterWorker.onmessage = (event) => {
  LinterWorker.hook.emit("message", event.data);
};
