// 禁止 t("key", { defaultValue: "..." }) 这类内联兜底。
// i18next 在 key 缺失时原样返回 defaultValue，硬编码文案会泄漏到所有语言；而
// src/locales/i18n-usage.test.ts 会故意跳过带 defaultValue 的调用，于是这种写法
// 绕过 CI 的 key 校验导致缺键静默漏翻。必须把 key 补进各语言包，调用处只写裸 t("key")。

const T_OBJECT_NAMES = new Set(["i18n", "i18next"]);
const T_METHOD_NAME = "t";

function unwrapExpression(node) {
  let current = node;
  while (
    current?.type === "ChainExpression" ||
    current?.type === "ParenthesizedExpression" ||
    current?.type === "TSAsExpression" ||
    current?.type === "TSTypeAssertion" ||
    current?.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function getStaticPropertyName(prop) {
  if (!prop) return null;
  if (prop.type === "Identifier") return prop.name;
  if (prop.type === "Literal" || prop.type === "StringLiteral") return prop.value;
  return null;
}

function isTranslationCallee(callee) {
  const node = unwrapExpression(callee);

  if (node?.type === "Identifier") {
    return node.name === T_METHOD_NAME;
  }

  if (node?.type !== "MemberExpression") return false;

  const propName = getStaticPropertyName(node.property);
  if (propName !== T_METHOD_NAME) return false;

  const object = unwrapExpression(node.object);
  return object?.type === "Identifier" && T_OBJECT_NAMES.has(object.name);
}

function isDefaultValueProperty(prop) {
  if (prop.type !== "Property") return false;
  return getStaticPropertyName(prop.key) === "defaultValue";
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
    return {
      CallExpression(node) {
        if (!isTranslationCallee(node.callee)) return;

        const opts = unwrapExpression(node.arguments[1]);
        if (!opts || opts.type !== "ObjectExpression") return;

        const prop = opts.properties.find(isDefaultValueProperty);
        if (prop) {
          context.report({ node: prop, messageId: "noDefaultValue" });
        }
      },
    };
  },
};
