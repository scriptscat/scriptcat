import { useRef, useState } from "react";

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

export function useFnState<T>(initialValue: T) {
  type Updater<U> = U | ((old: U) => U);
  const { state, setter } = useRef({
    state: { val: initialValue },
    setter: (s: Updater<T>) => {
      setValFn((prev) => {
        const next = typeof s === "function" ? (s as (old: T) => T)(state.val) : s;
        // avoid re-render if value didn't change
        if (Object.is(state.val, next)) return prev;
        state.val = next;
        return () => state.val;
      });
    },
  }).current;
  const [valFn, setValFn] = useState<() => T>(() => () => state.val);

  return [valFn, setter] as const;
}
