// 明确的一页以上边界夹具必须逐处说明边界，避免无意中把整页数据带进 UI 测试。

function propertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" || node.type === "StringLiteral") return node.value;
  return null;
}

function isPageBoundaryLength(node) {
  if (!node) return false;
  if (node.type !== "BinaryExpression" || node.operator !== "+") return false;
  const otherSide = (side) => side?.type === "Identifier" && /(?:^|_)PAGE_(?:SIZE|ROWS|LIMIT)$/.test(side.name);
  return (
    (node.left.type === "Literal" && node.left.value === 1 && otherSide(node.right)) ||
    (node.right.type === "Literal" && node.right.value === 1 && otherSide(node.left))
  );
}

function isArrayFrom(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    propertyName(node.callee.object) === "Array" &&
    propertyName(node.callee.property) === "from"
  );
}

function lengthNode(node) {
  const options = node.arguments[0];
  if (options?.type !== "ObjectExpression") return undefined;
  const length = options.properties.find(
    (property) => property.type === "Property" && !property.computed && propertyName(property.key) === "length"
  );
  return length?.value;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "要求页面测试显式说明一页以上的分页边界夹具" },
    schema: [],
    messages: {
      fixture: "页面测试的一页以上边界夹具必须逐处说明边界；请缩小夹具，或用 eslint-disable-next-line 标注真实契约。",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const pageBoundaryBindings = new WeakSet();

    function bindingFor(node, name) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return undefined;
    }

    function isTrackedLength(node) {
      return node?.type === "Identifier" && pageBoundaryBindings.has(bindingFor(node, node.name));
    }

    function isShadowedArray(node) {
      const binding = bindingFor(node, "Array");
      return binding?.defs.length > 0;
    }

    return {
      VariableDeclarator(node) {
        if (
          node.parent?.type !== "VariableDeclaration" ||
          node.parent.kind !== "const" ||
          node.id?.type !== "Identifier" ||
          !isPageBoundaryLength(node.init)
        )
          return;
        const binding = bindingFor(node, node.id.name);
        if (binding) pageBoundaryBindings.add(binding);
      },
      CallExpression(node) {
        if (!isArrayFrom(node) || isShadowedArray(node)) return;
        const length = lengthNode(node);
        if (isPageBoundaryLength(length) || isTrackedLength(length)) context.report({ node, messageId: "fixture" });
      },
    };
  },
};
