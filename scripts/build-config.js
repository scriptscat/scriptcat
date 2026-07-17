/**
 * 打包时解析 agent 开关：默认稳定版屏蔽、beta 开启；
 * 环境变量 SC_DISABLE_AGENT 显式覆盖（"true" 屏蔽 / "false" 开启）。
 * @param {{ isBeta: boolean, disableEnv: string | undefined }} param
 * @returns {boolean}
 */
export function resolveAgentEnabled({ isBeta, disableEnv }) {
  if (disableEnv === "true") return false;
  if (disableEnv === "false") return true;
  return isBeta;
}

/**
 * 屏蔽 agent 时移除仅 agent 使用的 debugger 权限，其余权限保持不变。
 * 启用 agent 时原样返回，屏蔽时返回新对象，不修改入参。
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
