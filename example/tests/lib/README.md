# sctest — example/tests 共用测试框架

零依赖、零构建的单文件测试框架，供 `example/tests/`
下的用户脚本共用。每条结果都遵循同一份诊断协议，可同时被人类、DevTools、`GM_log` 和 E2E 读取。

## 引入

```js
// @require https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@762f83e9c1091ab4ebbb605f4efc4709b36f6476/example/tests/lib/sctest.js
```

E2E 运行时会把该框架 URL 重写到本地 mock server（见 `e2e/gm-api.spec.ts` 的
`patchRequireCode`），因此框架本身始终使用当前工作区版本；脚本声明的其他 `@require` / `@resource`
依赖仍按各自 URL 加载。

## 用法

```js
const { describe, check, note, itManual, run } = SCTest.create({ name: "GM API 同步" });

describe("GM 存储 API", () => {
  check(
    "自动断言",
    "GM_setValue 写入字符串",
    () => {
      GM_setValue("k", "v");
      return GM_getValue("k") === "v";
    },
    "v",
    GM_getValue("k"),
    "写入后读取到相同值"
  );

  check(
    "异步断言",
    "GM.getValue 读取字符串",
    async () => (await GM.getValue("k")) === "v",
    "v",
    () => GM.getValue("k"),
    "异步 predicate 返回 true"
  );

  note("运行信息", "当前页面", location.href, location.href, "记录环境，不产生 PASS/FAIL 断言");
});

// 有副作用的组：默认不自动跑，点面板「运行全部」才启动。
describe("GM_download", { auto: false, params: { prefix: "sc-test-" } }, () => {
  check("下载操作", "下载文件", async () => true, "文件已落盘", "待检查", "保留原操作流程");
});

// 需要人工操作的用例保持独立的 MANUAL 状态。
describe("GM_registerMenuCommand", () => {
  itManual("点击测试命令后触发回调", { hint: "打开扩展图标 → 脚本菜单 → 点击测试命令" });
});

run();
```

`check(category, name, predicate, expected, actual, detail, options)` 支持异步 predicate。predicate 显式返回 `false` 为
`FAIL`，其他正常返回值（包括旧断言体常见的 `undefined`）为
`PASS`；异常也会记录到结果，而不是静默吞掉。`expected`、`actual`、`detail` 可传值或在用例执行后求值的函数。`options`
支持：

- `onFail: "WARN"`：predicate 为假时记为 `WARN`；
- `onError: "WARN"`：predicate 抛异常时记为 `WARN`；
- `required: false`：把结果标为非必需观察项，仍保留原始状态和诊断字段。

`note(category, name, expected, actual, detail)` 只登记一条 `INFO` 观察记录，不伪造自动断言。

## 结果状态与兼容入口

统一状态为 `PASS`、`FAIL`、`WARN`、`INFO`、`SKIP`、`MANUAL`。`MANUAL`
是独立的待人工裁决状态：在面板点击「通过」或「失败」后，原记录才会变成对应结果，并同步到 Console、`GM_log`
和 JSON 报告；未确认的人工用例不计入自动通过。

现有脚本可以继续使用：

- `it(name, fn)`：兼容旧断言体，断言抛异常为 `FAIL`，正常返回（包括 `undefined`）为 `PASS`；
- `itManual(name, options)`：登记 `MANUAL`，`options.hint` 会显示操作说明；
- `expect(actual).toBe(...)`、`toEqual(...)`、`toBeTruthy()`、`toBeTypeOf(...)`、`toMatch(...)`、`toThrow(...)`；
- `SCTest.skip(reason)`：从用例内退出并登记 `SKIP`，原因会显示在所有 reporter。

## 自定义运行器

需要保留专用操作面板的脚本可使用 `SCTest.createReportSession()`，不必把下载、菜单或跨 iframe 操作 UI 改写成标准面板：

```js
const report = SCTest.createReportSession({ name: "GM_download", reporter: "console" });
report.start();
const pending = report.manual("人工操作", "确认下载内容", "内容正确", "待检查", "打开文件并核对内容");
// 操作完成后：
report.update(pending, "PASS", { actual: "内容正确", manualVerdict: "PASS" });
report.finish();
```

session 提供 `start()`、`record()`、`update()`、异步 `check()`、`note()`、`skip()`、`manual()`、`finish()` 和
`summary()`。`finish()` 输出与标准 runner 相同的 JSON summary 协议。

## Reporter 与机器可读输出

三个 reporter 可叠加，由 `SCTest.create({ reporter })` 控制，默认是 `"auto"`：

| reporter | 启用条件                            | 说明                                                                    |
| -------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Console  | 恒定开启                            | DevTools 逐条输出状态、expected/actual/detail，末尾输出稳定 JSON marker |
| Panel    | `page` 运行上下文                   | Shadow DOM 浮层面板，宿主 id `sctest-panel-host`                        |
| Log      | `background` / `crontab` 运行上下文 | `GM_log` 逐条输出，落到「运行日志」页                                   |

Console 的机器可读行以 `[SCTEST_RESULT] ` 开头，后面是 `protocol: "sctest/v1"` 的 JSON。summary 包含
`counts.PASS`、`counts.FAIL`、`counts.WARN`、`counts.INFO`、`counts.SKIP`、`counts.MANUAL`，以及每条用例的
`category`、`status`、`expected`、`actual`、`detail`、`required` 和 `manualVerdict`。E2E 只以 `FAIL` 判定自动失败；
`WARN`、`INFO`、`SKIP` 和尚未裁决的 `MANUAL` 必须保留并展示。

Panel 保留原有
`sctest-panel-host`、CSP 防护、拖动、折叠、重跑和参数选择器，并提供状态 chips、分类分组、状态筛选、搜索、复制文本和复制 JSON。early-start 脚本应使用
`{ reporter: "console" }`，避免 document-start 的 DOM 断言被面板初始化改变。

后台脚本若要使用 `GM_log`，必须声明 `@grant GM_log`；Console reporter 不依赖该权限。
