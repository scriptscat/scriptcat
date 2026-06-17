// 供应商 → 文字徽标 + 品牌色。new-ui 不引入 react-icons，统一用带品牌色的缩写徽标。
const providerBadges: Record<string, { text: string; color: string }> = {
  openai: { text: "AI", color: "#10a37f" },
  anthropic: { text: "An", color: "#d97706" },
  google: { text: "Ge", color: "#4285f4" },
  deepseek: { text: "DS", color: "#4d6bfe" },
  meta: { text: "Me", color: "#0668e1" },
  mistral: { text: "Mi", color: "#ff7000" },
  groq: { text: "Gq", color: "#f55036" },
  xai: { text: "X", color: "#111111" },
  perplexity: { text: "Px", color: "#20808d" },
  qwen: { text: "Q", color: "#615cf7" },
  moonshot: { text: "🌙", color: "#5b21b6" },
  zhipu: { text: "智", color: "#3366ff" },
  baidu: { text: "B", color: "#2932e1" },
  other: { text: "AI", color: "#6b7280" },
};

export default function ProviderIcon({ providerKey, size = 14 }: { providerKey: string; size?: number }) {
  const def = providerBadges[providerKey] ?? providerBadges.other;
  return (
    <span
      data-testid="provider-icon"
      data-provider={providerKey}
      style={{
        fontSize: size * 0.72,
        fontWeight: 700,
        color: def.color,
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {def.text}
    </span>
  );
}
