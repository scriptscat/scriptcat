import { beforeEach, describe as vdescribe, expect as vexpect, it as vit, vi } from "vitest";

async function loadSCTest() {
  delete globalThis.SCTest;
  await import("./sctest.js?t=" + Math.random());
  return globalThis.SCTest;
}

vdescribe("sctest 框架内核", () => {
  let SCTest;

  beforeEach(async () => {
    SCTest = await loadSCTest();
  });

  vdescribe("运行上下文检测", () => {
    vit("识别 @crontab 为 crontab", () => {
      const meta = "// ==UserScript==\n// @name x\n// @crontab */15 * * * *\n// ==/UserScript==";
      vexpect(SCTest.__detectContext(meta)).toBe("crontab");
    });

    vit("识别 @background 为 background", () => {
      const meta = "// ==UserScript==\n// @name x\n// @background\n// ==/UserScript==";
      vexpect(SCTest.__detectContext(meta)).toBe("background");
    });

    vit("普通页面脚本为 page", () => {
      const meta = "// ==UserScript==\n// @name x\n// @match *://*/*\n// ==/UserScript==";
      vexpect(SCTest.__detectContext(meta)).toBe("page");
    });

    vit("不把 @backgroundcolor 之类前缀误判为 @background", () => {
      const meta = "// ==UserScript==\n// @backgroundcolor red\n// ==/UserScript==";
      vexpect(SCTest.__detectContext(meta)).toBe("page");
    });
  });

  vdescribe("expect 断言", () => {
    vit("toBe 相等时不抛异常", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(1).toBe(1)).not.toThrow();
    });

    vit("toBe 不等时抛出含期望与实际的错误", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e("b").toBe("a")).toThrowError(/期望 "a".*实际 "b"/);
    });

    vit("toEqual 做深比较", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e({ a: [1, 2] }).toEqual({ a: [1, 2] })).not.toThrow();
      vexpect(() => e({ a: [1, 2] }).toEqual({ a: [2, 1] })).toThrow();
    });

    vit("toEqual 对象键顺序不影响比较结果", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e({ a: 1, b: 2 }).toEqual({ b: 2, a: 1 })).not.toThrow();
    });

    vit("toEqual 用 Object.is 语义,NaN 不等于 null", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(NaN).toEqual(null)).toThrow();
    });

    vit("toEqual 用 Object.is 语义,NaN 等于 NaN", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(NaN).toEqual(NaN)).not.toThrow();
    });

    vit("toEqual 显式 undefined 值的键与缺失键不同", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e({ a: undefined }).toEqual({})).toThrow();
    });

    vit("toEqual 数组按元素与长度比较,且数组不等于普通对象", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e([1, 2]).toEqual([1, 2])).not.toThrow();
      vexpect(() => e([1, 2]).toEqual([1, 2, 3])).toThrow();
      vexpect(() => e([1, 2]).toEqual({ 0: 1, 1: 2 })).toThrow();
    });

    vit("toEqual 正确处理 null 与对象的区分", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(null).toEqual({})).toThrow();
      vexpect(() => e({}).toEqual(null)).toThrow();
      vexpect(() => e(null).toEqual(null)).not.toThrow();
    });

    vit("toEqual 面对循环引用不会栈溢出", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      const a = { name: "x" };
      a.self = a;
      const b = { name: "x" };
      b.self = b;
      vexpect(() => e(a).toEqual(b)).not.toThrow();
    });

    vit("toEqual 失败时抛出的错误带有 expected/actual 字段", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      let caught;
      try {
        e({ a: 1 }).toEqual({ a: 2 });
      } catch (err) {
        caught = err;
      }
      vexpect(caught).toBeTruthy();
      vexpect(caught.name).toBe("AssertionError");
      vexpect(typeof caught.message).toBe("string");
      vexpect(caught.expected).toBe('{"a":2}');
      vexpect(caught.actual).toBe('{"a":1}');
    });

    vit("toBeTruthy 假值抛出异常", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(0).toBeTruthy()).toThrow();
      vexpect(() => e("").toBeTruthy()).toThrow();
      vexpect(() => e(null).toBeTruthy()).toThrow();
      vexpect(() => e(undefined).toBeTruthy()).toThrow();
    });

    vit("toBeTruthy 真值不抛出异常", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(1).toBeTruthy()).not.toThrow();
      vexpect(() => e("x").toBeTruthy()).not.toThrow();
      vexpect(() => e({}).toBeTruthy()).not.toThrow();
    });

    vit("toBeTypeOf 校验 typeof", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e("s").toBeTypeOf("string")).not.toThrow();
      vexpect(() => e("s").toBeTypeOf("number")).toThrow();
    });

    vit("toThrow 要求被测目标是函数并且确实抛异常", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e(() => { throw new Error("boom"); }).toThrow()).not.toThrow();
      vexpect(() => e(() => {}).toThrow()).toThrow();
      vexpect(() => e(() => { throw new Error("boom"); }).toThrow(/boom/)).not.toThrow();
    });

    vit("toMatch 支持正则与子串", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      vexpect(() => e("hello world").toMatch(/world/)).not.toThrow();
      vexpect(() => e("hello world").toMatch("hello")).not.toThrow();
      vexpect(() => e("hello world").toMatch("nope")).toThrow();
    });
  });

  vdescribe("运行核心", () => {
    vit("统计通过/失败/跳过并按 suite 分组", async () => {
      const { describe: d, it: i, itManual: im, expect: e, run } = SCTest.create({
        name: "demo",
        reporter: "console",
      });
      d("组一", () => {
        i("通过用例", () => e(1).toBe(1));
        i("失败用例", () => e(1).toBe(2));
      });
      d("组二", () => {
        i("异步通过", async () => {
          await Promise.resolve();
          e("x").toBe("x");
        });
        im("人工用例", { hint: "点一下" });
      });

      const summary = await run();

      vexpect(summary.total).toBe(4);
      vexpect(summary.passed).toBe(2);
      vexpect(summary.failed).toBe(1);
      vexpect(summary.skipped).toBe(1);
      vexpect(summary.suites.map((s) => s.name)).toEqual(["组一", "组二"]);
      vexpect(summary.suites[0].cases[1].status).toBe("fail");
      vexpect(summary.suites[0].cases[1].error).toMatch(/期望 2/);
      vexpect(summary.suites[1].cases[1].status).toBe("manual");
    });

    vit("一个用例抛异常不影响后续用例执行", async () => {
      const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("组", () => {
        i("炸", () => { throw new Error("boom"); });
        i("仍然跑", () => e(1).toBe(1));
      });
      const summary = await run();
      vexpect(summary.passed).toBe(1);
      vexpect(summary.failed).toBe(1);
    });

    vit("auto:false 的 suite 默认不执行,记为 skip", async () => {
      const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("手动组", { auto: false }, () => {
        i("不该自动跑", () => e(1).toBe(2));
      });
      const summary = await run();
      vexpect(summary.skipped).toBe(1);
      vexpect(summary.failed).toBe(0);
    });
  });

  vdescribe("ConsoleReporter 契约", () => {
    vit("输出三行汇总,格式与 e2e 正则一致", async () => {
      const lines = [];
      const orig = console.log;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      try {
        const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
        d("组", () => {
          i("a", () => e(1).toBe(1));
          i("b", () => e(1).toBe(2));
        });
        await run();
      } finally {
        console.log = orig;
      }
      const text = lines.join("\n");
      vexpect(text).toMatch(/总测试数: 2/);
      vexpect(text).toMatch(/通过: 1/);
      vexpect(text).toMatch(/失败: 1/);
      vexpect(/(通过|Passed)[:：]\s*(\d+)/.exec(text)[2]).toBe("1");
      vexpect(/(失败|Failed)[:：]\s*(\d+)/.exec(text)[2]).toBe("1");
    });

    vit("人工用例携带 hint 时,onCase 输出保留提示内容", async () => {
      const lines = [];
      const orig = console.log;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      try {
        const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "console" });
        d("组", () => {
          im("需要人工点击", { hint: "点一下确认按钮" });
        });
        await run();
      } finally {
        console.log = orig;
      }
      const text = lines.join("\n");
      vexpect(text).toMatch(/○ 需要人工点击 \(待人工确认:点一下确认按钮\)/);
    });

    vit("人工用例没有 hint 时,沿用原有 (待人工确认) 措辞", async () => {
      const lines = [];
      const orig = console.log;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      try {
        const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "console" });
        d("组", () => {
          im("无提示的人工用例");
        });
        await run();
      } finally {
        console.log = orig;
      }
      const text = lines.join("\n");
      vexpect(text).toMatch(/○ 无提示的人工用例 \(待人工确认\)/);
    });
  });

  vdescribe("用例内主动跳过", () => {
    vit("SCTest.skip 让用例记为跳过而不是失败,原因随结果带出", async () => {
      const { describe: d, it: i, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("组", () => {
        i("条件不满足", () => SCTest.skip("没有可用的下载目录"));
      });

      const summary = await run();

      vexpect(summary.skipped).toBe(1);
      vexpect(summary.failed).toBe(0);
      vexpect(summary.suites[0].cases[0].status).toBe("skip");
      vexpect(summary.suites[0].cases[0].error).toBe("没有可用的下载目录");
    });

    vit("跳过不影响同 suite 内后续用例执行", async () => {
      const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("组", () => {
        i("跳过的", () => SCTest.skip("环境不支持"));
        i("仍然跑", () => e(1).toBe(1));
      });

      const summary = await run();

      vexpect(summary.passed).toBe(1);
      vexpect(summary.skipped).toBe(1);
      vexpect(summary.failed).toBe(0);
    });

    // 迁移前的 gm_download_test 靠 message 的 "SKIP:" 前缀区分跳过,真实错误只要碰巧同名就会被吞掉。
    vit("消息以 SKIP: 开头的普通 Error 仍然记为失败", async () => {
      const { describe: d, it: i, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("组", () => {
        i("真炸了", () => {
          throw new Error("SKIP: 这其实是个真实错误");
        });
      });

      const summary = await run();

      vexpect(summary.failed).toBe(1);
      vexpect(summary.skipped).toBe(0);
    });

    vit("ConsoleReporter 打印跳过原因", async () => {
      const lines = [];
      const orig = console.log;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      try {
        const { describe: d, it: i, run } = SCTest.create({ name: "demo", reporter: "console" });
        d("组", () => i("条件不满足", () => SCTest.skip("需要人工先授权")));
        await run();
      } finally {
        console.log = orig;
      }
      vexpect(lines.join("\n")).toMatch(/○ 条件不满足 \(跳过: 需要人工先授权\)/);
    });

    vit("LogReporter 把跳过原因写进日志正文", async () => {
      const logged = [];
      globalThis.GM_log = (msg, level, labels) => logged.push({ msg, level, labels });
      try {
        const reporter = SCTest.__createLogReporter();
        reporter.onCase({ suite: "组", name: "条件不满足", status: "skip", error: "需要人工先授权", durationMs: 0 });
      } finally {
        delete globalThis.GM_log;
      }
      vexpect(logged[0].msg).toMatch(/○ 组 › 条件不满足 — 需要人工先授权/);
      vexpect(logged[0].labels.status).toBe("skip");
    });
  });
});

