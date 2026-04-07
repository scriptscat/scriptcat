import { SiOpenai, SiAnthropic, SiGooglegemini, SiMeta, SiPerplexity } from "react-icons/si";
import type { IconType } from "react-icons";

// 供应商 → 图标 + 颜色
const providerIcons: Record<string, { icon: IconType; color: string }> = {
  openai: { icon: SiOpenai, color: "#10a37f" },
  anthropic: { icon: SiAnthropic, color: "#d97706" },
  google: { icon: SiGooglegemini, color: "#4285f4" },
  meta: { icon: SiMeta, color: "#0668e1" },
  perplexity: { icon: SiPerplexity, color: "#20808d" },
};

// 没有 react-icons 的供应商用文字缩写
const providerTextIcons: Record<string, { text: string; color: string }> = {
  deepseek: { text: "DS", color: "#4d6bfe" },
  mistral: { text: "M", color: "#ff7000" },
  groq: { text: "G", color: "#f55036" },
  xai: { text: "X", color: "#000000" },
  qwen: { text: "Q", color: "#615cf7" },
  moonshot: { text: "🌙", color: "#5b21b6" },
  zhipu: { text: "智", color: "#3366ff" },
  baidu: { text: "B", color: "#2932e1" },
  other: { text: "AI", color: "#6b7280" },
};

export default function ProviderIcon({ providerKey, size = 14 }: { providerKey: string; size?: number }) {
  const iconDef = providerIcons[providerKey];
  if (iconDef) {
    const Icon = iconDef.icon;
    return <Icon size={size} color={iconDef.color} style={{ flexShrink: 0 }} />;
  }

  const textDef = providerTextIcons[providerKey];
  if (textDef) {
    return (
      <span
        style={{
          fontSize: size * 0.7,
          fontWeight: 700,
          color: textDef.color,
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {textDef.text}
      </span>
    );
  }

  return null;
}
