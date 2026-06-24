/**
 * agent 功能仅在开发版与 beta 预发布版本中提供，正式版本屏蔽。
 * @param {{ isDev: boolean, isBeta: boolean }} env
 * @returns {boolean}
 */
export function isAgentEnabled({ isDev, isBeta }) {
  return Boolean(isDev || isBeta);
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