vdescribe("PanelReporter", () => {
  let SCTest;

  beforeEach(async () => {
    document.body.innerHTML = "";
    SCTest = await loadSCTest();
  });

  vit("page 上下文下会挂载 Shadow DOM 宿主", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("a", () => e(1).toBe(1)));
    await run();

    const host = document.getElementById("sctest-panel-host");
    vexpect(host).not.toBe(null);
    vexpect(host.shadowRoot).not.toBe(null);
  });

  vit("优先用 constructable stylesheet 注入样式,不依赖页面允许 inline style", () => {
    const root = { adoptedStyleSheets: [] };
    const replaceSync = vi.fn();
    const OriginalCSSStyleSheet = globalThis.CSSStyleSheet;
    globalThis.CSSStyleSheet = class {
      replaceSync = replaceSync;
    };
    try {
      SCTest.__installPanelStyles(root, ".panel{position:fixed}");
    } finally {
      globalThis.CSSStyleSheet = OriginalCSSStyleSheet;
    }

    vexpect(replaceSync).toHaveBeenCalledWith(".panel{position:fixed}");
    vexpect(root.adoptedStyleSheets).toHaveLength(1);
  });

  vit("面板头部副标题显示运行上下文,而非空白", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("a", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector(".sc-meta").textContent).toBe("page");
  });

  vit("面板渲染出每条用例与汇总行", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组一", () => {
      i("通过的", () => e(1).toBe(1));
      i("失败的", () => e(1).toBe(2));
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const rows = root.querySelectorAll('[data-sctest="case-row"]');
    vexpect(rows.length).toBe(2);
    vexpect(root.querySelector('[data-sctest="summary-line"]').textContent).toMatch(/通过: 1/);
    vexpect(root.querySelector('[data-sctest="summary-line"]').textContent).toMatch(/失败: 1/);
  });

  vit("失败用例渲染出期望与实际", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("失败的", () => e("b").toBe("a")));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const detail = root.querySelector('[data-sctest="failure-detail"]');
    vexpect(detail.textContent).toMatch(/"a"/);
    vexpect(detail.textContent).toMatch(/"b"/);
  });

  vit("人工用例渲染判定按钮,点击后计入统计", async () => {
    const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => im("点一下菜单", { hint: "打开扩展菜单" }));
    const summary = await run();
    vexpect(summary.skipped).toBe(1);

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    root.querySelector('[data-sctest="manual-pass"]').click();
    vexpect(root.querySelector('[data-sctest="summary-line"]').textContent).toMatch(/通过: 1/);
  });

  vit("跳过用例渲染出跳过原因", async () => {
    const { describe: d, it: i, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("条件不满足", () => SCTest.skip("需要人工先授权")));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="skip-reason"]').textContent).toMatch(/需要人工先授权/);
  });

  vit("auto:false 的 suite 渲染出运行按钮", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false, params: { prefix: "sc-test-" } }, () => i("a", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="run-all"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="param-prefix"]').value).toBe("sc-test-");
  });

  vit("渲染设计稿中的状态、工具栏、参数区与页脚结构", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("自动组", () => i("通过", () => e(1).toBe(1)));
    d("手动组", { auto: false, params: { prefix: "sc-test-" } }, () => i("待跑", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    [
      "status-pill",
      "duration",
      "total-chip",
      "run-all",
      "reset",
      "queue-chip",
      "filter-all",
      "filter-fail",
      "filter-skip",
      "search",
      "copy-report",
      "collapse-all",
      "params",
      "footer",
      "export-json",
    ].forEach((slot) => vexpect(root.querySelector(`[data-sctest="${slot}"]`), slot).not.toBe(null));
    vexpect(root.querySelector('[data-sctest="footer"] [data-icon="clipboard-copy"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="export-json"] [data-icon="braces"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="params"] [data-icon="sliders-horizontal"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="search"] [data-icon="search"]')).not.toBe(null);
  });

  vit("进度条位于统计 chips 上方,图标使用 Lucide SVG 而不是字符", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("通过", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const progress = root.querySelector('[data-sctest="progress"]');
    const counters = root.querySelector('[data-sctest="counters"]');
    vexpect(progress.compareDocumentPosition(counters) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    vexpect(root.querySelector('.sc-head [data-icon="rotate-cw"] svg')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="total-chip"] [data-icon="hash"] svg')).not.toBe(null);
  });

  vit("suite badge 统计通过数与总数,进度条包含通过失败跳过三段", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("混合组", () => {
      i("通过", () => e(1).toBe(1));
      i("失败", () => e(1).toBe(2));
      i("跳过", () => SCTest.skip("环境不支持"));
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="suite-stat"]').textContent).toBe("1 / 3");
    vexpect(root.querySelector('[data-sctest="progress-pass"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="progress-fail"]')).not.toBe(null);
    vexpect(root.querySelector('[data-sctest="progress-skip"]')).not.toBe(null);
  });

  vit("运行全部会重新执行自动 suite,完成后按钮恢复可用", async () => {
    let attempts = 0;
    const { describe: d, it: i, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("自动组", () => i("重复执行", () => attempts++));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const runAll = root.querySelector('[data-sctest="run-all"]');
    runAll.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    vexpect(attempts).toBe(2);
    vexpect(runAll.disabled).toBe(false);
  });
});

vdescribe("LogReporter", () => {
  let SCTest;
  let calls;

  beforeEach(async () => {
    calls = [];
    globalThis.GM_log = (message, level, labels) => calls.push({ message, level, labels });
    SCTest = await loadSCTest();
  });

  vit("开始日志的 level 与 label 符合约定,cases 计入注册的用例总数", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({
      name: "demo",
      reporter: "log",
      context: "background",
    });
    d("组一", () => {
      i("a", () => e(1).toBe(1));
      i("b", () => e(1).toBe(1));
    });
    d("组二", () => {
      i("c", () => e(1).toBe(1));
    });
    await run();

    const starts = calls.filter((c) => c.labels && c.labels.sctest === "run");
    vexpect(starts.length).toBe(1);
    vexpect(starts[0].level).toBe("info");
    vexpect(starts[0].labels.context).toBe("background");
    vexpect(starts[0].labels.cases).toBe(3);
  });

  vit("每条用例发一条 GM_log,结果写进 label", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("存储", () => {
      i("写入", () => e(1).toBe(1));
      i("读取", () => e(1).toBe(2));
    });
    await run();

    const cases = calls.filter((c) => c.labels && c.labels.sctest === "case");
    vexpect(cases.length).toBe(2);
    vexpect(cases[0].level).toBe("info");
    vexpect(cases[0].labels.status).toBe("pass");
    vexpect(cases[1].level).toBe("error");
    vexpect(cases[1].labels.status).toBe("fail");
  });

  vit("跳过/人工用例发出 warn 级别日志,label 标记 status: skip", async () => {
    const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("组", () => im("待人工确认的用例"));
    await run();

    const cases = calls.filter((c) => c.labels && c.labels.sctest === "case");
    vexpect(cases.length).toBe(1);
    vexpect(cases[0].level).toBe("warn");
    vexpect(cases[0].labels.status).toBe("skip");
  });

  vit("汇总是单条日志,label 带 passed/failed", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("组", () => i("a", () => e(1).toBe(1)));
    await run();

    const summaries = calls.filter((c) => c.labels && c.labels.sctest === "summary");
    vexpect(summaries.length).toBe(1);
    vexpect(summaries[0].labels.passed).toBe(1);
    vexpect(summaries[0].labels.failed).toBe(0);
    vexpect(summaries[0].message).toMatch(/总测试数: 1/);
  });

  vit("每条日志的 label 不超过 4 个键", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("组", () => i("a", () => e(1).toBe(1)));
    await run();
    calls.forEach((c) => vexpect(Object.keys(c.labels || {}).length).toBeLessThanOrEqual(4));
  });

  vit("GM_log 未授权时不抛异常", async () => {
    delete globalThis.GM_log;
    SCTest = await loadSCTest();
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("组", () => i("a", () => e(1).toBe(1)));
    await vexpect(run()).resolves.toBeTruthy();
  });

  vit("auto 模式下 @crontab 脚本选用 LogReporter", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({
      name: "demo",
      context: "crontab",
    });
    d("组", () => i("a", () => e(1).toBe(1)));
    await run();
    vexpect(calls.filter((c) => c.labels && c.labels.sctest === "summary").length).toBe(1);
  });
});

