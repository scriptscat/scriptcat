const grantValuePrompts = {
  none: "특별한 GM API 권한을 요청하지 않으며, 스크립트는 일반 페이지 스크립트에 가깝게 동작합니다.",
  unsafeWindow: "페이지 자체의 window 객체에 접근하여 네이티브 페이지 스크립트와 상호작용합니다.",
  GM_getValue: "스크립트의 영구 저장소에서 값 하나를 읽습니다.",
  GM_getValues: "스크립트의 영구 저장소에서 여러 값을 읽습니다.",
  GM_setValue: "스크립트의 영구 저장소에 값 하나를 씁니다.",
  GM_setValues: "스크립트의 영구 저장소에 여러 값을 씁니다.",
  GM_deleteValue: "스크립트의 영구 저장소에서 값 하나를 삭제합니다.",
  GM_deleteValues: "스크립트의 영구 저장소에서 여러 값을 삭제합니다.",
  GM_listValues: "스크립트의 영구 저장소에 있는 모든 키를 나열합니다.",
  GM_addValueChangeListener: "스크립트 저장 값의 변경을 감지합니다.",
  GM_removeValueChangeListener: "스크립트 저장 값 변경 리스너를 제거합니다.",
  GM_xmlhttpRequest: "교차 출처(cross-origin) 네트워크 요청을 보냅니다. 대상 호스트는 보통 @connect로 허용해야 합니다.",
  GM_download:
    "파일을 다운로드합니다. URL과 파일명을 전달하거나 url, name, headers, saveAs 등의 필드를 가진 상세 객체를 전달할 수 있으며, 중단(abort) 가능한 핸들을 반환합니다.",
  GM_openInTab: "새 탭을 열며, 전면/백그라운드로 열기 등의 옵션을 사용할 수 있습니다.",
  GM_closeInTab: "스크립트가 열었거나 관리하는 탭을 닫습니다.",
  GM_getTab: "현재 탭과 연결된 임시 데이터를 읽습니다.",
  GM_saveTab: "현재 탭과 연결된 임시 데이터를 저장합니다.",
  GM_getTabs: "스크립트가 저장한 모든 탭의 임시 데이터를 읽습니다.",
  GM_notification: "브라우저 알림을 표시하고 클릭, 닫기 등의 이벤트를 처리합니다.",
  GM_closeNotification: "지정한 스크립트 알림을 닫습니다.",
  GM_updateNotification: "지정한 스크립트 알림을 업데이트합니다.",
  GM_setClipboard: "시스템 클립보드에 씁니다.",
  GM_registerMenuCommand: "스크립트 메뉴 명령을 등록합니다.",
  GM_unregisterMenuCommand: "스크립트 메뉴 명령의 등록을 해제합니다.",
  CAT_registerMenuInput: "ScriptCat API: 입력 필드가 있는 스크립트 메뉴 명령을 등록합니다.",
  CAT_unregisterMenuInput: "ScriptCat API: 입력 필드가 있는 스크립트 메뉴 명령의 등록을 해제합니다.",
  GM_addStyle: "페이지에 CSS를 삽입합니다.",
  GM_addElement: "페이지에 요소를 생성하여 삽입합니다.",
  GM_getResourceText: "@resource로 선언된 리소스의 텍스트 내용을 읽습니다.",
  GM_getResourceURL: "@resource로 선언된 리소스의 URL을 가져옵니다.",
  GM_cookie: "쿠키를 읽거나 쓰거나 삭제하기 위해 Cookie API에 접근합니다.",
  GM_audio: "현재 브라우저 탭의 음소거 및 오디오 재생 상태를 제어하고 감시합니다.",
  CAT_fetchBlob: "ScriptCat 내부 API: 확장 프로그램 측에서 접근 가능한 리소스를 읽어 Blob으로 반환합니다.",
  CAT_fileStorage: "ScriptCat API: 스크립트 파일 저장소에 접근합니다.",
  CAT_userConfig: "ScriptCat API: 스크립트 사용자 설정에 접근합니다.",
  CAT_scriptLoaded: "ScriptCat API: @early-start 시나리오에서 스크립트가 완전히 로드될 때까지 기다립니다.",
  "window.close": "스크립트가 window.close()를 호출할 수 있도록 허용합니다.",
  "window.focus": "스크립트가 window.focus()를 호출할 수 있도록 허용합니다.",
  "window.onurlchange": "스크립트가 URL 변경 이벤트를 감지할 수 있도록 허용합니다.",
} as const;

