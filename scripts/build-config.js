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

/**
 * 打包 profile 的合法取值。
 */
export const PACK_PROFILES = ["store-stable", "store-beta", "developer"];

/**
 * 强断言（doc 05 §1.3, doc 08 §5）：store 系 profile 的产物绝不能包含 nativeMessaging 权限，
 * 也不能有已编译进 bundle 的 MCP 主机集成代码；developer profile 在 MCP 开启时必须两者都有。
 * 纯函数，不做任何 I/O —— 调用方负责先扫描 dist 产物得到 nativeHostCompiledIn。
 * @param {{ profile: "store-stable" | "store-beta" | "developer", manifest: { permissions?: string[] }, mcpEnabled: boolean, nativeHostCompiledIn: boolean }} param
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
export function checkMcpPackProfileCompliance({ profile, manifest, mcpEnabled, nativeHostCompiledIn }) {
  const hasPermission = !!manifest.permissions?.includes("nativeMessaging");
  const isStoreProfile = profile === "store-stable" || profile === "store-beta";

  if (isStoreProfile) {
    if (hasPermission) {
      return {
        ok: false,
        reason: `pack profile "${profile}" must not contain the nativeMessaging permission, but it does.`,
      };
    }
    if (nativeHostCompiledIn) {
      return {
        ok: false,
        reason: `pack profile "${profile}" must not have MCP native-host integration code compiled into the bundle, but it does.`,
      };
    }
    return { ok: true };
  }

  // developer profile
  if (mcpEnabled) {
    if (!hasPermission) {
      return {
        ok: false,
        reason: `pack profile "${profile}" (MCP enabled) must contain the nativeMessaging permission, but it doesn't.`,
      };
    }
    if (!nativeHostCompiledIn) {
      return {
        ok: false,
        reason: `pack profile "${profile}" (MCP enabled) must have MCP native-host integration code compiled into the bundle, but it doesn't.`,
      };
    }
  }
  return { ok: true };
}
