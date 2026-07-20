# ko-KR 용어 및 UI 문구 가이드

이 문서는 ScriptCat 한국어(`ko-KR`) 인터페이스와 문서에서 사용할 용어와 문체를 정의합니다. 목표는 한국어 사용자에게 자연스럽고 명확한 UI를 제공하면서 ScriptCat의 스크립트 유형, 기능 이름, 개발자 용어를 정확히 구분하는 것입니다.

검토 기준: `src/locales/ko-KR/*.json`, `docs/architecture.md`.

## 원칙

1. 영어 또는 중국어 문장을 단어 단위로 직역하지 말고, 한국어 소프트웨어 UI에서 자연스러운 표현을 사용합니다.
2. `일반 스크립트`, `페이지 스크립트`, `백그라운드 스크립트`, `예약 스크립트`는 서로 다른 제품 개념이므로 임의로 합치지 않습니다.
3. 일반적인 userscript 생태계나 기능은 `유저스크립트`로 표현하고, ScriptCat의 ordinary/normal script 유형은 `일반 스크립트`로 표현합니다.
4. 원문이 모호하거나 다른 locale과 충돌하면 실제 기능, 화면 위치, 주변 문구와 제품 용어를 확인한 뒤 결정합니다.
5. placeholder, HTML/React 태그, URL, 코드 식별자와 `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require` 등의 메타데이터 식별자를 변경하지 않습니다.
6. 기술 용어는 개발자가 알아볼 수 있도록 정확히 유지하되, 일반 사용자용 설명은 이해하기 쉬운 한국어로 작성합니다.
7. 레이블은 짧고 명확하게 쓰고, 설명 문장은 일관된 높임말과 종결 표현을 사용합니다.
8. 중국어 전각 문장 부호(`：`, `，`, `。`)를 한국어 문구에 사용하지 않습니다.

## 분류

| 분류 | 용도 |
| --- | --- |
| **A. 제품 및 기능 용어** | ScriptCat의 기능과 스크립트 유형을 식별하는 이름 |
| **B. UI 작업 및 상태** | 버튼, 메뉴, 레이블, 알림에 사용하는 기본 표현 |
| **C. 문맥에 따라 선택하는 용어** | 기능과 화면에 따라 번역이 달라지는 단어 |
| **D. 유지해야 하는 기술 용어** | API, 메타데이터, 표준 기술 개념 |
| **E. 한국어 문체 및 형식** | 띄어쓰기, placeholder, 문장 부호, 높임말 규칙 |
| **F. 기존 문구 검토 대상** | 현재 번역에서 특히 주의해야 할 혼용 사례 |

## A. 제품 및 기능 용어

| 개념 | 우선 사용 | 예시 key | 설명 |
| --- | --- | --- | --- |
| ScriptCat browser extension | `ScriptCat 확장 프로그램` | `welcome_title`, `ext_update_notification` | 제품명 `ScriptCat`의 대소문자를 유지합니다. |
| generic userscript capability | `유저스크립트` | `script_list_content`, `allow_user_script_guide`, Monaco `thisIsAUserScript` | 생태계, 일반 기능, 호환 형식을 뜻할 때 사용합니다. |
| ordinary/normal ScriptCat script type | `일반 스크립트` | `create_user_script`, `script_list.sidebar.normal_script` | 백그라운드 스크립트 및 예약 스크립트와 구분되는 제품 유형입니다. |
| page script | `페이지 스크립트` | `script_list_enable_content` | 페이지에서 실행되는 개념을 설명할 때 사용합니다. |
| background script | `백그라운드 스크립트` | `create_background_script`, `background_script` | 제품의 백그라운드 실행 유형 및 기능입니다. |
| scheduled script | `예약 스크립트` | `create_scheduled_script`, `scheduled_script` | 제품 유형 이름입니다. `crontab 스크립트`로 부르지 않습니다. |
| cron scheduling syntax | `cron 표현식`, `cron 일정` | `cron_invalid_expr`, `tasks_cron` | 예약 스크립트의 일정 문법을 설명할 때만 사용합니다. |
| script synchronization | `스크립트 동기화` | `script_sync`, `sync_status` | 연결과 동기화를 구분합니다. |
| deletion synchronization | `삭제 동기화` | `sync_delete`, `notification.script_sync_delete` | 자세한 동작은 설명 문구에서 안내합니다. |
| subscription object | `구독` | `subscribe`, `subscribe_url`, `count_subscribes` | 객체와 기능 이름입니다. |
| subscribe action | `구독하기` 또는 문맥에 맞는 `구독 설치` | 설치/작업 버튼 | 명사 `구독`과 동작을 문맥에 맞게 구분합니다. |
| script discovery destination | `스크립트 마켓` / `스크립트 갤러리` | `script_list_title`, `script_gallery` | 실제 링크와 화면의 제품 이름을 따릅니다. 임의로 하나로 합치지 않습니다. |
| AI Agent | `AI 에이전트` | `agent:title` | 일반 UI에서는 한국어 표기를 사용합니다. |
| Skill feature | `스킬` | `skills`, `import_skill` | 일반 문구에서는 `스킬`을 사용하고 `SKILL.md`, `SKILL.cat.md`, `SkillScript`는 그대로 유지합니다. |
| model provider | `모델 제공업체` | `provider_select`, `provider_subtitle` | 기능 페이지 이름이 `모델 서비스`인 경우 해당 이름을 유지할 수 있습니다. |
| script manager | `유저스크립트 관리자` | 확장 프로그램 설명 | 커뮤니티 문맥에서 `매니저`를 사용할 수 있으나 제품 설명은 `관리자`를 우선합니다. |

