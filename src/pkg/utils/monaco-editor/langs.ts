const grantValuePromptsZhCN = {
  none: "不申请特殊 GM API 权限，脚本会以接近普通页面脚本的方式运行。",
  unsafeWindow: "访问页面自身的 window 对象，用于和网页原生脚本交互。",
  GM_getValue: "读取脚本持久化存储中的单个值。",
  GM_getValues: "批量读取脚本持久化存储中的多个值。",
  GM_setValue: "写入脚本持久化存储中的单个值。",
  GM_setValues: "批量写入脚本持久化存储中的多个值。",
  GM_deleteValue: "删除脚本持久化存储中的单个值。",
  GM_deleteValues: "批量删除脚本持久化存储中的多个值。",
  GM_listValues: "列出脚本持久化存储中的所有键名。",
  GM_addValueChangeListener: "监听脚本存储值的变化。",
  GM_removeValueChangeListener: "移除脚本存储值变化监听器。",
  GM_xmlhttpRequest: "发起跨域网络请求；请求目标通常需要配合 @connect 声明允许的域名。",
  GM_download:
    "下载文件。支持传入 URL 和文件名，或传入包含 url、name、headers、saveAs 等字段的详情对象，并返回可 abort 的句柄。",
  GM_openInTab: "打开新标签页，并可控制前后台打开等选项。",
  GM_closeInTab: "关闭由脚本打开或管理的标签页。",
  GM_getTab: "读取当前标签页关联的临时数据。",
  GM_saveTab: "保存当前标签页关联的临时数据。",
  GM_getTabs: "读取脚本保存的所有标签页临时数据。",
  GM_notification: "显示浏览器通知，并可处理点击、关闭等回调。",
  GM_closeNotification: "关闭指定的脚本通知。",
  GM_updateNotification: "更新指定的脚本通知内容。",
  GM_setClipboard: "写入系统剪贴板。",
  GM_registerMenuCommand: "注册脚本菜单命令。",
  GM_unregisterMenuCommand: "取消注册脚本菜单命令。",
  CAT_registerMenuInput: "ScriptCat 扩展 API：注册带输入框的脚本菜单命令。",
  CAT_unregisterMenuInput: "ScriptCat 扩展 API：取消注册带输入框的脚本菜单命令。",
  GM_addStyle: "向页面注入 CSS 样式。",
  GM_addElement: "向页面创建并插入元素。",
  GM_getResourceText: "读取 @resource 声明资源的文本内容。",
  GM_getResourceURL: "获取 @resource 声明资源的 URL。",
  GM_cookie: "访问 Cookie API，用于读取、写入或删除 Cookie。",
  CAT_fetchBlob: "ScriptCat 内部扩展 API：读取扩展侧可访问资源并返回 Blob。",
  CAT_fileStorage: "ScriptCat 扩展 API：访问脚本文件存储能力。",
  CAT_userConfig: "ScriptCat 扩展 API：访问脚本用户配置。",
  CAT_scriptLoaded: "ScriptCat 扩展 API：在 @early-start 场景下等待脚本完整加载完成。",
  "window.close": "允许脚本调用 window.close()。",
  "window.focus": "允许脚本调用 window.focus()。",
  "window.onurlchange": "允许脚本监听 URL 变化事件。",
} as const;

const grantValuePromptsEnUS = {
  none: "Request no special GM API permissions; the script runs more like a regular page script.",
  unsafeWindow: "Access the page's own window object for interaction with native page scripts.",
  GM_getValue: "Read one value from the script's persistent storage.",
  GM_getValues: "Read multiple values from the script's persistent storage.",
  GM_setValue: "Write one value to the script's persistent storage.",
  GM_setValues: "Write multiple values to the script's persistent storage.",
  GM_deleteValue: "Delete one value from the script's persistent storage.",
  GM_deleteValues: "Delete multiple values from the script's persistent storage.",
  GM_listValues: "List all keys in the script's persistent storage.",
  GM_addValueChangeListener: "Listen for changes to script storage values.",
  GM_removeValueChangeListener: "Remove a script storage value change listener.",
  GM_xmlhttpRequest: "Make cross-origin network requests; target hosts usually need to be allowed with @connect.",
  GM_download:
    "Download files. Accepts a URL and filename, or a details object with fields such as url, name, headers, and saveAs, and returns an abortable handle.",
  GM_openInTab: "Open a new tab, with options such as foreground or background opening.",
  GM_closeInTab: "Close a tab opened or managed by the script.",
  GM_getTab: "Read temporary data associated with the current tab.",
  GM_saveTab: "Save temporary data associated with the current tab.",
  GM_getTabs: "Read all temporary tab data saved by the script.",
  GM_notification: "Show a browser notification and handle events such as click or close.",
  GM_closeNotification: "Close a specific script notification.",
  GM_updateNotification: "Update a specific script notification.",
  GM_setClipboard: "Write to the system clipboard.",
  GM_registerMenuCommand: "Register a script menu command.",
  GM_unregisterMenuCommand: "Unregister a script menu command.",
  CAT_registerMenuInput: "ScriptCat API: register a script menu command with an input field.",
  CAT_unregisterMenuInput: "ScriptCat API: unregister a script menu command with an input field.",
  GM_addStyle: "Inject CSS into the page.",
  GM_addElement: "Create and insert an element into the page.",
  GM_getResourceText: "Read the text content of a resource declared with @resource.",
  GM_getResourceURL: "Get the URL of a resource declared with @resource.",
  GM_cookie: "Access the Cookie API to read, write, or delete cookies.",
  CAT_fetchBlob: "ScriptCat internal API: read an extension-side accessible resource and return a Blob.",
  CAT_fileStorage: "ScriptCat API: access script file storage.",
  CAT_userConfig: "ScriptCat API: access script user configuration.",
  CAT_scriptLoaded: "ScriptCat API: wait until the script is fully loaded in @early-start scenarios.",
  "window.close": "Allow the script to call window.close().",
  "window.focus": "Allow the script to call window.focus().",
  "window.onurlchange": "Allow the script to listen for URL change events.",
} as const;

