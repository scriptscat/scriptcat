// 禁止在 className 里直接写原始调色板/十六进制颜色（如 bg-white、text-gray-500、dark:bg-gray-800、bg-[#fff]）。
// new-ui 必须走设计令牌（bg-background / text-foreground / bg-card / text-muted-foreground 等），
// 才能同时正确响应亮/暗主题。原始颜色是「设计保真度审计」里反复出现的硬性违规。
// 确属例外（如二维码固定白底）时，用 // eslint-disable-next-line scriptcat/no-raw-color-classname 并写明理由。

// 调色板族（含 white/black 与各灰阶系列）。匹配可选的数字深度（-500）。
const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|divide|from|via|to|outline|decoration|placeholder|caret|accent|shadow|ring-offset)-(?:white|black|slate|gray|zinc|neutral|stone)(?:-\d{1,3})?\b/;
// 任意值十六进制颜色，如 bg-[#fff] / text-[#112233]。
const ARBITRARY_HEX = /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-\[#[0-9a-fA-F]{3,8}\]/;

function findRawColor(text) {
  return PALETTE.exec(text)?.[0] ?? ARBITRARY_HEX.exec(text)?.[0] ?? null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "禁止 className 使用原始颜色，应使用设计令牌",
    },
    schema: [],
    messages: {
      rawColor:
        'className 禁止使用原始颜色 "{{cls}}"，请改用设计令牌（bg-background/text-foreground/bg-card 等）以同时适配亮/暗主题。',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "className" || !node.value) return;
        // 扫描整个 className 值文本，覆盖字符串字面量、模板字符串以及 cn(...) 等表达式里的类名。
        const cls = findRawColor(sourceCode.getText(node.value));
        if (cls) {
          context.report({ node: node.value, messageId: "rawColor", data: { cls } });
        }
      },
    };
  },
};
