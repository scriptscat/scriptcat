import { useRef } from "react";

// 使用 useStableCallbacks 能降低开支，但要避免读取 state。
// 因为不使用依赖检查, 不会检查依存state的更新来重新宣告 deps 物件里的function
export function useStableCallbacks<T extends (...args: any[]) => any, D extends Record<string, T>>(deps: D) {
  const objectRef = useRef<D>();
  if (!objectRef.current) {
    objectRef.current = {} as D;
    for (const key of Object.keys(deps) as (keyof D)[]) {
      objectRef.current[key] = ((...args: Parameters<D[typeof key]>) => {
        return deps[key](...args);
      }) as D[typeof key];
    }
  }
  return objectRef.current; // stable identity container
}
