# sctest — example/tests 共用测试框架

零依赖、零构建的单文件测试框架,供 `example/tests/` 下的用户脚本共用。

## 引入

```js
// @require https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
```

e2e 运行时该 URL 会被自动重写到本地 mock server(见 `e2e/gm-api.spec.ts` 的 `patchRequireCode`),
因此 CI 无需外网,且测的永远是工作区版本。

## 用法

```js
const { describe, it, itManual, expect, run } = SCTest.create({ name: "GM API 同步" });

describe("GM 存储 API", () => {
  it("GM_setValue 写入字符串", () => {
    GM_setValue("k", "v");
    expect(GM_getValue("k")).toBe("v");
  });

  it("支持异步用例", async () => {
    const value = await GM.getValue("k");
    expect(value).toBe("v");
  });
});

// 有副作用的组:默认不自动跑,点面板「运行全部」才启动
describe("GM_download", { auto: false, params: { prefix: "sc-test-" } }, () => {
  it("下载文件", async () => { /* ... */ });
});

// 需要人工操作的用例
describe("GM_registerMenuCommand", () => {
  itManual("点击「测试命令 A」后弹出提示", { hint: "打开扩展图标 → 脚本菜单 → 点击「测试命令 A」" });
});

run();
```

## 断言

统一 `expect(actual).matcher(expected)`,**实际值在前**。

| matcher | 说明 |
|---|---|
| `toBe(expected)` | `!==` 严格比较 |
| `toEqual(expected)` | 结构化递归深比较(键顺序不敏感;区分 NaN/null、undefined 键) |
| `toBeTruthy()` | 真值 |
| `toBeTypeOf(type)` | `typeof` 比较 |
| `toMatch(pattern)` | 正则或子串 |
| `toThrow(pattern?)` | 被测目标须为函数;可选校验异常消息 |

## 主动跳过

条件不满足时用 `SCTest.skip(reason)` 从用例体内退出,记为跳过而非失败,原因会出现在
控制台、面板与 `GM_log` 里:

```js
it("需要浏览器原生下载", async () => {
  const v = await awaitVerdict();
  if (v.verdict === "skip") SCTest.skip(`${v.reason} (未落盘)`);
  expect(v.ok).toBeTruthy();
});
```

不要靠约定错误消息前缀来表达跳过 —— 消息碰巧同名的真实错误会被一并吞掉。

## 展示通道

三个 reporter 可叠加,由 `SCTest.create({ reporter })` 控制,默认 `"auto"`:

| reporter | auto 模式下的启用条件 | 说明 |
|---|---|---|
| Console | **恒定开启** | 全量输出,末尾三行汇总是 e2e 的解析契约,勿改格式 |
| Panel | 运行上下文为 `page` | Shadow DOM 浮层面板,宿主 id `sctest-panel-host` |
| Log | 运行上下文为 `background` / `crontab` | `GM_log` + 结构化 label,落到「运行日志」页 |

运行上下文由 `GM_info.scriptMetaStr` 里的 `@background` / `@crontab` 判定 —— 后台脚本跑在 offscreen
文档里,`document` 是存在的,所以不能用 `typeof document === "undefined"` 判断。

用 `GM_log` 通道时脚本必须 `@grant GM_log`,否则日志会静默丢弃(Console 通道不受影响)。
