import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runCheck } from "./check-issue-templates.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 用最小 fixture 仓库树（而非真实仓库）锁定两类真实回归：
//   - 英文模板里未加引号的 `: ` 让 YAML 解析失败，中文模板因为用全角「：」而侥幸通过，
//     单看 diff 完全看不出来，GitHub 则直接拒绝渲染该表单；
//   - 字段 id 被改名后，popup「报告问题」链接的 &browser= 预填静默失效，
//     且已安装的旧版本会一直沿用旧参数名。

const tmpDirs = [];

const TEMPLATE_DIR = ".github/ISSUE_TEMPLATE";

function template({ name, title = "[BUG] ", labels = ["bug"], fields }) {
  const body = fields
    .map((field) => {
      if (field.type === "markdown") {
        return `  - type: markdown\n    attributes:\n      value: |\n        ${field.value ?? "hello"}\n`;
      }
      const lines = [`  - type: ${field.type}`];
      if (field.id !== undefined) lines.push(`    id: ${field.id}`);
      lines.push(`    attributes:`);
      lines.push(`      label: ${field.label ?? field.id}`);
      if (field.options) {
        lines.push(`      options:`);
        for (const option of field.options) {
          lines.push(typeof option === "string" ? `        - ${option}` : `        - label: ${option.label}`);
        }
      }
      if (field.validations !== false) lines.push(`    validations:\n      required: ${field.required ?? true}`);
      return lines.join("\n") + "\n";
    })
    .join("\n");
  return `name: ${name}\ndescription: ${name} description\ntitle: "${title}"\nlabels: ${JSON.stringify(labels)}\n\nbody:\n${body}`;
}

const DEFAULT_FIELDS = [
  { type: "markdown" },
  { type: "textarea", id: "summary" },
  { type: "input", id: "scriptcat-version" },
  { type: "input", id: "browser" },
];

function makeFixtureRoot({ zh, en, source } = {}) {
  const dir = path.join(os.tmpdir(), `check-issue-templates-${Math.random().toString(36).slice(2)}`);
  tmpDirs.push(dir);
  mkdirSync(path.join(dir, TEMPLATE_DIR), { recursive: true });

  writeFileSync(
    path.join(dir, TEMPLATE_DIR, "01_bug_report.yaml"),
    zh ?? template({ name: "Bug 反馈", fields: DEFAULT_FIELDS })
  );
  writeFileSync(
    path.join(dir, TEMPLATE_DIR, "11_bug_report_en.yaml"),
    en ?? template({ name: "Bug Report", fields: DEFAULT_FIELDS })
  );

  if (source !== undefined) {
    mkdirSync(path.join(dir, "src/pages/popup"), { recursive: true });
    writeFileSync(path.join(dir, "src/pages/popup/App.tsx"), source);
  }
  return dir;
}

