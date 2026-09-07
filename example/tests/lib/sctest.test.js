import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe as vdescribe, expect as vexpect, it as vit, vi } from "vitest";

const SCTEST_REQUIRE_URL =
  "https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@b8c6d0839c75ee5e4e4276dd10e201011c445df8/example/tests/lib/sctest.js";

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

  vdescribe("安全诊断工具", () => {
    vit("safe/read 能把危险读取转换为可判断的结果并保留不可用哨兵", () => {
      const safeResult = SCTest.safe(() => 42);
      const thrownResult = SCTest.safe(() => {
        throw new Error("读取失败");
      });

      vexpect(safeResult).toEqual({ ok: true, value: 42 });
      vexpect(thrownResult.ok).toBe(false);
      vexpect(thrownResult.error.message).toBe("读取失败");
      vexpect(SCTest.read(() => 42)).toBe(42);
      vexpect(
        SCTest.read(() => {
          throw new Error("不可用");
        })
      ).toBe(SCTest.UNAVAILABLE);
      vexpect(SCTest.formatValue(SCTest.UNAVAILABLE)).toBe("<不可用>");
      const circular = {};
      circular.self = circular;
      vexpect(SCTest.formatValue({ circular })).toMatch(/circular/);
    });

    vit("formatValue 能标识当前 sandbox realm 且不会因危险值中断诊断", () => {
      vexpect(SCTest.formatValue(window)).toMatch(/sandbox window/);
      const throwingValue = new Proxy(
        {},
        {
          get() {
            throw new Error("getter failed");
          },
        }
      );
      vexpect(() => SCTest.formatValue(throwingValue)).not.toThrow();
    });

    vit("环境摘要优先读取现代 GM.info", async () => {
      const previousGM = globalThis.GM;
      const previousGMInfo = globalThis.GM_info;
      globalThis.GM = { info: { scriptHandler: "Test Manager", version: "2.0" } };
      delete globalThis.GM_info;
      try {
        const { run } = SCTest.create({ name: "environment", reporter: "console" });
        const summary = await run();
        vexpect(summary.environment.manager).toBe("Test Manager 2.0");
      } finally {
        if (previousGM === undefined) delete globalThis.GM;
        else globalThis.GM = previousGM;
        if (previousGMInfo === undefined) delete globalThis.GM_info;
        else globalThis.GM_info = previousGMInfo;
      }
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
      vexpect(() =>
        e(() => {
          throw new Error("boom");
        }).toThrow()
      ).not.toThrow();
      vexpect(() => e(() => {}).toThrow()).toThrow();
      vexpect(() =>
        e(() => {
          throw new Error("boom");
        }).toThrow(/boom/)
      ).not.toThrow();
    });

    vit("toThrow 接受抛出 falsy 值的函数", () => {
      const { expect: e } = SCTest.create({ name: "t", reporter: "console" });
      [0, false, null, undefined].forEach((value) => {
        vexpect(() =>
          e(() => {
            throw value;
          }).toThrow()
        ).not.toThrow();
      });
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
      const {
        describe: d,
        it: i,
        itManual: im,
        expect: e,
        run,
      } = SCTest.create({
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
      vexpect(summary.skipped).toBe(0);
      vexpect(summary.manual).toBe(1);
      vexpect(summary.suites.map((s) => s.name)).toEqual(["组一", "组二"]);
      vexpect(summary.suites[0].cases[1].status).toBe("FAIL");
      vexpect(summary.suites[0].cases[1].error).toMatch(/期望 2/);
      vexpect(summary.suites[1].cases[1].status).toBe("MANUAL");
    });

    vit("一个用例抛异常不影响后续用例执行", async () => {
      const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
      d("组", () => {
        i("炸", () => {
          throw new Error("boom");
        });
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

    vit("每条 Console 结果和 console.table 都携带诊断字段", async () => {
      const lines = [];
      const tables = [];
      const originalLog = console.log;
      const originalTable = console.table;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      console.table = (value) => tables.push(value);
      try {
        const { describe: d, check, run } = SCTest.create({ name: "console diagnostics", reporter: "console" });
        d("能力", () =>
          check("能力", "检查值", () => true, "expected-value", "actual-value", "为什么要检查")
        );
        await run();
      } finally {
        console.log = originalLog;
        console.table = originalTable;
      }

      vexpect(lines.join("\n")).toMatch(/expected-value/);
      vexpect(lines.join("\n")).toMatch(/actual-value/);
      vexpect(tables).toHaveLength(1);
      vexpect(tables[0][0]).toMatchObject({ category: "能力", name: "检查值", status: "PASS" });
      vexpect(tables[0][0].expected).toBe("expected-value");
      vexpect(tables[0][0].actual).toBe("actual-value");
    });

    vit("JSON marker 能安全序列化循环引用和 BigInt", async () => {
      const lines = [];
      const originalLog = console.log;
      console.log = (...args) => lines.push(args.map(String).join(" "));
      const circular = {};
      circular.self = circular;
      try {
        const { describe: d, check, run } = SCTest.create({ name: "safe report", reporter: "console" });
        d("安全序列化", () => check("安全序列化", "危险值", () => true, circular, 1n, "必须保留报告"));
        await run();
      } finally {
        console.log = originalLog;
      }

      const marker = lines.find((line) => line.startsWith("[SCTEST_RESULT] "));
      vexpect(marker).toBeDefined();
      const report = JSON.parse(marker.slice("[SCTEST_RESULT] ".length));
      vexpect(report.suites[0].cases[0].expected).toEqual({ self: "[Circular]" });
      vexpect(report.suites[0].cases[0].actual).toBe("1");
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
      vexpect(text).toMatch(/✋ \[MANUAL\] 需要人工点击/);
      vexpect(text).toMatch(/点一下确认按钮/);
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
      vexpect(text).toMatch(/✋ \[MANUAL\] 无提示的人工用例/);
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
      vexpect(summary.suites[0].cases[0].status).toBe("SKIP");
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
      vexpect(lines.join("\n")).toMatch(/○ \[SKIP\] 条件不满足.*需要人工先授权/);
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
      vexpect(logged[0].msg).toMatch(/○ \[SKIP\] 组 › 条件不满足.*error=需要人工先授权/);
      vexpect(logged[0].labels.status).toBe("SKIP");
    });
  });

  vdescribe("诊断式 check/note 协议", () => {
    vit("没有显式期望与实际时,从内部 expect 断言生成诊断字段", async () => {
      const { describe: d, check, expect: e, run } = SCTest.create({ name: "diagnostics", reporter: "console" });
      d("存储", () => {
        check("自动断言", "读取已写入的字符串", () => {
          e("hello").toBe("hello");
        });
      });

      const summary = await run();
      const result = summary.suites[0].cases[0];

      vexpect(result.status).toBe("PASS");
      vexpect(result.category).toBe("存储");
      vexpect(result.expected).toContain('toBe: "hello"');
      vexpect(result.actual).toContain('toBe: "hello"');
      vexpect(result.detail).toContain("读取已写入的字符串");
    });

    vit("支持异步 predicate、WARN/INFO/SKIP 与 required 字段", async () => {
      const { describe: d, check, note, run } = SCTest.create({ name: "diagnostics", reporter: "console" });
      d("诊断", () => {
        check(
          "能力",
          "异步通过",
          async () => {
            await Promise.resolve();
            return true;
          },
          "可用",
          "可用",
          "异步能力已响应"
        );
        check("能力", "可选能力缺失", () => false, "可用", "缺失", "可选 API 未提供", {
          onFail: "WARN",
          required: false,
        });
        check(
          "能力",
          "检测异常",
          () => {
            throw new Error("probe failed");
          },
          "不抛异常",
          "抛出异常",
          "可选探针异常",
          { onError: "WARN", required: false }
        );
        note("环境", "运行环境", "浏览器页面", "happy-dom", "记录环境，不作自动断言");
        check("环境", "暂不适用", () => SCTest.skip("没有对应 API"), "可用", "当前环境未提供", "环境不支持");
      });

      const summary = await run();

      vexpect(summary.counts).toEqual({ PASS: 1, FAIL: 0, WARN: 2, INFO: 1, SKIP: 1, MANUAL: 0 });
      vexpect(summary.warned).toBe(2);
      vexpect(summary.info).toBe(1);
      vexpect(summary.overall).toBe("WARN");
      vexpect(summary.suites[0].cases.map((item) => item.category)).toEqual(["能力", "能力", "能力", "环境", "环境"]);
      vexpect(summary.suites[0].cases[1].required).toBe(false);
    });

    vit("失败与异常可以分别提供诊断说明,且延迟字段支持异步值", async () => {
      const { describe: d, check, run } = SCTest.create({ name: "diagnostic details", reporter: "console" });
      d("能力", () => {
        check(
          "能力",
          "返回 false 的探针",
          async () => false,
          () => Promise.resolve("应该存在"),
          () => Promise.resolve("当前缺失"),
          "正常时应提供能力",
          { failDetail: "当前浏览器没有提供该能力", onFail: "WARN", required: false }
        );
        check(
          "能力",
          "抛异常的探针",
          () => {
            throw new Error("boom");
          },
          "不抛出异常",
          () => "异常",
          "正常时不应抛出异常",
          { errorDetail: "读取宿主能力时发生异常", onError: "WARN", required: false }
        );
      });

      const summary = await run();
      const [failedProbe, errorProbe] = summary.suites[0].cases;
      vexpect(failedProbe.status).toBe("WARN");
      vexpect(failedProbe.expected).toBe("应该存在");
      vexpect(failedProbe.actual).toBe("当前缺失");
      vexpect(failedProbe.detail).toBe("当前浏览器没有提供该能力");
      vexpect(errorProbe.detail).toBe("读取宿主能力时发生异常");
      vexpect(errorProbe.actual).toBe("异常");
      vexpect(errorProbe.error).toBe("boom");
    });

    vit("待人工结果不会被汇总成自动 PASS", async () => {
      const { describe: d, itManual: im, run } = SCTest.create({ name: "manual status", reporter: "console" });
      d("人工操作", () => im("确认页面变化", { hint: "完成操作后再裁决" }));

      const summary = await run();
      vexpect(summary.overall).toBe("MANUAL");
      vexpect(summary.counts).toEqual({ PASS: 0, FAIL: 0, WARN: 0, INFO: 0, SKIP: 0, MANUAL: 1 });
    });

    vit("createReportSession 可记录并更新人工结果,最终汇总使用同一条记录", () => {
      const session = SCTest.createReportSession({ name: "session", reporter: "console" });
      const pending = session.manual("操作", "点击菜单", "用户看到菜单", "等待操作", "需要人工确认");
      session.update(pending, "PASS", { actual: "用户看到菜单", detail: "人工确认完成", manualVerdict: "PASS" });
      session.note("环境", "版本", "浏览器", "测试环境", "只记录环境信息");

      const summary = session.finish();

      vexpect(summary.manual).toBe(0);
      vexpect(summary.passed).toBe(1);
      vexpect(summary.info).toBe(1);
      vexpect(summary.suites[0].cases[0].manualVerdict).toBe("PASS");
    });

    vit("createReportSession.check 与标准 check 一样解析异步字段并保留异常", async () => {
      const session = SCTest.createReportSession({ name: "session diagnostics", reporter: "console" });
      await session.check(
        "能力",
        "异步探针",
        async () => false,
        () => Promise.resolve("应该存在"),
        () => Promise.resolve("当前缺失"),
        "正常时应提供能力",
        { onFail: "WARN", required: false, failDetail: "可选能力缺失" }
      );
      await session.check(
        "能力",
        "异常探针",
        () => {
          throw new Error("session boom");
        },
        "不抛出异常",
        "调用方 actual",
        "正常时不应抛出异常",
        { onError: "WARN", required: false, errorDetail: "宿主能力读取异常" }
      );

      const summary = session.finish();
      const [asyncCase, errorCase] = summary.suites[0].cases;
      vexpect(asyncCase).toMatchObject({
        status: "WARN",
        expected: "应该存在",
        actual: "当前缺失",
        detail: "可选能力缺失",
      });
      vexpect(errorCase).toMatchObject({
        status: "WARN",
        expected: "不抛出异常",
        actual: "调用方 actual",
        error: "session boom",
        detail: "宿主能力读取异常",
      });
    });

    vit("check 兼容不返回值的旧断言体", async () => {
      const { describe: d, check, run } = SCTest.create({ name: "legacy check", reporter: "console" });
      d("兼容", () => {
        check(
          "自动断言",
          "只抛异常表示失败",
          () => {
            // 旧 it 用例的断言通过后没有显式 return。
          },
          null,
          null,
          "保留旧断言体语义"
        );
      });

      const summary = await run();

      vexpect(summary.counts).toEqual({ PASS: 1, FAIL: 0, WARN: 0, INFO: 0, SKIP: 0, MANUAL: 0 });
    });

    vit("报告 session 完成后更新结果会重新发出 JSON 汇总", () => {
      const ended = [];
      const originalBuildReporters = SCTest.__buildReporters;
      SCTest.__buildReporters = () => [{ onEnd: (summary) => ended.push(summary) }];
      try {
        const session = SCTest.createReportSession({ name: "late update" });
        const pending = session.manual("操作", "点击", "完成", "等待", "需要人工确认");
        session.finish();
        session.update(pending, "PASS", { manualVerdict: "PASS" });

        vexpect(ended.length).toBe(2);
        vexpect(ended.at(-1).counts).toEqual({ PASS: 1, FAIL: 0, WARN: 0, INFO: 0, SKIP: 0, MANUAL: 0 });
      } finally {
        SCTest.__buildReporters = originalBuildReporters;
      }
    });

    vit("人工裁决事件会把 MANUAL 同步成最终 PASS/FAIL", async () => {
      let runInfo;
      const cases = [];
      const ends = [];
      SCTest.__buildReporters = (opts, context, info) => {
        runInfo = info;
        return [{ onCase: (result) => cases.push(result), onEnd: (summary) => ends.push(summary) }];
      };
      const { describe: d, itManual, run } = SCTest.create({ name: "manual", reporter: "console" });
      d("操作", () => itManual("打开菜单", { hint: "从扩展菜单点击" }));

      const first = await run();
      const final = await runInfo.onManualVerdict("操作", "打开菜单", "PASS", "人工已确认");

      vexpect(first.manual).toBe(1);
      vexpect(cases.map((item) => item.status)).toEqual(["MANUAL", "PASS"]);
      vexpect(final.manual).toBe(0);
      vexpect(final.passed).toBe(1);
      vexpect(ends.at(-1).passed).toBe(1);
    });
  });
});

vdescribe("sctest 用户脚本引用", () => {
  vit("固定到包含当前框架版本的提交", () => {
    const testsDir = resolve(import.meta.dirname, "..");
    const consumers = [...readdirSync(testsDir).filter((name) => name.endsWith(".js")), "lib/README.md"];

    for (const name of consumers) {
      const source = readFileSync(resolve(testsDir, name), "utf8");
      if (source.includes("/example/tests/lib/sctest.js")) {
        vexpect(source, name).toMatch(new RegExp(`// @require\\s+${SCTEST_REQUIRE_URL.replaceAll(".", "\\.")}`));
      }
    }
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
    vexpect(root.querySelector(".sc-meta").textContent).toContain("page");
    vexpect(root.querySelector(".sc-meta").textContent).toContain("http://localhost:3000/");
  });

  vit("默认只在顶层 frame 挂载面板,all 策略允许 iframe 显示", () => {
    document.getElementById("sctest-panel-host")?.remove();
    const originalTop = window.top;
    Object.defineProperty(window, "top", { configurable: true, value: {} });
    try {
      const iframeReporters = SCTest.__buildReporters(
        { reporter: "panel" },
        "page",
        { name: "iframe", context: "page", suites: [], environment: {}, runnable: false }
      );
      vexpect(iframeReporters).toHaveLength(2);
      vexpect(document.getElementById("sctest-panel-host")).toBe(null);
    } finally {
      Object.defineProperty(window, "top", { configurable: true, value: originalTop });
    }

    const allFrameReporters = SCTest.__buildReporters(
      { reporter: "panel", framePolicy: "all" },
      "page",
      { name: "all frames", context: "page", suites: [], environment: {}, runnable: false }
    );
    vexpect(allFrameReporters).toHaveLength(2);
    vexpect(document.getElementById("sctest-panel-host")).not.toBe(null);
  });

  vit("自定义 report session 更新人工结果后移除裁决按钮并刷新同一条记录", () => {
    const session = SCTest.createReportSession({ name: "session panel", reporter: "panel" });
    session.start();
    const pending = session.manual("操作", "点击菜单", "菜单出现", "待点击", "需要人工操作");
    const root = document.getElementById("sctest-panel-host").shadowRoot;

    vexpect(root.querySelectorAll('[data-sctest="manual-pass"]')).toHaveLength(1);
    vexpect(root.querySelectorAll('[data-sctest="manual-fail"]')).toHaveLength(1);
    session.update(pending, "PASS", { actual: "菜单出现", detail: "人工确认通过", manualVerdict: "PASS" });

    vexpect(root.querySelector('[data-sctest="case-row"]').classList.contains("sc-case-manual")).toBe(false);
    vexpect(root.querySelectorAll('[data-sctest="manual-pass"]')).toHaveLength(0);
    vexpect(root.querySelectorAll('[data-sctest="manual-fail"]')).toHaveLength(0);
    vexpect(root.querySelector('[data-sctest="case-row"]').textContent).toContain("PASS");
    session.finish();
  });

  vit("没有重跑回调的自定义 report session 不显示无效的运行全部按钮", () => {
    const session = SCTest.createReportSession({ name: "session panel", reporter: "panel" });
    session.start();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="run-all"]').hidden).toBe(true);
    vexpect(root.querySelector('[data-sctest="queue-chip"]').hidden).toBe(true);
    session.finish();
  });

  vit("面板控件提供可访问名称,空筛选状态可被辅助技术感知", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "accessibility", reporter: "panel" });
    d("组", () => i("通过", () => e(true).toBe(true)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector(".sc-panel").getAttribute("role")).toBe("region");
    vexpect(root.querySelector('[data-sctest="duration"]').getAttribute("role")).toBe("timer");
    vexpect(root.querySelector('[data-sctest="duration"]').getAttribute("aria-label")).toBe("运行耗时");
    vexpect(root.querySelector('[data-sctest="search"] input').getAttribute("aria-label")).toBe("筛选用例");
    vexpect(root.querySelector('[data-sctest="collapse-all"]').getAttribute("aria-label")).toBe("全部折叠");
    vexpect(root.querySelector('[data-sctest="empty-state"]').getAttribute("role")).toBe("status");
    vexpect(root.querySelector('[data-sctest="empty-state"]').getAttribute("aria-live")).toBe("polite");

    const toggle = root.querySelector('[data-sctest="toggle-detail"]');
    vexpect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    vexpect(toggle.getAttribute("aria-expanded")).toBe("true");
    root.querySelector('[data-sctest="collapse-all"]').click();
    vexpect(root.querySelector('[data-sctest="collapse-all"]').getAttribute("aria-label")).toBe("全部展开");
  });

  vit("自定义 report session 在结束前也显示已记录结果数量", () => {
    const session = SCTest.createReportSession({ name: "live session", reporter: "panel" });
    session.start();
    session.record({ category: "运行", name: "第一项", status: "PASS" });

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="total-chip"]').textContent).toContain("共 1");
    vexpect(root.querySelector('[data-sctest="summary-line"]').textContent).toContain("总测试数: 1");
    session.finish();
  });

  vit("面板用稳定可读的格式显示长耗时", () => {
    const session = SCTest.createReportSession({ name: "duration format", reporter: "panel" });
    session.start();
    session.record({ category: "运行", name: "毫秒项", status: "PASS", durationMs: 35 });
    session.record({ category: "运行", name: "秒项一", status: "PASS", durationMs: 35700 });
    session.record({ category: "运行", name: "秒项二", status: "PASS", durationMs: 36000 });
    session.record({ category: "运行", name: "秒项三", status: "PASS", durationMs: 36100 });
    session.record({ category: "运行", name: "分秒项", status: "PASS", durationMs: 62000 });
    session.finish();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const durations = [...root.querySelectorAll('[data-sctest="case-row"] .sc-dur')].map((node) => node.textContent);
    vexpect(durations).toEqual(["035 ms", "35.7 s", "36.0 s", "36.1 s", "01m 02s"]);
    vexpect(new Set(durations.slice(1, 4).map((value) => value.length)).size).toBe(1);
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

  vit("面板使用附件式诊断表头并显示状态/检查/实际/预期/说明", async () => {
    const { describe: d, check, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("存储", () => {
      check("自动断言", "读取字符串", () => true, '"hello"', '"hello"', "验证读回值与写入值一致");
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const table = root.querySelector('[data-sctest="diagnostic-table"]');
    vexpect(table).not.toBe(null);
    vexpect(table.textContent).toMatch(/状态/);
    vexpect(table.textContent).toMatch(/检查/);
    vexpect(table.textContent).toMatch(/实际/);
    vexpect(table.textContent).toMatch(/预期/);
    vexpect(table.textContent).toMatch(/说明/);
    vexpect(root.querySelector('[data-sctest="expected-value"]').textContent).toContain('"hello"');
    vexpect(root.querySelector('[data-sctest="actual-value"]').textContent).toContain('"hello"');
    vexpect(root.querySelector('[data-sctest="detail-value"]').textContent).toContain("验证读回值");
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
    vexpect(summary.skipped).toBe(0);
    vexpect(summary.manual).toBe(1);

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

  vit("诊断提示说明状态优先级,页脚说明结果来源,人工按钮具备可访问名称", async () => {
    const { describe: d, itManual: im, run } = SCTest.create({ name: "diagnostic UX", reporter: "panel" });
    d("人工操作", () => im("确认页面变化", { hint: "完成页面操作后裁决" }));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="diagnostic-hint"]').textContent).toMatch(/先看 FAIL/);
    vexpect(root.querySelector('[data-sctest="footer-note"]').textContent).toMatch(/expected.*actual/i);
    vexpect(root.querySelector('[data-sctest="manual-pass"]').getAttribute("aria-label")).toBe("人工确认通过");
    vexpect(root.querySelector('[data-sctest="manual-fail"]').getAttribute("aria-label")).toBe("人工确认失败");
  });

  vit("失败详情默认展开,通过详情可按 expected/actual/detail 搜索并手动展开", async () => {
    const { describe: d, check, run } = SCTest.create({ name: "progressive diagnostics", reporter: "panel" });
    d("诊断", () => {
      check("诊断", "通过项", () => true, "unused", "unused", "通过说明");
      check("诊断", "失败项", () => false, "expected needle", "actual needle", "detail needle");
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const rows = root.querySelectorAll('[data-sctest="case-row"]');
    vexpect(rows[0].querySelector('[data-sctest="toggle-detail"]').getAttribute("aria-expanded")).toBe("false");
    vexpect(rows[1].querySelector('[data-sctest="toggle-detail"]').getAttribute("aria-expanded")).toBe("true");
    const search = root.querySelector('[data-sctest="search"] input');
    search.value = "detail needle";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    vexpect(rows[0].hidden).toBe(true);
    vexpect(rows[1].hidden).toBe(false);
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    rows[0].querySelector('[data-sctest="toggle-detail"]').click();
    vexpect(rows[0].nextElementSibling.hidden).toBe(false);
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

  vit("状态 chip 的计数独立渲染,完成进度条填满且分段不收缩", async () => {
    const { describe: d, check, note, run } = SCTest.create({ name: "stable metrics", reporter: "panel" });
    d("混合组", () => {
      check("诊断", "通过", () => true, "yes", "yes", "通过");
      check("诊断", "警告", () => false, "yes", "no", "可选", { onFail: "WARN" });
      note("诊断", "信息", "observed", "observed", "观察");
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelectorAll('[data-sctest="counters"] .sc-chip-count')).toHaveLength(7);
    vexpect(root.querySelector('[data-sctest="counters"] .sc-chip-pass .sc-chip-count').textContent).toBe("1");
    const segments = [...root.querySelectorAll('[data-sctest="progress"] i')];
    const totalWidth = segments.reduce((sum, segment) => sum + parseFloat(segment.style.width || "0"), 0);
    vexpect(totalWidth).toBeCloseTo(100, 5);
    vexpect(segments.every((segment) => segment.style.flex.startsWith("0 0 "))).toBe(true);
  });

  vit("结果状态使用一致的 badge 外观,footer summary 与操作保持同一行", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "consistent layout", reporter: "panel" });
    d("组", () => i("通过", () => e(true).toBe(true)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    vexpect(root.querySelector('[data-sctest="case-row"] .sc-case-status').classList.contains("sc-status-pass")).toBe(true);
    const summary = root.querySelector('[data-sctest="summary-line"]');
    const actions = root.querySelector('[data-sctest="footer"] .sc-foot-actions');
    vexpect(summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    vexpect(actions.compareDocumentPosition(root.querySelector('[data-sctest="footer-note"]')) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
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

  vit("全部、失败、跳过筛选会只显示匹配用例并允许切回全部", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("混合组", () => {
      i("通过项", () => e(1).toBe(1));
      i("失败项", () => e(1).toBe(2));
      i("跳过项", () => SCTest.skip("环境不支持"));
    });
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const visibleCases = () =>
      [...root.querySelectorAll('[data-sctest="case-row"]')].filter((row) => !row.hidden).map((row) => row.textContent);
    root.querySelector('[data-sctest="filter-fail"]').click();
    vexpect(visibleCases()).toHaveLength(1);
    vexpect(visibleCases()[0]).toContain("失败项");
    root.querySelector('[data-sctest="filter-skip"]').click();
    vexpect(visibleCases()).toHaveLength(1);
    vexpect(visibleCases()[0]).toContain("跳过项");
    root.querySelector('[data-sctest="filter-all"]').click();
    vexpect(visibleCases()).toHaveLength(3);
  });

  vit("人工筛选只显示待人工确认用例", async () => {
    const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("人工组", () => im("待确认"));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    root.querySelector('[data-sctest="filter-manual"]').click();
    vexpect(root.querySelector('[data-sctest="case-row"]').hidden).toBe(false);
  });

  vit("搜索会隐藏不匹配的 suite,清空会恢复所有用例", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("下载", () => i("保存文件", () => e(1).toBe(1)));
    d("权限", () => i("请求授权", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const search = root.querySelector('[data-sctest="search"] input');
    search.value = "保存";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    vexpect([...root.querySelectorAll('[data-sctest="suite-row"]')].filter((row) => !row.hidden)).toHaveLength(1);
    root.querySelector('[data-sctest="reset"]').click();
    vexpect(search.value).toBe("");
    vexpect([...root.querySelectorAll('[data-sctest="case-row"]')].filter((row) => !row.hidden)).toHaveLength(2);
  });

  vit("人工判定会更新筛选与 JSON 使用的真实状态,隐藏用例时提示同步隐藏", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("人工组", () => im("确认结果", { hint: "检查页面" }));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    root.querySelector('[data-sctest="manual-pass"]').click();
    root.querySelector('[data-sctest="filter-fail"]').click();
    vexpect(root.querySelector('[data-sctest="case-row"]').hidden).toBe(true);
    vexpect(root.querySelector(".sc-hint").hidden).toBe(true);
    root.querySelector('[data-sctest="export-json"]').click();
    vexpect(JSON.parse(writeText.mock.calls[0][0]).cases[0].status).toBe("PASS");
  });

  vit("单组和全部收缩都能再次点击展开", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("用例", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const suite = root.querySelector('[data-sctest="suite-row"]');
    const group = suite.nextElementSibling;
    suite.click();
    vexpect(group.hidden).toBe(true);
    suite.click();
    vexpect(group.hidden).toBe(false);
    const collapseAll = root.querySelector('[data-sctest="collapse-all"]');
    collapseAll.click();
    vexpect(group.hidden).toBe(true);
    collapseAll.click();
    vexpect(group.hidden).toBe(false);
  });

  vit("JSON 按钮复制结构化报告而不是触发文件下载", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("通过项", () => e(1).toBe(1)));
    await run();

    document.getElementById("sctest-panel-host").shadowRoot.querySelector('[data-sctest="export-json"]').click();
    vexpect(writeText).toHaveBeenCalledOnce();
    vexpect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({ name: "demo", context: "page" });
  });

  vit("拖动手柄会更新面板固定位置", async () => {
    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "panel" });
    d("组", () => i("用例", () => e(1).toBe(1)));
    await run();

    const root = document.getElementById("sctest-panel-host").shadowRoot;
    const panel = root.querySelector(".sc-panel");
    root
      .querySelector('[data-sctest="drag-handle"]')
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 20 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 60 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    vexpect(panel.style.left).toBe("30px");
    vexpect(panel.style.top).toBe("40px");
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
    const {
      describe: d,
      it: i,
      expect: e,
      run,
    } = SCTest.create({
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
    vexpect(cases[0].labels.status).toBe("PASS");
    vexpect(cases[1].level).toBe("error");
    vexpect(cases[1].labels.status).toBe("FAIL");
  });

  vit("跳过/人工用例发出 warn 级别日志,label 保留独立 MANUAL 状态", async () => {
    const { describe: d, itManual: im, run } = SCTest.create({ name: "demo", reporter: "log" });
    d("组", () => im("待人工确认的用例"));
    await run();

    const cases = calls.filter((c) => c.labels && c.labels.sctest === "case");
    vexpect(cases.length).toBe(1);
    vexpect(cases[0].level).toBe("warn");
    vexpect(cases[0].labels.status).toBe("MANUAL");
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
    const {
      describe: d,
      it: i,
      expect: e,
      run,
    } = SCTest.create({
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

  vit("用例重跑通过后不保留上一次失败的断言详情", async () => {
    let attempt = 0;
    let runInfo;
    const results = [];
    SCTest.__buildReporters = function (opts, context, capturedRunInfo) {
      runInfo = capturedRunInfo;
      return [{ onCase: (result) => results.push(result) }];
    };

    const { describe: d, it: i, expect: e, run } = SCTest.create({ name: "demo", reporter: "console" });
    d("手动组", { auto: false }, () => {
      i("第一次失败后通过", () => {
        attempt++;
        if (attempt === 1) e("actual").toBe("expected");
      });
    });

    await run();
    await runInfo.onRerun();
    await runInfo.onRerun();

    const result = results.at(-1);
    vexpect(result.status).toBe("PASS");
    vexpect(result.error).toBe(null);
    vexpect(result.expected).toBe("执行不抛出异常");
    vexpect(result.actual).toBe("未抛出异常");
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