vdescribe("手动 suite 触发", () => {
  let SCTest;

  beforeEach(async () => {
    document.body.innerHTML = "";
    SCTest = await loadSCTest();
  });

  vit("点击运行全部后手动 suite 真正执行并更新统计,不重复渲染行且跳过数清零", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false }, () => {
      i("会通过", () => e(1).toBe(1));
      i("会失败", () => e(1).toBe(2));
    });
    const summary = await run();
    vexpect(summary.skipped).toBe(2);

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    root.querySelector('[data-sctest="run-all"]').click();
    await new Promise((r) => setTimeout(r, 0));

    const line = root.querySelector('[data-sctest="summary-line"]').textContent;
    vexpect(line).toMatch(/通过: 1/);
    vexpect(line).toMatch(/失败: 1/);
    // 跳过预渲染时两个用例都已各建一行;真正执行后不应再追加新行(否则总数 4 行也能匹配上面两条正则)。
    vexpect(root.querySelectorAll('[data-sctest="case-row"]').length).toBe(2);
    // 两个用例都已真正跑完,跳过数必须清零,而不是停留在预渲染时的 2。
    vexpect(line).toMatch(/跳过: 0/);
  });

  vit("auto:false suite 用例首次真正执行失败时,面板暴露期望与实际的详情框", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false }, () => {
      i("会失败", () => e("b").toBe("a"));
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    // 跳过预渲染阶段不应该有详情框。
    vexpect(root.querySelector('[data-sctest="failure-detail"]')).toBe(null);

    root.querySelector('[data-sctest="run-all"]').click();
    await new Promise((r) => setTimeout(r, 0));

    const detail = root.querySelector('[data-sctest="failure-detail"]');
    vexpect(detail).not.toBe(null);
    vexpect(detail.textContent).toMatch(/"a"/);
    vexpect(detail.textContent).toMatch(/"b"/);
  });

  vit("用例重跑:连续失败只保留一份最新详情,失败转通过后旧详情被清除", async () => {
    let attempt = 0;
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false }, () => {
      i("先失败两次后通过", () => {
        attempt++;
        if (attempt === 1) e("b").toBe("a");
        else if (attempt === 2) e("d").toBe("c");
      });
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const runBtn = root.querySelector('[data-sctest="run-all"]');

    runBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    let details = root.querySelectorAll('[data-sctest="failure-detail"]');
    vexpect(details.length).toBe(1);
    vexpect(details[0].textContent).toMatch(/"a"/);
    vexpect(details[0].textContent).toMatch(/"b"/);

    runBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    details = root.querySelectorAll('[data-sctest="failure-detail"]');
    vexpect(details.length).toBe(1);
    vexpect(details[0].textContent).toMatch(/"c"/);
    vexpect(details[0].textContent).toMatch(/"d"/);

    runBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    details = root.querySelectorAll('[data-sctest="failure-detail"]');
    vexpect(details.length).toBe(0);
  });
});

