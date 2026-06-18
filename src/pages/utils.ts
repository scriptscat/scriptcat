export const versionDisplay = (v: string | undefined) => (!v || v[0] == "v" ? `${v || ""}` : `v${v}`);
