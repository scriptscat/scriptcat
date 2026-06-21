import * as React from "react";

export type Theme = "light" | "dark" | "auto";

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

// 与 src/pages/common.ts 的预渲染脚本及 release/v1.4 (AppContext) 共用同一个键，
// 否则刷新时预渲染脚本读不到已保存主题，非 auto 用户会出现主题闪烁。
const STORAGE_KEY = "lightMode";

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// 订阅系统主题变化，供 useSyncExternalStore 使用
const subscribeSystemTheme = (onChange: () => void) => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const applyTheme = (resolved: "light" | "dark") => {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
};

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = "auto" }: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof localStorage === "undefined") return defaultTheme;
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) || defaultTheme;
  });

  // 订阅系统主题（外部可变源），auto 模式下随系统切换实时更新
  const systemTheme = React.useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => "light" as const);

  // resolvedTheme 可由 theme + systemTheme 推导，无需独立 state
  const resolvedTheme: "light" | "dark" = theme === "auto" ? systemTheme : theme;

  // 应用主题到 DOM
  React.useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