vdescribe("手动 suite 跑完后的 onEnd 契约", () => {
  let SCTest;

  beforeEach(async () => {
    document.body.innerHTML = "";
    delete globalThis.GM_log;
    SCTest = await loadSCTest();
  });

  async function clickRunAll(suiteName) {
    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const selector = suiteName ? `[data-sctest-suite="${suiteName}"]` : '[data-sctest="run-all"]';
    root.querySelector(selector).click();
    await new Promise((r) => setTimeout(r, 10));
  }

  vit("ConsoleReporter 在手动 suite 跑完后重新发出三行汇总", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false }, () => {
      i("会通过", () => e(1).toBe(1));
      i("会失败", () => e(1).toBe(2));
    });
    await run();

    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.map(String).join(" "));
    try {
      await clickRunAll();
    } finally {
      console.log = orig;
    }

    const text = lines.join("\n");
    vexpect(text).toMatch(/总测试数: 2/);
    vexpect(/(通过|Passed)[:：]\s*(\d+)/.exec(text)[2]).toBe("1");
    vexpect(/(失败|Failed)[:：]\s*(\d+)/.exec(text)[2]).toBe("1");
  });

  vit("LogReporter 在手动 suite 跑完后重新发出汇总日志", async () => {
    const calls = [];
    globalThis.GM_log = (message, level, labels) => calls.push({ message, level, labels });
    SCTest = await loadSCTest();

    // reporter:"panel" 只会得到 console+panel，拿不到 LogReporter；用 __buildReporters
    // 这个既有扩展点直接装配 LogReporter，并顺手捕获 runInfo 以触发手动运行。
    let captured = null;
    const logReporter = SCTest.__createLogReporter();
    SCTest.__buildReporters = function (opts, context, runInfo) {
      captured = runInfo;
      return [logReporter];
    };

    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo" });
    d("手动组", { auto: false }, () => i("会通过", () => e(1).toBe(1)));
    await run();

    calls.length = 0;
    const summary = await captured.onRunManual("手动组");

    const summaries = calls.filter((c) => c.labels && c.labels.sctest === "summary");
    vexpect(summaries.length).toBe(1);
    vexpect(summaries[0].labels.passed).toBe(1);
    vexpect(summaries[0].labels.failed).toBe(0);
    vexpect(summary.passed).toBe(1);
    vexpect(summary.skipped).toBe(0);
  });

  vit("onRunManual 返回本次运行后的 summary", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("手动组", { auto: false }, () => {
      i("会通过", () => e(1).toBe(1));
      i("会失败", () => e(1).toBe(2));
    });
    const first = await run();
    vexpect(first.skipped).toBe(2);
    vexpect(first.passed).toBe(0);

    await clickRunAll();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const line = root.querySelector('[data-sctest="summary-line"]').textContent;
    vexpect(line).toMatch(/通过: 1/);
    vexpect(line).toMatch(/失败: 1/);
    vexpect(line).toMatch(/跳过: 0/);
  });
});
