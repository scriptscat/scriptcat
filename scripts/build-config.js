/**
 * agent 功能仅在开发版与 beta 预发布版本中提供，正式版本屏蔽。
 * @param {{ isDev: boolean, isBeta: boolean }} env
 * @returns {boolean}
 */
export function isAgentEnabled({ isDev, isBeta }) {
  return Boolean(isDev || isBeta);
}

/**
 * 解析 agent 开关：环境变量 SC_ENABLE_AGENT 优先（用于 e2e/CI 或手动强制覆盖），
 * 未设置时按版本派生（dev/beta 启用，正式版屏蔽）。
 * @param {{ isDev: boolean, isBeta: boolean, envValue: string | undefined }} param
 * @returns {boolean}
 */
export function resolveAgentEnabled({ isDev, isBeta, envValue }) {
  if (envValue !== undefined) return envValue === "true";
  return isAgentEnabled({ isDev, isBeta });
}

/**
 * 正式版本不提供 agent，移除仅 agent 使用的 debugger 权限；
 * 其余权限保持不变。启用 agent 时原样返回，禁用时返回新对象，不修改入参。
 * @template {{ permissions?: string[] }} T
 * @param {T} manifest
 * @param {boolean} agentEnabled
 * @returns {T}
 */
export function applyAgentManifest(manifest, agentEnabled) {
  if (agentEnabled) return manifest;
  return {
    ...manifest,
    permissions: (manifest.permissions || []).filter((permission) => permission !== "debugger"),
  };
}
