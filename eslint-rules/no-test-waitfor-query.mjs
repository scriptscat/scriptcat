// 单一的 getBy + toBeInTheDocument 断言应使用 findBy，避免把同步查询包进轮询器。

function propertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" || node.type === "StringLiteral") return node.value;
  return null;
}

function unwrap(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

function isGetByCall(node) {
  const call = unwrap(node);
  if (!call || call.type !== "CallExpression") return false;
  const callee = unwrap(call.callee);
  return callee?.type === "MemberExpression" && /^getBy/.test(propertyName(callee.property) ?? "");
}

function isExistenceAssertion(node) {
  const assertion = unwrap(node);
  if (!assertion || assertion.type !== "CallExpression") return false;
  const matcher = unwrap(assertion.callee);
  if (matcher?.type !== "MemberExpression" || propertyName(matcher.property) !== "toBeInTheDocument") return false;
  const expectCall = unwrap(matcher.object);
  return (
    expectCall?.type === "CallExpression" &&
    propertyName(expectCall.callee) === "expect" &&
    isGetByCall(expectCall.arguments[0])
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "存在性查询使用 findBy，不要用 waitFor 包装 getBy" },
    schema: [],
    messages: {
      query: "单一存在性断言请使用 findBy*；waitFor 应保留给多断言或非标准异步边界。",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (propertyName(node.callee) !== "waitFor") return;
        const callback = node.arguments[0];
        if (!callback || (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression"))
          return;
        const body = callback.body;
        const expression =
          body.type === "BlockStatement"
            ? body.body.length === 1 && body.body[0].type === "ExpressionStatement"
              ? body.body[0].expression
              : null
            : body;
        if (isExistenceAssertion(expression)) context.report({ node, messageId: "query" });
      },
    };
  },
};
