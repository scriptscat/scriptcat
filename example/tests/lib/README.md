# sctest — example/tests 共用测试框架

零依赖、零构建的单文件测试框架，供 `example/tests/`
下的用户脚本共用。每条结果都遵循同一份诊断协议，可同时被人类、DevTools、`GM_log` 和 E2E 读取。

## 引入

```js
// @require https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@3c3ded1030b21182c1bdbfa20544bb8bf202f3a1/example/tests/lib/sctest.js
```

E2E 运行时会把该框架 URL 重写到本地 mock server（见 `e2e/gm-api.spec.ts` 的
`patchRequireCode`），因此框架本身始终使用当前工作区版本；脚本声明的其他 `@require` / `@resource`
依赖仍按各自 URL 加载。

## 用法

```js
const { describe, check, note, itManual, run } = SCTest.create({ name: "GM API 同步" });

describe("GM 存储 API", () => {
  check(
    "GM 存储 API",
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
    "GM 存储 API",
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
`PASS`；异常也会记录到结果，而不是静默吞掉。`expected`、`actual`、`detail` 以及失败/异常说明都可传值、同步函数或
Promise-returning 函数。`options` 支持：

- `onFail: "WARN"`：predicate 为假时记为 `WARN`；
- `onError: "WARN"`：predicate 抛异常时记为 `WARN`；
- `failDetail`：只在 predicate 返回 `false` 时显示的说明；
- `errorDetail`：只在 predicate 抛异常时显示的说明；
- `required: false`：把结果标为非必需观察项，仍保留原始状态和诊断字段。

如果旧式用例没有传 `expected`、`actual` 或 `detail`，框架会记录用例内部每个 `expect`
matcher 的预期/实际值，并根据用例名称生成说明；没有内部 matcher 的用例则明确显示“执行不抛出异常”或 predicate 的布尔结果。这样迁移不会因为保留旧断言体而丢失诊断信息，也不会把环境观察误写成自动通过。

`note(category, name, expected, actual, detail)` 只登记一条 `INFO` 观察记录，不伪造自动断言。

页面脚本默认使用 `framePolicy: "top"`，只在顶层 frame 显示面板；iframe 仍会输出 Console、`GM_log`（如已授权）和 JSON marker，避免同一页面出现多个遮挡面板。需要在每个 frame 独立检查时可显式使用
`SCTest.create({ framePolicy: "all", ... })` 或 `createReportSession({ framePolicy: "all", ... })`。

访问可能不存在、被权限拦截或跨 realm 的宿主对象时，优先使用共享的安全探针：

```js
const { safe, read, UNAVAILABLE, formatValue } = SCTest;
const value = read(() => unsafeWindow.someOptionalApi);
check(
  "宿主能力",
  "可选 API 可读",
  () => value !== UNAVAILABLE,
  "可读取的 API",
  formatValue(value),
  "读取失败时保留不可用状态，不把异常伪装成通过",
  { onFail: "WARN", onError: "WARN", required: false }
);
```

`safe(fn)` 返回 `{ ok, value }` 或 `{ ok: false, error }`，`read(fn)` 在异常时返回稳定的
`UNAVAILABLE` 哨兵。`formatValue` 可安全显示 realm、函数、循环引用和不可用值；它适合放进 `actual` 或 `detail`，避免诊断
代码自身因读取异常中断。

建议把 `category` 写成能力或行为分组，把 `name` 写成可独立判断的断言，把 `expected` 和 `actual` 写成同一维度的值，再用
`detail` 说明为什么检查以及失败后如何解释。旧脚本传入的 `"自动断言"` 会自动归入当前 `describe`
名称，避免诊断表中出现没有语义的分类。

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

需要保留专用操作面板的脚本可使用 `SCTest.createReportSession()`；将 reporter 设为 `"panel"`
可在保留操作 UI 的同时显示统一诊断面板：

```js
const report = SCTest.createReportSession({ name: "GM_download", reporter: "panel" });
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
| Panel    | `page` 运行上下文                   | Shadow DOM 深色诊断表，宿主 id `sctest-panel-host`                      |
| Log      | `background` / `crontab` 运行上下文 | `GM_log` 逐条输出，落到「运行日志」页                                   |

Console 的机器可读行以 `[SCTEST_RESULT] ` 开头，后面是 `protocol: "sctest/v1"` 的 JSON。summary 包含
`counts.PASS`、`counts.FAIL`、`counts.WARN`、`counts.INFO`、`counts.SKIP`、`counts.MANUAL`，以及每条用例的
`category`、`status`、`expected`、`actual`、`detail`、`required` 和 `manualVerdict`。E2E 只以 `FAIL` 判定自动失败；
`WARN`、`INFO`、`SKIP` 和尚未裁决的 `MANUAL` 必须保留并展示。

Panel 保留原有
`sctest-panel-host`、CSP 防护、拖动、折叠、重跑和参数选择器，并提供标题栏总体状态、状态 chips、expected/actual/detail 诊断列、分类分组、状态筛选、搜索、复制文本和复制 JSON。失败、警告和待人工结果默认展开诊断；通过、信息和跳过结果默认收起，但可用每行的展开按钮查看。搜索会覆盖分类、名称、expected、actual、detail、error 和操作提示；没有命中时会给出清除筛选入口。复制优先使用 Clipboard API，失败时回退到 textarea，并在按钮上显示“已复制”或“复制失败”。
面板提示按 FAIL → WARN → INFO/SKIP → MANUAL 给出阅读顺序；MANUAL 使用独立的琥珀色状态和人工确认按钮，确认后同步更新面板、Console、`GM_log` 和 JSON。early-start 脚本应使用
`{ reporter: "console" }`，避免 document-start 的 DOM 断言被面板初始化改变。
JSON marker 与面板导出会安全处理不可用值、realm 对象、函数、`BigInt` 和循环引用，不让诊断输出反过来遮蔽原始结果。

每份 summary 的 `environment` 记录 `tool`、协议版本、生成时间、运行上下文，并在可读取时附上页面 URL 与脚本管理器版本。
Console 末尾的 `[SCTEST_RESULT] ` marker 是唯一稳定的机器读取入口；其前面的逐条文本与 `console.table` 供 DevTools 人类排查。

后台脚本若要使用 `GM_log`，必须声明 `@grant GM_log`；Console reporter 不依赖该权限。