export default {
  title: "한국어",
  thisIsAUserScript: "유저스크립트",
  undefinedPrompt: "정의되지 않은 프롬프트",
  quickfix: "{0} 문제 수정",
  addEslintDisableNextLine: "eslint-disable-next-line 주석 추가",
  addEslintDisable: "eslint-disable 주석 추가",
  declareGlobal: "'{0}'을(를) 전역 변수로 선언 (/* global */)",
  removeConnectWildcard: "@connect 와일드카드 제거: {0}",
  replaceMatchTldWildcardWithInclude: "@match 최상위 도메인 와일드카드를 @include {0}으로 바꾸기",
  replaceIncludeWithMatch: "@include를 @match {0}으로 바꾸기",
  grantConflict: "@grant none은 GM API와 함께 사용할 수 없습니다. none 또는 모든 GM API를 제거하세요.",
  grantValuePrompts,
  prompt: {
    name: "스크립트 이름",
    namespace: "스크립트 네임스페이스",
    copyright: "스크립트의 저작권 정보",
    license: "스크립트의 오픈소스 라이선스",
    version: "스크립트 버전",
    description: "스크립트 설명",
    icon: "스크립트 아이콘",
    iconURL: "스크립트 아이콘",
    defaulticon: "스크립트 아이콘",
    icon64: "64x64 크기의 스크립트 아이콘",
    icon64URL: "64x64 크기의 스크립트 아이콘",
    grant: "스크립트가 요청하는 특수 API 권한",
    author: "스크립트 작성자",
    "run-at":
      "스크립트 실행 시점<br>`document-start`: URL이 일치한 직후 가능한 한 빨리 스크립트를 주입<br>`document-end`: DOM 로딩이 끝난 후 주입 (이미지 등은 아직 로딩 중일 수 있음)<br>`document-idle`: 모든 콘텐츠 로딩이 끝난 후 주입<br>`document-body`: body 요소가 존재할 때만 주입",
    "run-in": "스크립트가 주입되는 환경",
    homepage: "스크립트 홈페이지",
    homepageURL: "스크립트 홈페이지",
    website: "스크립트 홈페이지",
    background: "백그라운드 스크립트",
    include: "스크립트가 실행되는 URL 패턴",
    match: "스크립트가 실행되는 URL 패턴",
    exclude: "스크립트가 실행되지 않는 URL 패턴",
    connect: "스크립트가 접근할 수 있는 사이트",
    resource: "가져올 리소스 파일",
    require: "가져올 외부 JS 파일",
    "require-css": "가져올 외부 CSS 파일",
    noframes: "스크립트를 `<frame>` 내부에서 실행하지 않음",
    compatible: "GreasyFork에 표시되는 호환성 정보",
    "inject-into":
      "스크립트 주입 환경<br>`content`: content 환경에 주입<br>`page`: 페이지 환경에 주입 (기본값)<br>참고: SC는 CSP를 기준으로 컨텍스트를 자동 선택하는 `inject-into: auto`를 지원하지 않습니다.",
    "early-start":
      "`run-at: document-start`와 함께 사용합니다. `early-start`를 사용하면 페이지보다 먼저 스크립트를 로드하고 실행할 수 있지만, 성능 문제와 GM API 사용 제한이 있을 수 있습니다. (SC 전용)",
    unwrap:
      "유저스크립트를 샌드박스로 감싸지 않고 페이지의 네이티브 전역 스코프에 직접 주입하여 실행합니다.<br>스크립트는 페이지의 실제 전역 변수에 직접 접근하고 수정할 수 있지만, GM.* 등 유저스크립트 전용 API는 사용할 수 없습니다.<br>페이지의 네이티브 스크립트와 깊이 상호작용해야 하거나 일반 페이지 스크립트에서 마이그레이션하는 경우에 주로 사용됩니다.",
    definition: "ScriptCat 전용 기능: 에디터 자동완성에 사용되는 `.d.ts` 파일의 참조 URL",
    antifeature: `스크립트 마켓과 관련된 항목으로, 환영받지 못하는 기능에는 이 설명 값을 추가해야 합니다
referral-link: 이 스크립트는 작성자의 리퍼럴(추천) 링크로 수정하거나 리디렉션합니다
ads: 이 스크립트는 방문한 페이지에 광고를 삽입합니다
payment: 이 스크립트는 정상적으로 사용하려면 결제가 필요합니다
miner: 이 스크립트는 사용자 자원을 이용하지만 사용자에게 이익이 거의 또는 전혀 없는 채굴 행위를 합니다
membership: 이 스크립트는 정상적으로 사용하려면 회원 가입이 필요합니다
tracking: 이 스크립트는 사용자 정보를 추적합니다`.replace(/\n/g, "<br>"),
    updateURL: "스크립트 업데이트 확인용 URL",
    downloadURL: "스크립트 업데이트 다운로드 URL",
    supportURL: "지원 사이트 / 버그 제보 페이지",
    source: "스크립트 소스 코드 페이지",
    scriptUrl: "구독 스크립트가 참조하는 유저스크립트 URL",
    storageName: "여러 스크립트가 하나의 저장 공간을 공유하도록 하는 스크립트 값 저장소 이름",
    tag: "스크립트 태그, 쉼표 또는 공백으로 구분",
    cloudCat: "스크립트를 CloudCat 클라우드 스크립트 패키지로 내보낼 수 있도록 표시",
    cloudServer: "스크립트가 사용하는 CloudCat 클라우드 서비스",
    exportValue: "클라우드 스크립트로 내보낼 때 함께 내보낼 스크립트 저장 값",
    exportCookie: "클라우드 스크립트로 내보낼 때 함께 내보낼 쿠키",
    crontab: `예약 스크립트 crontab 예시 (클라우드 스크립트에는 적용되지 않음)
* * * * * * 매초 실행
* * * * * 매분 실행
0 */6 * * * 6시간마다 0분에 한 번 실행
15 */6 * * * 6시간마다 15분에 한 번 실행
* once * * * 매시간 한 번 실행
* * once * * 매일 한 번 실행
* 10 once * * 매일 10:00-10:59 사이에 한 번 실행. 10:04에 실행되었다면 그날 10:05-10:59에는 다시 실행되지 않음
* 1,3,5 once * * 매일 1시, 3시, 5시에 한 번 실행. 1시에 실행되었다면 그날 3시, 5시에는 다시 실행되지 않음
* */4 once * * 4시간마다 확인 후 한 번 실행. 4시에 실행되었다면 그날 8시, 12시, 16시, 20시, 24시에는 다시 실행되지 않음
* 10-23 once * * 매일 10:00-23:59 사이에 한 번 실행. 10:04에 실행되었다면 그날 10:05-23:59에는 다시 실행되지 않음
* once 13 * * 매월 13일 매시간 한 번 실행
* once(9-17) * * * 매일 9시부터 17시 사이, 매시간 한 번 실행
0,30 once * * * 매시간 0분 또는 30분 중 먼저 도달한 시점에 한 번 실행, 나머지는 건너뜀
* * once(9-18) * * 매월 9일부터 18일까지, 매일 한 번 실행
* * * * once(1-5) 매주 한 번 실행, 월요일부터 금요일 사이에만`.replace(/\n/g, "<br>"),
  },
} as const;
