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

/**
 * 打包时解析 MCP 开关：所有 profile 默认关闭；仅 developer profile 或
 * 环境变量 SC_ENABLE_MCP === "true" 显式开启。store 系 profile 若被显式
 * 开启，由 pack.js 的强断言在产物层面拦截（fail loud），本函数不做限制。
 * @param {{ profile: "store-stable" | "store-beta" | "developer", enableEnv: string | undefined }} param
 * @returns {boolean}
 */
export function resolveMcpEnabled({ profile, enableEnv }) {
  if (enableEnv === "true") return true;
  if (enableEnv === "false") return false;
  return profile === "developer";
}

/**
 * 屏蔽 MCP 时移除 nativeMessaging 权限；启用时原样返回。
 * 与 applyAgentManifest 相同的不可变约定：屏蔽返回新对象，不修改入参。
 * @template {{ permissions?: string[] }} T
 * @param {T} manifest
 * @param {boolean} mcpEnabled
 * @returns {T}
 */
export function applyMcpManifest(manifest, mcpEnabled) {
  if (mcpEnabled) return manifest;
  return {
    ...manifest,
    permissions: (manifest.permissions || []).filter((permission) => permission !== "nativeMessaging"),
  };
}