const grantValuePromptsZhTW = {
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
  CAT_fetchBlob: "ScriptCat 內部擴充 API：讀取擴充側可存取資源並回傳 Blob。",
  CAT_fileStorage: "ScriptCat 擴充 API：存取腳本檔案儲存能力。",
  CAT_userConfig: "ScriptCat 擴充 API：存取腳本使用者設定。",
  CAT_scriptLoaded: "ScriptCat 擴充 API：在 @early-start 場景下等待腳本完整載入完成。",
  "window.close": "允許腳本呼叫 window.close()。",
  "window.focus": "允許腳本呼叫 window.focus()。",
  "window.onurlchange": "允許腳本監聽 URL 變化事件。",
} as const;

const grantValuePromptsJaJP = {
  none: "特別な GM API 権限を要求せず、通常のページスクリプトに近い形で実行します。",
  unsafeWindow: "ページ自身の window オブジェクトにアクセスし、ページのネイティブスクリプトと連携します。",
  GM_getValue: "スクリプトの永続ストレージから 1 つの値を読み取ります。",
  GM_getValues: "スクリプトの永続ストレージから複数の値をまとめて読み取ります。",
  GM_setValue: "スクリプトの永続ストレージに 1 つの値を書き込みます。",
  GM_setValues: "スクリプトの永続ストレージに複数の値をまとめて書き込みます。",
  GM_deleteValue: "スクリプトの永続ストレージから 1 つの値を削除します。",
  GM_deleteValues: "スクリプトの永続ストレージから複数の値をまとめて削除します。",
  GM_listValues: "スクリプトの永続ストレージ内のすべてのキーを列挙します。",
  GM_addValueChangeListener: "スクリプトのストレージ値の変更を監視します。",
  GM_removeValueChangeListener: "ストレージ値変更リスナーを削除します。",
  GM_xmlhttpRequest:
    "クロスオリジンのネットワークリクエストを行います。対象ホストは通常 @connect で許可する必要があります。",
  GM_download:
    "ファイルをダウンロードします。URL とファイル名、または url、name、headers、saveAs などを含む詳細オブジェクトを受け取り、abort 可能なハンドルを返します。",
  GM_openInTab: "新しいタブを開き、前面または背面で開くなどのオプションを指定できます。",
  GM_closeInTab: "スクリプトが開いた、または管理しているタブを閉じます。",
  GM_getTab: "現在のタブに関連付けられた一時データを読み取ります。",
  GM_saveTab: "現在のタブに関連付けられた一時データを保存します。",
  GM_getTabs: "スクリプトが保存したすべてのタブ一時データを読み取ります。",
  GM_notification: "ブラウザー通知を表示し、クリックや閉じる操作などを処理できます。",
  GM_closeNotification: "指定したスクリプト通知を閉じます。",
  GM_updateNotification: "指定したスクリプト通知を更新します。",
  GM_setClipboard: "システムクリップボードへ書き込みます。",
  GM_registerMenuCommand: "スクリプトメニューコマンドを登録します。",
  GM_unregisterMenuCommand: "スクリプトメニューコマンドの登録を解除します。",
  CAT_registerMenuInput: "ScriptCat API: 入力欄付きのスクリプトメニューコマンドを登録します。",
  CAT_unregisterMenuInput: "ScriptCat API: 入力欄付きのスクリプトメニューコマンドの登録を解除します。",
  GM_addStyle: "ページに CSS スタイルを注入します。",
  GM_addElement: "ページに要素を作成して挿入します。",
  GM_getResourceText: "@resource で宣言されたリソースのテキスト内容を読み取ります。",
  GM_getResourceURL: "@resource で宣言されたリソースの URL を取得します。",
  GM_cookie: "Cookie API にアクセスし、Cookie の読み取り、書き込み、削除を行います。",
  CAT_fetchBlob: "ScriptCat 内部 API: 拡張機能側でアクセス可能なリソースを読み取り Blob を返します。",
  CAT_fileStorage: "ScriptCat API: スクリプトのファイルストレージへアクセスします。",
  CAT_userConfig: "ScriptCat API: スクリプトのユーザー設定へアクセスします。",
  CAT_scriptLoaded: "ScriptCat API: @early-start の場面でスクリプトが完全に読み込まれるまで待機します。",
  "window.close": "スクリプトによる window.close() の呼び出しを許可します。",
  "window.focus": "スクリプトによる window.focus() の呼び出しを許可します。",
  "window.onurlchange": "スクリプトによる URL 変更イベントの監視を許可します。",
} as const;

