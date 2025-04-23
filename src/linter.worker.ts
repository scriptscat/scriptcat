//@ts-ignore
import { Linter } from "eslint-linter-browserify";
import { userscriptsRules } from "../packages/eslint/linter-config";

// eslint语法检查,使用webworker

const linter = new Linter();

// 额外定义 userscripts 规则
linter.defineRules(userscriptsRules);

const rules = linter.getRules();

const severityMap = {
  2: 8, // 2 for ESLint is error
  1: 4, // 1 for ESLint is warning
};

function getTextBlock(text: string, startPosition: number, endPosition: number) {
  if (startPosition > endPosition || startPosition < 0 || endPosition > text.length) {
    throw new Error("Invalid positions provided");
  }

  let startLineNumber = 1;
  let startColumn = 1;
  let endLineNumber = 1;
  let endColumn = 1;

  for (let i = 0, currentLine = 1, currentColumn = 1; i < text.length; i += 1) {
    if (i === startPosition) {
      startLineNumber = currentLine;
      startColumn = currentColumn;
    }

    if (i === endPosition) {
      endLineNumber = currentLine;
      endColumn = currentColumn;
      break;
    }

    if (text[i] === "\n") {
      currentLine += 1;
      currentColumn = 0;
    }

    currentColumn += 1;
  }

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
  };
}

self.addEventListener("message", (event) => {
  const { code, id, config } = event.data;
  const errs = linter.verify(code, config);
  const markers = errs.map((err: any) => {
    const rule = rules.get(err.ruleId);
    let target = "";
    if (rule) {
      target = rule.meta.docs.url;
    }
    let fix: any;
    if (err.fix) {
      fix = {
        range: getTextBlock(code, err.fix.range[0], err.fix.range[1]),
        text: err.fix.text,
      };
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
      fix,
    };
  });
  // 发回主进程
  self.postMessage({ markers, id });
});