## B. UI 작업 및 상태

| 개념 | 우선 사용 | 예시 key | 설명 |
| --- | --- | --- | --- |
| create | `만들기` / `새로 만들기` | `create_script`, `create_background_script` | 같은 메뉴 안에서는 한 표현으로 통일합니다. |
| save / save as | `저장` / `다른 이름으로 저장` | `save`, `save_as` | 알림은 `저장되었습니다`처럼 자연스러운 문장으로 씁니다. |
| import / export | `가져오기` / `내보내기` | `import`, `export` | 파일과 데이터 작업에서 일관되게 사용합니다. |
| install / update | `설치` / `업데이트` | `script`, `update_script` | 객체 이름이 필요하면 함께 표시합니다. |
| run / runtime | `실행` / `런타임` 또는 `실행 시간` | `run`, `runtime`, `log_title` | 기술 레이블과 일반 설명의 문맥을 확인합니다. |
| enable / disable | `활성화` / `비활성화` | `enable`, `disable` | 상태는 `활성화됨` / `비활성화됨`을 사용합니다. |
| allow / deny | `허용` / `거부` | `allow_action`, `deny_action` | 권한 결정에 사용합니다. |
| settings | `설정` | `settings`, `script_setting` | 제품 옵션과 사용자 설정에 사용합니다. |
| configuration data | `구성` 또는 문맥에 맞는 `설정` | `skills_config`, `editor_config` | 사용자에게 자연스러운 표현을 선택하고 `컨피그`는 피합니다. |
| connect / sync | `연결` / `동기화` | `connect`, `script_sync` | 서비스 연결과 데이터 동기화를 구분합니다. |
| restore / reset / clear | `복원` / `초기화` / `비우기`·`지우기` | `restore`, `reset`, `clear` | 서로 다른 동작이므로 혼용하지 않습니다. |
| load / reload | `불러오는 중` / `새로고침` | `loading`, `click_to_reload` | 파일 또는 데이터를 가져오는 동작과 import를 구분합니다. |
| delete | `삭제` | `delete`, `delete_success` | 성공 알림은 `삭제되었습니다`를 사용합니다. |
| browser tab | `탭` | `close_current_tab`, `script_run_env.*` | `태그`와 혼동하지 않습니다. |
| directory / folder | `디렉터리` / `폴더` | `open_directory`, `opfs_type_directory` | 개발자 파일 시스템과 일반 폴더 UI를 구분할 수 있습니다. |
| click / tap | `클릭` / 터치 전용일 때 `탭` | 도움말, 펼치기 동작 | 데스크톱 확장 UI에서는 `클릭`을 우선합니다. |

## C. 문맥에 따라 선택하는 용어

