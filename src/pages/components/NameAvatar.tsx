import type { ReactNode } from "react";
import { cn } from "@App/pkg/utils/cn";

// 名称播种的头像配色：把任意字符串哈希到 --label-* 令牌族的 8 个固定色调之一（明暗主题自动切换，详见 docs/design/tokens.md）。
// 脚本图标、订阅图标、供应商徽标共用此基元，标签 chip 也经 getTagColor 复用 getNameAvatarTone。
const NAME_AVATAR_TONES = [
  { bg: "bg-label-green-bg", text: "text-label-green-fg" },
  { bg: "bg-label-blue-bg", text: "text-label-blue-fg" },
  { bg: "bg-label-purple-bg", text: "text-label-purple-fg" },
  { bg: "bg-label-orange-bg", text: "text-label-orange-fg" },
  { bg: "bg-label-rose-bg", text: "text-label-rose-fg" },
  { bg: "bg-label-teal-bg", text: "text-label-teal-fg" },
  { bg: "bg-label-amber-bg", text: "text-label-amber-fg" },
  { bg: "bg-label-indigo-bg", text: "text-label-indigo-fg" },
] as const;

export type NameAvatarTone = (typeof NAME_AVATAR_TONES)[number];

export function getNameAvatarTone(seed: string): NameAvatarTone {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_AVATAR_TONES[((hash % NAME_AVATAR_TONES.length) + NAME_AVATAR_TONES.length) % NAME_AVATAR_TONES.length];
}

export function NameAvatar({
  seed,
  size = 28,
  rounded = "rounded-md",
  className,
  children,
}: {
  seed: string;
  size?: number;
  rounded?: string;
  className?: string;
  children: ReactNode;
}) {
  const tone = getNameAvatarTone(seed);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-xs font-semibold",
        rounded,
        tone.bg,
        tone.text,
        className
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