const grantValuePromptsDeDE = {
  none: "Fordert keine speziellen GM-API-Berechtigungen an; das Skript läuft eher wie ein normales Seitenskript.",
  unsafeWindow: "Greift auf das window-Objekt der Seite zu, um mit nativen Seitenskripten zu interagieren.",
  GM_getValue: "Liest einen Wert aus dem persistenten Skriptspeicher.",
  GM_getValues: "Liest mehrere Werte aus dem persistenten Skriptspeicher.",
  GM_setValue: "Schreibt einen Wert in den persistenten Skriptspeicher.",
  GM_setValues: "Schreibt mehrere Werte in den persistenten Skriptspeicher.",
  GM_deleteValue: "Löscht einen Wert aus dem persistenten Skriptspeicher.",
  GM_deleteValues: "Löscht mehrere Werte aus dem persistenten Skriptspeicher.",
  GM_listValues: "Listet alle Schlüssel im persistenten Skriptspeicher auf.",
  GM_addValueChangeListener: "Überwacht Änderungen an Skriptspeicherwerten.",
  GM_removeValueChangeListener: "Entfernt einen Listener für Änderungen an Skriptspeicherwerten.",
  GM_xmlhttpRequest:
    "Führt Cross-Origin-Netzwerkanfragen aus; Zielhosts müssen normalerweise mit @connect erlaubt werden.",
  GM_download:
    "Lädt Dateien herunter. Akzeptiert URL und Dateiname oder ein Detailobjekt mit Feldern wie url, name, headers und saveAs und gibt ein abbrechbares Handle zurück.",
  GM_openInTab: "Öffnet einen neuen Tab mit Optionen wie Öffnen im Vorder- oder Hintergrund.",
  GM_closeInTab: "Schließt einen vom Skript geöffneten oder verwalteten Tab.",
  GM_getTab: "Liest temporäre Daten, die dem aktuellen Tab zugeordnet sind.",
  GM_saveTab: "Speichert temporäre Daten, die dem aktuellen Tab zugeordnet sind.",
  GM_getTabs: "Liest alle vom Skript gespeicherten temporären Tabdaten.",
  GM_notification: "Zeigt eine Browserbenachrichtigung an und verarbeitet Ereignisse wie Klick oder Schließen.",
  GM_closeNotification: "Schließt eine bestimmte Skriptbenachrichtigung.",
  GM_updateNotification: "Aktualisiert eine bestimmte Skriptbenachrichtigung.",
  GM_setClipboard: "Schreibt in die Systemzwischenablage.",
  GM_registerMenuCommand: "Registriert einen Skript-Menübefehl.",
  GM_unregisterMenuCommand: "Hebt die Registrierung eines Skript-Menübefehls auf.",
  CAT_registerMenuInput: "ScriptCat-API: Registriert einen Skript-Menübefehl mit Eingabefeld.",
  CAT_unregisterMenuInput: "ScriptCat-API: Hebt die Registrierung eines Skript-Menübefehls mit Eingabefeld auf.",
  GM_addStyle: "Injiziert CSS-Stile in die Seite.",
  GM_addElement: "Erstellt ein Element und fügt es in die Seite ein.",
  GM_getResourceText: "Liest den Textinhalt einer mit @resource deklarierten Ressource.",
  GM_getResourceURL: "Ruft die URL einer mit @resource deklarierten Ressource ab.",
  GM_cookie: "Greift auf die Cookie-API zu, um Cookies zu lesen, zu schreiben oder zu löschen.",
  CAT_fetchBlob:
    "Interne ScriptCat-API: Liest eine erweiterungsseitig verfügbare Ressource und gibt einen Blob zurück.",
  CAT_fileStorage: "ScriptCat-API: Zugriff auf den Dateispeicher des Skripts.",
  CAT_userConfig: "ScriptCat-API: Zugriff auf die Benutzerkonfiguration des Skripts.",
  CAT_scriptLoaded: "ScriptCat-API: Wartet in @early-start-Szenarien, bis das Skript vollständig geladen ist.",
  "window.close": "Erlaubt dem Skript, window.close() aufzurufen.",
  "window.focus": "Erlaubt dem Skript, window.focus() aufzurufen.",
  "window.onurlchange": "Erlaubt dem Skript, URL-Änderungsereignisse zu überwachen.",
} as const;

