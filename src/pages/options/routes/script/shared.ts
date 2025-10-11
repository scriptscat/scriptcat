import { type Script } from "@App/app/repo/scripts";

export const scriptDAOSync = new Map<string, Script>();

export const wScript = (s: string | Script, v?: Script) => {
  if (typeof s !== "string") {
    v = s as Script;
    s = v.uuid;
  }
  if (v) {
    return (scriptDAOSync.set(s as string, v), v);
  }
  v = scriptDAOSync.get(s);
  if (v) return v;
  throw new Error(`Script ${s} is undefined`);
};
