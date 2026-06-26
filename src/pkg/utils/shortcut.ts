// 快捷键展示工具：根据操作系统渲染对应的修饰键
// - Mac：mod 显示为 ⌘ 图标，按 ⌃⌥⇧⌘ 顺序排列，符号间不加分隔符
// - Windows/Linux：mod 显示为 Ctrl，用 + 连接

const MOD_KEYS = new Set(["mod", "ctrl", "alt", "shift"]);
// Mac 修饰键展示顺序：Control → Option → Shift → Command
const MAC_ORDER = ["ctrl", "alt", "shift", "mod"];
const MAC_SYMBOL: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" };
const WIN_LABEL: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", mod: "Ctrl" };

/** 当前是否运行在 macOS 上 */
export function isMacOS(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform;
  if (platform) return /mac/i.test(platform);
  return /Mac/i.test(nav.userAgent || "");
}

/**
 * 将一组按键（修饰键用 mod/ctrl/alt/shift 表示，其余为实体键）格式化为展示文本。
 * @param keys 例如 ["mod", "shift", "S"]
 * @param isMac 是否为 Mac 平台，默认按当前系统判定
 */
export function formatShortcut(keys: string[], isMac: boolean = isMacOS()): string {
  const mods = keys.filter((k) => MOD_KEYS.has(k));
  const rest = keys.filter((k) => !MOD_KEYS.has(k));
  if (isMac) {
    const ordered = MAC_ORDER.filter((m) => mods.includes(m));
    return [...ordered.map((m) => MAC_SYMBOL[m]), ...rest].join("");
  }
  return [...mods.map((m) => WIN_LABEL[m]), ...rest].join("+");
}
