import { cn } from "@App/pkg/utils/cn";
import { getNameAvatarTone } from "@App/pages/components/NameAvatar";

// 供应商 → 文字徽标。颜色统一走设计令牌,避免在明暗主题中散落品牌色字面值。
const providerBadges: Record<string, { text: string }> = {
  openai: { text: "AI" },
  anthropic: { text: "An" },
  google: { text: "Ge" },
  deepseek: { text: "DS" },
  meta: { text: "Me" },
  mistral: { text: "Mi" },
  groq: { text: "Gq" },
  xai: { text: "X" },
  perplexity: { text: "Px" },
  qwen: { text: "Q" },
  moonshot: { text: "🌙" },
  zhipu: { text: "智" },
  baidu: { text: "B" },
  other: { text: "AI" },
};

export default function ProviderIcon({ providerKey, size = 14 }: { providerKey: string; size?: number }) {
  const def = providerBadges[providerKey] ?? providerBadges.other;
  return (
    <span
      data-testid="provider-icon"
      data-provider={providerKey}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold leading-none",
        getNameAvatarTone(providerKey).text
      )}
      style={{
        fontSize: size * 0.72,
        width: size,
        height: size,
      }}
    >
      {def.text}
    </span>
  );
}
