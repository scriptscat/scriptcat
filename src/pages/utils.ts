export const versionDisplay = (v: string | undefined) => (v?.startsWith("v") || !v ? `${v || ""}` : `v${v}`);
