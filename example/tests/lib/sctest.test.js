import { beforeEach, describe as vdescribe, expect as vexpect, it as vit } from "vitest";

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
  });
});