const grantValuePromptsViVN = {
  none: "Không yêu cầu quyền GM API đặc biệt; script chạy gần giống script trang thông thường.",
  unsafeWindow: "Truy cập đối tượng window thật của trang để tương tác với script gốc của trang.",
  GM_getValue: "Đọc một giá trị từ bộ nhớ lưu trữ bền vững của script.",
  GM_getValues: "Đọc nhiều giá trị từ bộ nhớ lưu trữ bền vững của script.",
  GM_setValue: "Ghi một giá trị vào bộ nhớ lưu trữ bền vững của script.",
  GM_setValues: "Ghi nhiều giá trị vào bộ nhớ lưu trữ bền vững của script.",
  GM_deleteValue: "Xóa một giá trị khỏi bộ nhớ lưu trữ bền vững của script.",
  GM_deleteValues: "Xóa nhiều giá trị khỏi bộ nhớ lưu trữ bền vững của script.",
  GM_listValues: "Liệt kê tất cả khóa trong bộ nhớ lưu trữ bền vững của script.",
  GM_addValueChangeListener: "Theo dõi thay đổi của giá trị trong bộ nhớ script.",
  GM_removeValueChangeListener: "Gỡ bộ lắng nghe thay đổi giá trị trong bộ nhớ script.",
  GM_xmlhttpRequest: "Gửi yêu cầu mạng cross-origin; host đích thường cần được cho phép bằng @connect.",
  GM_download:
    "Tải tệp xuống. Nhận URL và tên tệp, hoặc đối tượng chi tiết có các trường như url, name, headers, saveAs, và trả về handle có thể abort.",
  GM_openInTab: "Mở tab mới, có thể chọn mở ở nền hoặc phía trước.",
  GM_closeInTab: "Đóng tab do script mở hoặc quản lý.",
  GM_getTab: "Đọc dữ liệu tạm thời gắn với tab hiện tại.",
  GM_saveTab: "Lưu dữ liệu tạm thời gắn với tab hiện tại.",
  GM_getTabs: "Đọc tất cả dữ liệu tab tạm thời mà script đã lưu.",
  GM_notification: "Hiển thị thông báo trình duyệt và xử lý các sự kiện như nhấp hoặc đóng.",
  GM_closeNotification: "Đóng một thông báo script cụ thể.",
  GM_updateNotification: "Cập nhật một thông báo script cụ thể.",
  GM_setClipboard: "Ghi vào clipboard hệ thống.",
  GM_registerMenuCommand: "Đăng ký lệnh menu của script.",
  GM_unregisterMenuCommand: "Hủy đăng ký lệnh menu của script.",
  CAT_registerMenuInput: "API ScriptCat: đăng ký lệnh menu script có ô nhập.",
  CAT_unregisterMenuInput: "API ScriptCat: hủy đăng ký lệnh menu script có ô nhập.",
  GM_addStyle: "Chèn CSS vào trang.",
  GM_addElement: "Tạo và chèn phần tử vào trang.",
  GM_getResourceText: "Đọc nội dung văn bản của tài nguyên khai báo bằng @resource.",
  GM_getResourceURL: "Lấy URL của tài nguyên khai báo bằng @resource.",
  GM_cookie: "Truy cập Cookie API để đọc, ghi hoặc xóa cookie.",
  CAT_fetchBlob: "API nội bộ ScriptCat: đọc tài nguyên có thể truy cập từ phía tiện ích và trả về Blob.",
  CAT_fileStorage: "API ScriptCat: truy cập bộ nhớ tệp của script.",
  CAT_userConfig: "API ScriptCat: truy cập cấu hình người dùng của script.",
  CAT_scriptLoaded: "API ScriptCat: chờ script tải hoàn tất trong tình huống @early-start.",
  "window.close": "Cho phép script gọi window.close().",
  "window.focus": "Cho phép script gọi window.focus().",
  "window.onurlchange": "Cho phép script lắng nghe sự kiện thay đổi URL.",
} as const;

const grantValuePromptsRuRU = {
  none: "Не запрашивает специальные права GM API; скрипт работает ближе к обычному скрипту страницы.",
  unsafeWindow: "Доступ к собственному объекту window страницы для взаимодействия с нативными скриптами страницы.",
  GM_getValue: "Читает одно значение из постоянного хранилища скрипта.",
  GM_getValues: "Читает несколько значений из постоянного хранилища скрипта.",
  GM_setValue: "Записывает одно значение в постоянное хранилище скрипта.",
  GM_setValues: "Записывает несколько значений в постоянное хранилище скрипта.",
  GM_deleteValue: "Удаляет одно значение из постоянного хранилища скрипта.",
  GM_deleteValues: "Удаляет несколько значений из постоянного хранилища скрипта.",
  GM_listValues: "Перечисляет все ключи в постоянном хранилище скрипта.",
  GM_addValueChangeListener: "Отслеживает изменения значений в хранилище скрипта.",
  GM_removeValueChangeListener: "Удаляет слушатель изменений значений в хранилище скрипта.",
  GM_xmlhttpRequest: "Выполняет cross-origin сетевые запросы; целевые хосты обычно нужно разрешить через @connect.",
  GM_download:
    "Загружает файлы. Принимает URL и имя файла либо объект параметров с полями url, name, headers, saveAs и возвращает дескриптор с abort.",
  GM_openInTab: "Открывает новую вкладку с параметрами, например в фоне или на переднем плане.",
  GM_closeInTab: "Закрывает вкладку, открытую или управляемую скриптом.",
  GM_getTab: "Читает временные данные, связанные с текущей вкладкой.",
  GM_saveTab: "Сохраняет временные данные, связанные с текущей вкладкой.",
  GM_getTabs: "Читает все временные данные вкладок, сохраненные скриптом.",
  GM_notification: "Показывает уведомление браузера и обрабатывает события, например клик или закрытие.",
  GM_closeNotification: "Закрывает указанное уведомление скрипта.",
  GM_updateNotification: "Обновляет указанное уведомление скрипта.",
  GM_setClipboard: "Записывает данные в системный буфер обмена.",
  GM_registerMenuCommand: "Регистрирует команду меню скрипта.",
  GM_unregisterMenuCommand: "Отменяет регистрацию команды меню скрипта.",
  CAT_registerMenuInput: "API ScriptCat: регистрирует команду меню скрипта с полем ввода.",
  CAT_unregisterMenuInput: "API ScriptCat: отменяет регистрацию команды меню скрипта с полем ввода.",
  GM_addStyle: "Внедряет CSS-стили на страницу.",
  GM_addElement: "Создает и вставляет элемент на страницу.",
  GM_getResourceText: "Читает текстовое содержимое ресурса, объявленного через @resource.",
  GM_getResourceURL: "Получает URL ресурса, объявленного через @resource.",
  GM_cookie: "Доступ к Cookie API для чтения, записи или удаления cookie.",
  CAT_fetchBlob: "Внутренний API ScriptCat: читает доступный со стороны расширения ресурс и возвращает Blob.",
  CAT_fileStorage: "API ScriptCat: доступ к файловому хранилищу скрипта.",
  CAT_userConfig: "API ScriptCat: доступ к пользовательской конфигурации скрипта.",
  CAT_scriptLoaded: "API ScriptCat: ожидает полной загрузки скрипта в сценариях @early-start.",
  "window.close": "Разрешает скрипту вызывать window.close().",
  "window.focus": "Разрешает скрипту вызывать window.focus().",
  "window.onurlchange": "Разрешает скрипту слушать события изменения URL.",
} as const;

