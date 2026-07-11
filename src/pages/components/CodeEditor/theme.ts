// 将应用主题映射为 Monaco 内置主题
export function resolveMonacoTheme(resolvedTheme: "light" | "dark"): "vs" | "vs-dark" {
  return resolvedTheme === "dark" ? "vs-dark" : "vs";
}
