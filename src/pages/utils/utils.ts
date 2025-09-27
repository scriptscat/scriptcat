import { useRef } from "react";

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
