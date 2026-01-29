export const ScriptEnvTag = {
  inject: "it",
  content: "ct",
} as const;

export type ScriptEnvTag = ValueOf<typeof ScriptEnvTag>;

export const ScriptEnvType = {
  inject: 1,
  content: 2,
} as const;

export type ScriptEnvType = ValueOf<typeof ScriptEnvType>;
