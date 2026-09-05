// 固定休眠无法证明目标状态；仅允许通过逐处 eslint-disable 注释保留真实时序契约。

function propertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" || node.type === "StringLiteral") return node.value;
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "禁止测试用固定休眠代替可观察完成信号" },
    schema: [],
    messages: {
      sleep: "测试不得用固定休眠代替完成信号；请等待目标状态，或为真实时序契约添加逐处豁免说明。",
    },
  },
  create(context) {
    function report(node) {
      context.report({ node, messageId: "sleep" });
    }

    return {
      CallExpression(node) {
        if (node.callee?.type !== "MemberExpression") return;
        if (propertyName(node.callee.property) === "waitForTimeout") report(node);
      },
      NewExpression(node) {
        if (node.callee?.type !== "Identifier" || node.callee.name !== "Promise") return;
        const executor = node.arguments[0];
        if (!executor || (executor.type !== "ArrowFunctionExpression" && executor.type !== "FunctionExpression"))
          return;
        const resolveNames = new Set();
        for (const param of executor.params) if (param.type === "Identifier") resolveNames.add(param.name);
        let hasTimer = false;
        const visit = (child, isRoot = false) => {
          if (!child || typeof child !== "object") return;
          if (child.type === "CallExpression" && propertyName(child.callee) === "setTimeout") {
            const callback = child.arguments[0];
            if (callback?.type === "Identifier" && resolveNames.has(callback.name)) hasTimer = true;
          }
          if (!isRoot && (child.type === "ArrowFunctionExpression" || child.type === "FunctionExpression")) return;
          for (const [key, value] of Object.entries(child)) {
            if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments")
              continue;
            if (Array.isArray(value)) value.forEach((item) => visit(item));
            else if (value && typeof value === "object" && value.type) visit(value);
          }
        };
        visit(executor.body, true);
        if (hasTimer) report(node);
      },
    };
  },
};
