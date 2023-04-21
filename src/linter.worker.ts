/* eslint-disable no-restricted-globals */
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import { Linter } from "eslint/lib/linter/linter.js";
// @ts-ignore
import { userscriptsRules } from "../eslint/linter-config";

// eslint语法检查,使用webworker

const linter = new Linter();

// 额外定义 userscripts 规则
linter.defineRules(userscriptsRules);

const rules = linter.getRules();

const severityMap = {
  2: 8, // 2 for ESLint is error
  1: 4, // 1 for ESLint is warning
};

self.addEventListener("message", (event) => {
  const { code, id, config } = event.data;
  const errs = linter.verify(code, config);
  const markers = errs.map((err: any) => {
    const rule = rules.get(err.ruleId);
    let target = "";
    if (rule) {
      target = rule.meta.docs.url;
    }
    return {
      code: {
        value: err.ruleId || "",
        target,
      },
      startLineNumber: err.line,
      endLineNumber: err.endLine || err.line,
      startColumn: err.column,
      endColumn: err.endColumn || err.column,
      message: err.message,
      // 设置错误的等级，此处ESLint与monaco的存在差异，做一层映射
      // @ts-ignore
      severity: severityMap[err.severity],
      source: "ESLint",
    };
  });
  // 发回主进程
  self.postMessage({ markers, id });
});