| 개념 | 사용할 수 있는 표현 | 선택 기준 | 예시 key |
| --- | --- | --- | --- |
| source | `출처`, `설치 출처`, `구독 출처`, `소스 코드` | origin/provenance는 `출처`, code는 `소스 코드`를 사용합니다. | `source`, `col_source`, `prompt.source` |
| local / cloud | `로컬` / `클라우드` | 데이터 위치, 백업 위치, 동기화 대상을 설명합니다. | `local`, `cloud`, `backup_to` |
| storage | `저장소`, `저장 공간` | 기능 이름과 짧은 레이블은 `저장소`, 공간을 설명하는 문장은 `저장 공간`을 사용할 수 있습니다. | `script_storage`, `storage_error` |
| panel / console | `패널` / `콘솔` | ScriptCat 조작 UI는 `패널`, 개발자 도구 출력은 `콘솔`을 사용합니다. | `background_script_description`, `build_success_message` |
| permission | `권한` | 기능이 수행할 수 있는 능력과 권한 목록에 사용합니다. | `permission`, `permission_management` |
| authorization | `권한 허용`, `권한 부여`, `권한 요청` | 스크립트에 접근을 허용하거나 허용 기간을 정할 때 사용합니다. | `auth_duration`, `confirm_expired_title` |
| authentication | `인증` | 계정, 자격 증명, 로그인 정보 검증에만 사용합니다. | `auth_type`, `account_validation_failed` |
| match / exclude | `일치` / `제외` | 사용자 문구에서는 의미를 설명하고 `@match`, `@exclude` 식별자는 그대로 유지합니다. | `website_match`, `website_exclude` |
| arguments / parameters | `매개변수` | 일반 UI에서 우선 사용합니다. 매우 개발자 중심 문맥에서는 `인수`도 가능합니다. | `chat_tool_arguments` |
| origin | `오리진` | 웹 플랫폼의 security origin을 뜻할 때 사용합니다. 일반적인 출처와 구분합니다. | `opfs_subtitle`, cross-origin copy |
| all tabs | `모든 탭` | 형제 값이 `일반 탭`, `시크릿 탭`인 경우 bare `전체`를 피합니다. | `script_run_env.all` |

## D. 유지해야 하는 기술 용어

| 개념 | 표기 | 예시 key | 설명 |
| --- | --- | --- | --- |
| regular expression | `정규식` / 설명에서는 `정규 표현식` | `search_regex` | 개발자 UI의 짧은 레이블은 `정규식`이 자연스럽습니다. |
| cron expression | `cron 표현식` | `cron_invalid_expr`, `tasks_cron` | 제품 유형 이름인 `예약 스크립트`와 구분합니다. |
| expression | `표현식` | `value_export_expression`, `expression_format_error` | 조건식, 내보내기 식 등 기술 의미를 유지합니다. |
| watch file changes | `파일 감시` / `감시 중지` | `watch_file`, `stop_watch_file` | 지속적인 변경 감지를 뜻합니다. |
| metadata declaration | `선언` | `error_metadata_line_duplicated` | 값이나 일반 항목이 아니라 메타데이터 선언입니다. |
| Storage API | `Storage API` 또는 기존 제품 표기 | `storage_api` | API 이름은 알아볼 수 있게 유지합니다. |
| OPFS | `오리진 전용 파일 시스템(OPFS)` | `opfs_subtitle` | `출처별`로 직역하지 않습니다. |
| CORS | `교차 출처 접근(CORS)` | `permission_cors` | `교차 도메인`보다 정확한 기술 표현을 사용합니다. |
| product/API identifiers | 원문 유지 | ESLint, VSCode, Cookie, GM API, MCP, CloudCat | 이름과 식별자를 번역하거나 철자를 바꾸지 않습니다. |
| metadata identifiers | 원문 유지 | `@match`, `@exclude`, `@grant`, `@connect` | 설명을 붙일 수 있지만 식별자 자체는 변경하지 않습니다. |
| exact filenames/types | 원문 유지 | `SKILL.md`, `SKILL.cat.md`, `SkillScript`, `.d.ts` | 프로그램이 인식하거나 사용자가 검색해야 하는 이름입니다. |

## E. 한국어 문체 및 형식

### 레이블과 문장

- 버튼과 메뉴는 짧은 명사형 또는 동작형으로 씁니다: `저장`, `삭제`, `업데이트 확인`.
- 설명 문장은 `~합니다` 체를 기본으로 사용합니다.
- 사용자 지시는 `~하세요`를 사용합니다.
- 확인 대화상자는 `~하시겠습니까?`를 사용합니다.
- 레이블에는 불필요한 마침표를 붙이지 않고, 완전한 문장에는 문장 부호를 사용합니다.

### placeholder와 조사

- `{{count}}`, `{{name}}`, `{0}`, `$0`, `${dir}`를 그대로 유지합니다.
- 사용자에게 `은(는)`, `이(가)`, `을(를)` 같은 조사 선택 표기를 노출하지 않습니다.
- 조사가 필요 없는 구조로 문장을 바꿉니다.

예:

```text
나쁨: 스크립트 "{{name}}"을(를) 삭제하시겠습니까?
권장: "{{name}}" 스크립트를 삭제하시겠습니까?
```

### 숫자와 단위

- UI 카운터는 `{{count}}개`, `{{count}}초`, `{{count}}줄`처럼 숫자와 단위를 붙여 씁니다.
- 문맥상 객체가 불명확하면 `{{count}}개 항목`, `{{count}}개 스크립트`처럼 대상을 표시합니다.

### 영문 식별자와 띄어쓰기

