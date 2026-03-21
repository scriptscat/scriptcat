import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * 响应式 hook，检测当前视口是否为移动端（< 768px）
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // 兼容旧版浏览器和 jsdom 测试环境
    if (typeof mql.addEventListener === "function" && typeof mql.removeEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } else if (typeof mql.addListener === "function" && typeof mql.removeListener === "function") {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  }, []);

  return isMobile;
}