function problemsOf(root) {
  return runCheck(root).problems;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe("issue 模板机械检查", () => {
  it("结构合法且中英文对齐的模板集合应通过", () => {
    expect(problemsOf(makeFixtureRoot())).toEqual([]);
  });

  describe("YAML 与 issue-form schema", () => {
    it("未加引号导致的 YAML 解析失败应报错，而不是被跳过", () => {
      // description 里裸露的 `: ` 会让 YAML 认为这里又开了一个映射键。
      const broken =
        `name: Bug Report\ndescription: d\ntitle: "[BUG] "\nlabels: ["bug"]\n\nbody:\n` +
        `  - type: input\n    id: summary\n    attributes:\n      label: L\n` +
        `      description: For logs, note the source: page console, service worker\n`;
      const problems = problemsOf(makeFixtureRoot({ en: broken }));
      expect(problems.join("\n")).toMatch(/invalid YAML/);
    });

    it("markdown 块声明 id 应报错", () => {
      const zh = template({
        name: "Bug 反馈",
        fields: [{ type: "markdown" }, { type: "textarea", id: "summary" }],
      }).replace("  - type: markdown\n", "  - type: markdown\n    id: intro\n");
      expect(problemsOf(makeFixtureRoot({ zh })).join("\n")).toMatch(/markdown blocks must not declare an id/);
    });

    it("重复的字段 id 应报错", () => {
      const fields = [
        { type: "textarea", id: "summary" },
        { type: "input", id: "summary" },
      ];
      const zh = template({ name: "Bug 反馈", fields });
      const en = template({ name: "Bug Report", fields });
      expect(problemsOf(makeFixtureRoot({ zh, en })).join("\n")).toMatch(/duplicate id "summary"/);
    });

    it("非 markdown 字段缺少 id 应报错", () => {
      const fields = [{ type: "textarea", label: "无 id" }];
      const zh = template({ name: "Bug 反馈", fields });
      const en = template({ name: "Bug Report", fields });
      expect(problemsOf(makeFixtureRoot({ zh, en })).join("\n")).toMatch(/missing id/);
    });

    it("dropdown 没有 options 应报错", () => {
      const fields = [{ type: "dropdown", id: "area" }];
      const zh = template({ name: "Bug 反馈", fields });
      const en = template({ name: "Bug Report", fields });
      expect(problemsOf(makeFixtureRoot({ zh, en })).join("\n")).toMatch(/must declare a non-empty options list/);
    });

    it("upload 字段应符合 GitHub issue form schema", () => {
      const fields = [{ type: "upload", id: "logs", label: "日志" }];
      const zh = template({ name: "Bug 反馈", fields });
      const en = template({ name: "Bug Report", fields });
      expect(problemsOf(makeFixtureRoot({ zh, en }))).toEqual([]);
    });

    it("checkboxes 可通过 validations.required 声明整个字段必填", () => {
      const fields = [{ type: "checkboxes", id: "precheck", options: [{ label: "已搜索" }] }];
      const zh = template({ name: "Bug 反馈", fields });
      const en = template({ name: "Bug Report", fields });
      expect(problemsOf(makeFixtureRoot({ zh, en }))).toEqual([]);
    });

    it("未知的顶层键应报错", () => {
      const zh = template({ name: "Bug 反馈", fields: DEFAULT_FIELDS }) + "\nunknown_key: x\n";
      expect(problemsOf(makeFixtureRoot({ zh })).join("\n")).toMatch(/unknown top-level key "unknown_key"/);
    });
  });

  describe("中英文模板对齐", () => {
    it("英文镜像缺少某个字段时应报错", () => {
      const en = template({
        name: "Bug Report",
        fields: DEFAULT_FIELDS.filter((field) => field.id !== "browser"),
      });
      expect(problemsOf(makeFixtureRoot({ en })).join("\n")).toMatch(/element structure differs/);
    });

    it("同一字段中英文必填性不一致时应报错", () => {
      const en = template({
        name: "Bug Report",
        fields: DEFAULT_FIELDS.map((field) => (field.id === "browser" ? { ...field, required: false } : field)),
      });
      expect(problemsOf(makeFixtureRoot({ en })).join("\n")).toMatch(/element structure differs/);
    });

    it("labels 不一致时应报错", () => {
      const en = template({ name: "Bug Report", labels: ["bug", "extra"], fields: DEFAULT_FIELDS });
      expect(problemsOf(makeFixtureRoot({ en })).join("\n")).toMatch(/"labels" differ/);
    });

    it("缺少英文镜像文件应报错", () => {
      const root = makeFixtureRoot();
      rmSync(path.join(root, TEMPLATE_DIR, "11_bug_report_en.yaml"));
      expect(problemsOf(root).join("\n")).toMatch(/missing English mirror/);
    });
  });

  describe("issues/new 预填契约", () => {
    const linkSource = (params) => `
      export function App() {
        const onClick = () => {
          const issueUrl =
            \`https://github.com/scriptscat/scriptcat/issues/new?\` +
            \`template=\${isChineseUser() ? "01_bug_report" : "11_bug_report_en"}.yaml&${params}\`;
          window.open(issueUrl, "_blank");
        };
        return onClick;
      }
    `;

    it("预填参数都能对应到字段 id 时应通过", () => {
      const source = linkSource("scriptcat-version=${ExtVersion}&browser=${encodeURIComponent(ua)}");
      expect(problemsOf(makeFixtureRoot({ source }))).toEqual([]);
    });

    it("字段 id 被改名导致预填参数失效时应报错", () => {
      // browser -> environment：模板本身完全合法，只有链接会静默失效。
      const renamed = DEFAULT_FIELDS.map((field) => (field.id === "browser" ? { ...field, id: "environment" } : field));
      const zh = template({ name: "Bug 反馈", fields: renamed });
      const en = template({ name: "Bug Report", fields: renamed });
      const source = linkSource("scriptcat-version=${ExtVersion}&browser=${encodeURIComponent(ua)}");
      const problems = problemsOf(makeFixtureRoot({ zh, en, source }));
      expect(problems.join("\n")).toMatch(/prefills "browser="/);
      expect(problems.join("\n")).toMatch(/01_bug_report\.yaml has no field with that id/);
      expect(problems.join("\n")).toMatch(/11_bug_report_en\.yaml has no field with that id/);
    });

    it("跨越模板字面量拼接的第二段参数同样要被检查", () => {
      // browser= 出现在新的一段模板字面量开头，而不是紧跟 ? 或 &。
      const source = `
        const issueUrl =
          \`https://github.com/scriptscat/scriptcat/issues/new?\` +
          \`template=01_bug_report.yaml&scriptcat-version=\${ExtVersion}&\` +
          \`nonexistent-field=\${x}\`;
      `;
      expect(problemsOf(makeFixtureRoot({ source })).join("\n")).toMatch(/prefills "nonexistent-field="/);
    });

    it("URL 标记出现在模板字面量尾部时仍应检查预填参数", () => {
      const source = `
        const issueUrl =
          \`https://github.com/scriptscat/scriptcat/\${prefix}issues/new?template=01_bug_report.yaml&\` +
          \`nonexistent-field=\${value}\`;
      `;
      expect(problemsOf(makeFixtureRoot({ source })).join("\n")).toMatch(/prefills "nonexistent-field="/);
    });

    it("无法静态解析出模板名时应报错而不是放行", () => {
      const source = `
        const issueUrl = \`https://github.com/scriptscat/scriptcat/issues/new?template=\${pickTemplate()}&browser=\${ua}\`;
      \`;`;
      expect(problemsOf(makeFixtureRoot({ source })).join("\n")).toMatch(/prefill target is unverifiable/);
    });

    it("不带预填参数的 issues/new 链接不应报错", () => {
      const source = `const url = "https://github.com/scriptscat/scriptcat/issues/new";`;
      expect(problemsOf(makeFixtureRoot({ source }))).toEqual([]);
    });
  });

  // issues/new/choose 不指定模板，由用户在选择页自己挑，因此没有单一预填目标可解析：
  // 参数只要在任意一个模板里有对应字段就会生效，在其余模板上被 GitHub 忽略属于预期。
  describe("issues/new/choose 选择页预填契约", () => {
    const chooserSource = (query) =>
      `const url = \`https://github.com/scriptscat/scriptcat/issues/new/choose?${query}\`;`;

    it("参数能对应到任意一个模板的字段 id 时应通过（不要求每个模板都有）", () => {
      // 只有 01/11 声明 browser，另一对模板没有 —— 选择页场景下这不算错。
      const zh = template({ name: "Bug 反馈", fields: DEFAULT_FIELDS });
      const en = template({ name: "Bug Report", fields: DEFAULT_FIELDS });
      const source = chooserSource("scriptcat-version=${ExtVersion}&browser=${encodeURIComponent(ua)}");
      expect(problemsOf(makeFixtureRoot({ zh, en, source }))).toEqual([]);
    });

    it("参数在所有模板里都找不到对应字段时应报错", () => {
      const source = chooserSource("scriptcat-version=${ExtVersion}&nonexistent-field=${x}");
      const problems = problemsOf(makeFixtureRoot({ source }));
      expect(problems.join("\n")).toMatch(/prefills "nonexistent-field="/);
      expect(problems.join("\n")).toMatch(/no template .* declares that id/);
    });

    it("选择页链接不应再要求解析出模板文件名", () => {
      const source = chooserSource("scriptcat-version=${ExtVersion}");
      expect(problemsOf(makeFixtureRoot({ source })).join("\n")).not.toMatch(/prefill target is unverifiable/);
    });

    it("参数名藏在运行时表达式里（如 URLSearchParams）导致看不见时应报错而不是静默放行", () => {
      // 这样写参数名不在字面量里，检查器扫不到任何 name=，契约会变成没人看守。
      const source = chooserSource("${params}");
      const problems = problemsOf(makeFixtureRoot({ source })).join("\n");
      expect(problems).toMatch(/no prefill param name is visible/);
      expect(problems).toMatch(/Spell the param names out in the URL literal/);
    });
  });
});

// 真实仓库模板检查是 I/O 密集的集成检查，不是微单元测试：它要读取全部 12 个模板并做 YAML 解析，
// 再对全量 src 做 issues/new 预填契约的 TS AST 扫描，还要加载 yaml / typescript 两个重型依赖
// （冷启动实测 ~200ms，CI 并行负载下还会成倍放大）。它不该套用 fast 项目的 340ms 单元预算——
// 那正是它偶发超时（CI 偶发 Test timed out in 340ms）的根因，与上面的 fixture 测试成本不同。
//
// 因此把「计算」放进 beforeAll：vitest 的 hook 走默认 10s 预算，与 testTimeout 无关，只算一次
// 并缓存；「断言」阶段的 it 只对已算好的结果做快照校验，微秒级完成，也不会把仓库扫描重复执行。
// 以后若要加更多真实仓库断言，直接读下面的缓存即可。
describe("仓库现有模板（集成检查）", () => {
  let repoCheck;
  beforeAll(() => {
    repoCheck = runCheck(REPO_ROOT);
  });

  it("全部通过机械检查", () => {
    expect(repoCheck.problems).toEqual([]);
  });
});