export const editorLangs = {
  "zh-CN": {
    title: "简体中文",
    thisIsAUserScript: "一个用户脚本",
    undefinedPrompt: "未定义的提示符",
    quickfix: "修复 {0} 问题",
    addEslintDisableNextLine: "添加 eslint-disable-next-line 注释",
    addEslintDisable: "添加 eslint-disable 注释",
    declareGlobal: "将 '{0}' 声明为全局变量 (/* global */)",
    removeConnectWildcard: "移除 @connect 通配符，改为 {0}",
    replaceMatchTldWildcardWithInclude: "将 @match 顶级域名通配符改为 @include {0}",
    replaceIncludeWithMatch: "将 @include 改为 @match {0}",
    grantConflict: "@grant none 不能和 GM API 同时使用；请移除 none 或所有 GM API。",
    grantValuePrompts: grantValuePromptsZhCN,
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
      unwrap:
        "让用户脚本不经过沙箱封装，直接注入并运行在页面的原生全局作用域中。<br>脚本可直接访问和修改页面真实的全局变量，但将无法使用 GM.* 等用户脚本特权 API。<br>常用于需要与页面原生脚本深度交互或从普通页面脚本迁移的场景。",
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
      scriptUrl: "订阅脚本中引用的用户脚本地址",
      storageName: "脚本值存储空间名称，用于让多个脚本共享同一个存储空间",
      tag: "脚本标签，多个标签可用逗号或空格分隔",
      cloudCat: "标记脚本支持导出为 CloudCat 云端脚本包",
      cloudServer: "脚本使用的 CloudCat 云端服务",
      exportValue: "导出为云端脚本时需要导出的脚本存储值",
      exportCookie: "导出为云端脚本时需要导出的 Cookie",
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
* once 13 * * 每个月 13 号的每小时运行一次
* once(9-17) * * * 每天 9 时至 17 时期间，每小时执行一次
0,30 once * * * 每小时在 0 分或 30 分中最早命中的那次执行，本小时不再重复
* * once(9-18) * * 每月 9 号至 18 号期间，每天执行一次
* * * * once(1-5) 每周一至周五期间，每周执行一次`.replace(/\n/g, "<br>"),
    },
  },

  "en-US": {
    title: "English",
    thisIsAUserScript: "A user script",
    undefinedPrompt: "Undefined Prompt",
    quickfix: "Fix {0} Issue",
    addEslintDisableNextLine: "Add eslint-disable-next-line Comment",
    addEslintDisable: "Add eslint-disable Comment",
    declareGlobal: "Declare '{0}' as a global variable (/* global */)",
    removeConnectWildcard: "Remove @connect wildcard: {0}",
    replaceMatchTldWildcardWithInclude: "Replace @match TLD wildcard with @include {0}",
    replaceIncludeWithMatch: "Replace @include with @match {0}",
    grantConflict: "@grant none cannot be used with GM APIs. Remove none or all GM APIs.",
    grantValuePrompts: grantValuePromptsEnUS,
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
      unwrap:
        "Makes the user script bypass sandbox wrapping and be injected and executed directly in the page’s native global scope. <br>The script can directly access and modify the page’s real global variables, but will not be able to use user script privileged APIs such as GM.*. <br>Commonly used in scenarios that require deep interaction with native page scripts or when migrating from regular page scripts.",
      definition: "ScriptCat-only: URL of a `.d.ts` file used for editor auto-completion",
      antifeature: `Related to script markets: unwanted features should include this description value
referral-link: This script modifies or redirects to the author's referral link
ads: This script inserts ads on the pages you visit
payment: This script requires payment to be used properly
miner: This script engages in mining activities
membership: This script requires registration as a member to be used properly
tracking: This script tracks your user information`.replace(/\n/g, "<br>"),
      updateURL: "URL used to check for script updates",
      downloadURL: "URL used to download script updates",
      supportURL: "Support site / bug report page",
      source: "Script source code page",
      scriptUrl: "User script URL referenced by a subscription script",
      storageName: "Script value storage name, used to share one storage area across multiple scripts",
      tag: "Script tags, separated by commas or spaces",
      cloudCat: "Marks the script as exportable to a CloudCat cloud script package",
      cloudServer: "CloudCat cloud service used by the script",
      exportValue: "Script storage values to export when exporting as a cloud script",
      exportCookie: "Cookies to export when exporting as a cloud script",
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
* once 13 * * Run once every hour on the 13th day of each month
* once(9-17) * * * Run once per hour during hours 9 to 17 each day
0,30 once * * * Run once per hour; whichever of minute 0 or 30 comes first, the other is skipped
* * once(9-18) * * Run once per day during the 9th to 18th of each month
* * * * once(1-5) Run once per week; only on weekdays Monday to Friday`.replace(/\n/g, "<br>"),
    },
  },

  "zh-TW": {
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
    grantValuePrompts: grantValuePromptsZhTW,
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
  },

  "ja-JP": {
    title: "日本語",
    thisIsAUserScript: "ユーザースクリプト",
    undefinedPrompt: "未定義のプロンプト",
    quickfix: "{0} の問題を修正",
    addEslintDisableNextLine: "eslint-disable-next-line コメントを追加",
    addEslintDisable: "eslint-disable コメントを追加",
    declareGlobal: "'{0}' をグローバル変数として宣言 (/* global */)",
    removeConnectWildcard: "@connect のワイルドカードを削除: {0}",
    replaceMatchTldWildcardWithInclude: "@match の TLD ワイルドカードを @include {0} に置換",
    replaceIncludeWithMatch: "@include を @match {0} に置換",
    grantConflict: "@grant none は GM API と同時に使えません。none またはすべての GM API を削除してください。",
    grantValuePrompts: grantValuePromptsJaJP,
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
      unwrap:
        "ユーザースクリプトをサンドボックスでラップせず、ページのネイティブなグローバルスコープに直接注入して実行します。<br>スクリプトはページの実際のグローバル変数に直接アクセスおよび変更できますが、GM.* などのユーザースクリプトの特権 API は使用できなくなります。<br>ページのネイティブスクリプトとの深い連携が必要な場合や、通常のページスクリプトから移行する際によく使用されます。",
      definition: "ScriptCat 専用機能：`.d.ts` ファイルの URL。エディタの補完を有効にします。",
      antifeature: `スクリプトマーケットに関連します。好まれない機能にはこの説明値を追加する必要があります
referral-link：このスクリプトは作者のアフィリエイトリンクに変更またはリダイレクトします
ads：このスクリプトはアクセスしたページに広告を挿入します
payment：このスクリプトは正常に使用するために支払いが必要です
miner：このスクリプトにはマイニング動作があります
membership：このスクリプトは正常に使用するためにメンバー登録が必要です
tracking：このスクリプトはユーザー情報を追跡します`.replace(/\n/g, "<br>"),
      updateURL: "スクリプト更新を確認する URL",
      downloadURL: "スクリプト更新をダウンロードする URL",
      supportURL: "サポートサイト・バグ報告ページ",
      source: "スクリプトのソースコードページ",
      scriptUrl: "サブスクリプションスクリプトで参照するユーザースクリプト URL",
      storageName: "複数のスクリプトで同じ保存領域を共有するためのスクリプト値ストレージ名",
      tag: "スクリプトタグ。複数のタグはカンマまたはスペースで区切ります",
      cloudCat: "スクリプトを CloudCat クラウドスクリプトパッケージとしてエクスポート可能にする印",
      cloudServer: "スクリプトが使用する CloudCat クラウドサービス",
      exportValue: "クラウドスクリプトとしてエクスポートする際に出力するスクリプト保存値",
      exportCookie: "クラウドスクリプトとしてエクスポートする際に出力する Cookie",
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
* once 13 * * 毎月 13 日の各時間帯で 1 回実行
* once(9-17) * * * 毎日 9 時〜17 時の間、毎時 1 回実行
0,30 once * * * 毎時 0 分または 30 分のうち最初に命中した方のみ実行、同じ時間内に再実行なし
* * once(9-18) * * 毎月 9 日〜18 日の期間中、毎日 1 回実行
* * * * once(1-5) 毎週月曜〜金曜の期間中、毎週 1 回実行`.replace(/\n/g, "<br>"),
    },
  },

  "de-DE": {
    title: "Deutsch",
    thisIsAUserScript: "Ein Benutzerskript",
    undefinedPrompt: "Undefinierter Prompt",
    quickfix: "{0}-Problem beheben",
    addEslintDisableNextLine: "eslint-disable-next-line Kommentar hinzufügen",
    addEslintDisable: "eslint-disable Kommentar hinzufügen",
    declareGlobal: "'{0}' als globale Variable deklarieren (/* global */)",
    removeConnectWildcard: "@connect-Wildcard entfernen: {0}",
    replaceMatchTldWildcardWithInclude: "@match-TLD-Wildcard durch @include {0} ersetzen",
    replaceIncludeWithMatch: "@include durch @match {0} ersetzen",
    grantConflict:
      "@grant none kann nicht zusammen mit GM-APIs verwendet werden. Entfernen Sie none oder alle GM-APIs.",
    grantValuePrompts: grantValuePromptsDeDE,
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
      unwrap:
        "Ermöglicht es, das Benutzerskript ohne Sandbox-Kapselung direkt in den nativen globalen Gültigkeitsbereich der Seite zu injizieren und auszuführen. <br>Das Skript kann direkt auf die tatsächlichen globalen Variablen der Seite zugreifen und diese verändern, kann jedoch keine privilegierten Benutzerskript-APIs wie GM.* verwenden. <br>Wird häufig in Szenarien eingesetzt, die eine tiefe Interaktion mit nativen Seitenskripten erfordern oder bei der Migration von normalen Seitenskripten.",
      definition: "Nur für ScriptCat: URL zu einer `.d.ts`-Datei für Editor-Autovervollständigung",
      antifeature:
        `Bezieht sich auf Script-Marktplätze: unerwünschte Funktionen sollten diesen Beschreibungswert enthalten
referral-link: Dieses Skript modifiziert oder leitet zu den Affiliate-Links des Autors um
ads: Dieses Skript fügt Werbung auf den von Ihnen besuchten Seiten ein
payment: Dieses Skript erfordert eine Zahlung für die normale Nutzung
miner: Dieses Skript hat Mining-Verhalten
membership: Dieses Skript erfordert eine Mitgliedschaftsregistrierung für die normale Nutzung
tracking: Dieses Skript verfolgt Ihre Benutzerinformationen`.replace(/\n/g, "<br>"),
      updateURL: "URL zur Aktualisierungsprüfung des Skripts",
      downloadURL: "URL zum Herunterladen von Skriptaktualisierungen",
      supportURL: "Support-Seite / Bugtracker",
      source: "Quellcode-Seite des Skripts",
      scriptUrl: "Benutzerskript-URL, die von einem Abonnement-Skript referenziert wird",
      storageName: "Speichername für Skriptwerte, um einen Speicherbereich mit mehreren Skripten zu teilen",
      tag: "Skript-Tags, getrennt durch Kommas oder Leerzeichen",
      cloudCat: "Markiert das Skript als exportierbar in ein CloudCat-Cloud-Skriptpaket",
      cloudServer: "Vom Skript verwendeter CloudCat-Clouddienst",
      exportValue: "Skript-Speicherwerte, die beim Export als Cloud-Skript exportiert werden",
      exportCookie: "Cookies, die beim Export als Cloud-Skript exportiert werden",
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
* once 13 * * Einmal stündlich am 13. Tag jedes Monats ausführen
* once(9-17) * * * Einmal pro Stunde zwischen 9 und 17 Uhr jeden Tag
0,30 once * * * Einmal pro Stunde; Minute 0 oder 30 — der erste Treffer gewinnt, der andere wird übersprungen
* * once(9-18) * * Einmal pro Tag vom 9. bis 18. des Monats
* * * * once(1-5) Einmal pro Woche, nur von Montag bis Freitag`.replace(/\n/g, "<br>"),
    },
  },

  "vi-VN": {
    title: "Tiếng Việt",
    thisIsAUserScript: "Một user script",
    undefinedPrompt: "Prompt chưa được định nghĩa",
    quickfix: "Sửa lỗi {0}",
    addEslintDisableNextLine: "Thêm chú thích eslint-disable-next-line",
    addEslintDisable: "Thêm chú thích eslint-disable",
    declareGlobal: "Khai báo '{0}' là biến toàn cục (/* global */)",
    removeConnectWildcard: "Bỏ ký tự đại diện @connect: {0}",
    replaceMatchTldWildcardWithInclude: "Thay wildcard TLD @match bằng @include {0}",
    replaceIncludeWithMatch: "Thay @include bằng @match {0}",
    grantConflict: "@grant none không thể dùng cùng GM API. Hãy xóa none hoặc tất cả GM API.",
    grantValuePrompts: grantValuePromptsViVN,
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
      unwrap:
        "Cho phép script người dùng bỏ qua sandbox và được chèn, thực thi trực tiếp trong phạm vi toàn cục gốc của trang. <br>Script có thể trực tiếp truy cập và chỉnh sửa các biến toàn cục thực sự của trang, nhưng sẽ không thể sử dụng các API đặc quyền của user script như GM.*. <br>Thường được dùng trong các trường hợp cần tương tác sâu với script gốc của trang hoặc khi chuyển đổi từ script trang thông thường.",
      definition: "Tính năng riêng của ScriptCat: URL tới tệp `.d.ts` giúp bật gợi ý tự động trong trình soạn thảo",
      antifeature: `Liên quan đến chợ script: các tính năng không được ưa thích cần thêm giá trị mô tả này
referral-link: Script này sửa đổi hoặc chuyển hướng đến liên kết giới thiệu của tác giả
ads: Script này chèn quảng cáo vào các trang bạn truy cập
payment: Script này yêu cầu thanh toán để sử dụng đúng cách
miner: Script này tham gia vào các hoạt động đào coin
membership: Script này yêu cầu đăng ký làm thành viên để sử dụng đúng cách
tracking: Script này theo dõi thông tin người dùng của bạn`.replace(/\n/g, "<br>"),
      updateURL: "URL dùng để kiểm tra cập nhật script",
      downloadURL: "URL tải về bản cập nhật script",
      supportURL: "Trang hỗ trợ / báo lỗi",
      source: "Trang mã nguồn script",
      scriptUrl: "URL user script được tham chiếu bởi script đăng ký",
      storageName: "Tên vùng lưu trữ giá trị script, dùng để chia sẻ cùng một vùng lưu trữ giữa nhiều script",
      tag: "Thẻ script, phân tách bằng dấu phẩy hoặc khoảng trắng",
      cloudCat: "Đánh dấu script có thể xuất thành gói cloud script CloudCat",
      cloudServer: "Dịch vụ CloudCat cloud mà script sử dụng",
      exportValue: "Giá trị lưu trữ script cần xuất khi xuất thành cloud script",
      exportCookie: "Cookie cần xuất khi xuất thành cloud script",
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
* once 13 * * Chạy 1 lần mỗi giờ vào ngày 13 hằng tháng
* once(9-17) * * * Mỗi ngày từ 9 giờ đến 17 giờ, chạy 1 lần mỗi giờ
0,30 once * * * Mỗi giờ chạy 1 lần vào phút 0 hoặc 30, lần đầu kích hoạt thắng, lần sau bị bỏ qua
* * once(9-18) * * Từ ngày 9 đến ngày 18 hằng tháng, mỗi ngày chạy 1 lần
* * * * once(1-5) Mỗi tuần chạy 1 lần, chỉ trong các ngày thứ Hai đến thứ Sáu`.replace(/\n/g, "<br>"),
    },
  },

  "ru-RU": {
    title: "Русский",
    thisIsAUserScript: "Пользовательский скрипт",
    undefinedPrompt: "Неопределённый промпт",
    quickfix: "Исправить проблему {0}",
    addEslintDisableNextLine: "Добавить комментарий eslint-disable-next-line",
    addEslintDisable: "Добавить комментарий eslint-disable",
    declareGlobal: "Объявить '{0}' как глобальную переменную (/* global */)",
    removeConnectWildcard: "Удалить wildcard @connect: {0}",
    replaceMatchTldWildcardWithInclude: "Заменить TLD wildcard @match на @include {0}",
    replaceIncludeWithMatch: "Заменить @include на @match {0}",
    grantConflict: "@grant none нельзя использовать вместе с GM API. Удалите none или все GM API.",
    grantValuePrompts: grantValuePromptsRuRU,
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
      unwrap:
        "Позволяет пользовательскому скрипту обходить песочницу и напрямую внедряться и выполняться в нативной глобальной области видимости страницы. <br>Скрипт может напрямую получать доступ к реальным глобальным переменным страницы и изменять их, однако не сможет использовать привилегированные API пользовательских скриптов, такие как GM.*. <br>Обычно используется в сценариях, требующих глубокой интеграции с нативными скриптами страницы или при миграции с обычных скриптов страницы.",
      definition: "Особенность ScriptCat: URL файла `.d.ts`, используемого для автодополнения в редакторе",
      antifeature: `Связано с маркетплейсами скриптов: для нежелательных функций следует добавить это значение описания
referral-link: Этот скрипт изменяет или перенаправляет на реферальную ссылку автора
ads: Этот скрипт вставляет рекламу на посещаемые вами страницы
payment: Этот скрипт требует оплаты для нормального использования
miner: Этот скрипт содержит функции майнинга
membership: Этот скрипт требует регистрации членства для нормального использования
tracking: Этот скрипт отслеживает информацию о пользователе`.replace(/\n/g, "<br>"),
      updateURL: "URL для проверки обновлений скрипта",
      downloadURL: "URL для загрузки обновлений скрипта",
      supportURL: "Страница поддержки / отчёта об ошибках",
      source: "Страница с исходным кодом скрипта",
      scriptUrl: "URL пользовательского скрипта, на который ссылается скрипт подписки",
      storageName:
        "Имя хранилища значений скрипта для совместного использования одного хранилища несколькими скриптами",
      tag: "Теги скрипта, разделённые запятыми или пробелами",
      cloudCat: "Отмечает, что скрипт можно экспортировать в пакет облачного скрипта CloudCat",
      cloudServer: "Облачный сервис CloudCat, используемый скриптом",
      exportValue: "Значения хранилища скрипта для экспорта при экспорте как облачного скрипта",
      exportCookie: "Cookie для экспорта при экспорте как облачного скрипта",
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
* once 13 * * Запуск каждый час в течение 13-го числа месяца
* once(9-17) * * * Каждый день с 9 до 17 часов, запуск раз в час
0,30 once * * * Раз в час в минуту 0 или 30, первое срабатывание побеждает, второе пропускается
* * once(9-18) * * С 9 по 18 число каждого месяца, запуск раз в день
* * * * once(1-5) Раз в неделю, только с понедельника по пятницу`.replace(/\n/g, "<br>"),
    },
  },
} as const;

export type EditorLangCode = keyof typeof editorLangs;
export type EditorLangEntry = (typeof editorLangs)["zh-CN"];

export function asEditorLangEntry<T extends keyof typeof editorLangs>(key: T) {
  return editorLangs[key] as EditorLangEntry;
}
