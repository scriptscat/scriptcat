// waitFor 只负责观察异步结果；把交互放进轮询回调会在每次重试时重复触发副作用。

function propertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" || node.type === "StringLiteral") return node.value;
  return null;
}

function unwrap(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "禁止在 Testing Library waitFor 回调中重复触发交互" },
    schema: [],
    messages: {
      interaction:
        "waitFor 回调只能观察结果；请把 fireEvent/userEvent 交互移到轮询回调之外，避免重试时重复触发副作用。",
    },
  },
  create(context) {
    const importedNames = new Set();
    const waitForNames = new Set();
    const userInstanceVariables = new WeakSet();
    const sourceCode = context.sourceCode;

    function bindingFor(node, name) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return undefined;
    }

    function isImportedBinding(node, name, names = importedNames) {
      const variable = bindingFor(node, name);
      return names.has(name) && variable?.defs.some((definition) => definition.type === "ImportBinding");
    }

    function isInteractionCall(node) {
      const callee = unwrap(node.callee);
      if (!callee || callee.type !== "MemberExpression") return false;
      const object = unwrap(callee.object);
      if (object?.type !== "Identifier") return false;
      return isImportedBinding(node, object.name) || userInstanceVariables.has(bindingFor(node, object.name));
    }

    function walk(node, callback) {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && isInteractionCall(node)) callback(node);
      for (const [key, value] of Object.entries(node)) {
        if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
        if (Array.isArray(value)) value.forEach((child) => walk(child, callback));
        else if (value && typeof value === "object" && value.type) walk(value, callback);
      }
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          if (source === "@testing-library/react") {
            if (specifier.type === "ImportSpecifier" && propertyName(specifier.imported) === "fireEvent") {
              importedNames.add(specifier.local.name);
            }
            if (specifier.type === "ImportSpecifier" && propertyName(specifier.imported) === "waitFor") {
              waitForNames.add(specifier.local.name);
            }
          }
          if (
            source === "@testing-library/user-event" &&
            (specifier.type === "ImportDefaultSpecifier" ||
              (specifier.type === "ImportSpecifier" && propertyName(specifier.imported) === "userEvent"))
          ) {
            importedNames.add(specifier.local.name);
          }
        }
      },
      VariableDeclarator(node) {
        const init = unwrap(node.init);
        if (
          node.id?.type === "Identifier" &&
          init?.type === "CallExpression" &&
          init.callee?.type === "MemberExpression" &&
          propertyName(init.callee.property) === "setup" &&
          init.callee.object?.type === "Identifier" &&
          isImportedBinding(node, init.callee.object.name)
        ) {
          const variable = bindingFor(node, node.id.name);
          if (variable) userInstanceVariables.add(variable);
        }
      },
      CallExpression(node) {
        if (
          node.callee?.type !== "Identifier" ||
          !waitForNames.has(node.callee.name) ||
          !isImportedBinding(node, node.callee.name, waitForNames)
        )
          return;
        const callback = node.arguments[0];
        if (!callback || (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression"))
          return;
        walk(callback.body, (interaction) => context.report({ node: interaction, messageId: "interaction" }));
      },
    };
  },
};