- 영문 약어와 뒤따르는 일반 명사는 띄어 씁니다: `API 키`, `URL 패턴`, `MCP 서버`.
- 조사와 어미는 자연스럽게 붙입니다: `URL에서`, `ScriptCat이`.
- 메타데이터 식별자와 설명 명사는 띄어 씁니다: `@connect 태그`, `@match 규칙`.
- 정확한 코드, URL, 파일명 내부에는 임의로 공백을 추가하지 않습니다.

### 문장 부호

- 한국어 문구에서 중국어 전각 문장 부호 `：`, `，`, `。`를 사용하지 않습니다.
- 콜론은 `:`, 쉼표는 `,`, 마침표는 `.`를 사용합니다.
- 로딩/진행 표시의 말줄임표는 가능하면 `…`로 통일합니다.
- 같은 화면에서 `...`와 `…`를 혼용하지 않습니다.

## F. 기존 문구 검토 대상

| 대상 | 주의할 문제 | 권장 방향 | 예시 key |
| --- | --- | --- | --- |
| `인증` / 권한 허용 | authorization을 authentication으로 오역할 수 있음 | 권한 결정은 `권한 허용`·`권한 요청`, 계정 검증만 `인증` | `auth_duration`, `loading_confirm` |
| 일반 스크립트 / 유저스크립트 | 제품 유형과 일반 생태계 용어가 섞일 수 있음 | 제품 유형은 `일반 스크립트`, 일반 개념은 `유저스크립트` | `create_user_script`, `thisIsAUserScript` |
| 예약 스크립트 / crontab script | 유형 이름과 문법 이름이 섞일 수 있음 | 유형은 `예약 스크립트`, 문법은 `cron 표현식` | `only_background_scheduled_can_run` |
| `소스` / `출처` | origin과 source code가 혼동될 수 있음 | origin은 `출처`, code는 `소스 코드` | `common:source`, `prompt.source` |
| `Skill` / `스킬` | 동일한 기능 이름이 혼용될 수 있음 | 일반 UI는 `스킬`, 정확한 식별자는 원문 유지 | `import_skill`, `skills_title` |
| 브라우저 탭 | bare `전체`가 무엇을 뜻하는지 불명확할 수 있음 | `모든 탭`, `일반 탭`, `시크릿 탭` | `script_run_env.*` |
| clear / reset | 데이터 비우기와 기본값 초기화가 혼동될 수 있음 | `비우기`·`지우기`와 `초기화`를 구분 | `clear_success`, `reset` |
| cross-origin / CORS | `교차 도메인`은 기술적으로 부정확할 수 있음 | `교차 출처` 사용 | `permission_cors` |
| 특정 브라우저 이름 | 다중 브라우저 기능에 Chrome이 남을 수 있음 | 구현이 특정 브라우저 전용이 아니면 `브라우저` 사용 | `enable_background.description` |
| placeholder 조사 | `을(를)` 같은 기계적 표기가 노출될 수 있음 | 조사가 필요 없는 문장으로 재구성 | `confirm_delete_script_content` |

## AI 및 기여자 체크리스트

한국어 번역을 추가하거나 수정할 때:

1. 대상 locale이 `ko-KR`인지 확인하고 이 문서를 먼저 읽습니다.
2. 영어 원문을 기본 의미로 확인하되, 모호하거나 오래된 문구는 실제 기능과 다른 locale을 함께 확인합니다.
3. `일반 스크립트`, `페이지 스크립트`, `백그라운드 스크립트`, `예약 스크립트`의 구분을 유지합니다.
4. 일반 userscript 개념은 `유저스크립트`, 제품의 normal type은 `일반 스크립트`로 구분합니다.
5. authorization과 authentication을 구분합니다. 권한 허용 문맥에 `인증`을 사용하지 않습니다.
6. `출처`와 `소스 코드`, `복원`과 `초기화`와 `비우기`, `연결`과 `동기화`를 문맥에 맞게 구분합니다.
7. `@match`, `@exclude`, `@grant`, `@connect`, API 이름, 파일명, placeholder를 변경하지 않습니다.
8. `은(는)`, `이(가)`, `을(를)` 표기를 사용자에게 노출하지 않도록 문장을 재구성합니다.
9. 영문 식별자 주변 띄어쓰기와 한국어 문장 부호를 확인합니다.
10. 같은 화면에서 `Skill`/`스킬`, `...`/`…`, `소스`/`출처`가 불필요하게 혼용되지 않는지 검색합니다.
11. 완성 후 실제 UI에서 잘림, 줄바꿈, 숫자 삽입, split-string 연결 문법을 확인합니다.
12. 가능하면 한국어 원어민에게 보안 경고, 권한 요청, 삭제 확인 문구를 최종 검토받습니다.
