const grantValuePrompts = {
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

export default {
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
  grantValuePrompts,
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
} as const;
