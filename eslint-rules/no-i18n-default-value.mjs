// 禁止 t("key", { defaultValue: "..." }) 这类内联兜底。
// i18next 在 key 缺失时原样返回 defaultValue，硬编码文案会泄漏到所有语言；而
// src/locales/i18n-usage.test.ts 会故意跳过带 defaultValue 的调用，于是这种写法
// 绕过 CI 的 key 校验导致缺键静默漏翻。必须把 key 补进各语言包，调用处只写裸 t("key")。
const T_CALLEES = new Set(["t", "i18n.t", "i18next.t"]);

function isDefaultValueProperty(prop) {
  if (prop.type !== "Property") return false;
  const { key } = prop;
  return (
    (key.type === "Identifier" && key.name === "defaultValue") ||
    (key.type === "Literal" && key.value === "defaultValue")
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "禁止在 i18n 翻译调用中使用 defaultValue 内联兜底",
    },
    schema: [],
    messages: {
      noDefaultValue:
        '禁止在 i18n 翻译调用中使用 defaultValue 内联兜底：请把 key 补进 src/locales/<locale>/*.json，调用处只写 t("key")。defaultValue 会绕过 i18n-usage 校验导致缺键静默漏翻。',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (!T_CALLEES.has(sourceCode.getText(node.callee))) return;
        const opts = node.arguments[1];
        if (!opts || opts.type !== "ObjectExpression") return;
        const prop = opts.properties.find(isDefaultValueProperty);
        if (prop) {
          context.report({ node: prop, messageId: "noDefaultValue" });
        }
      },
    };
  },
};
