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

export const FIREFOX_SANDBOX_CSP =
  "sandbox allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-storage-access-by-user-activation allow-top-navigation allow-top-navigation-by-user-activation allow-top-navigation-to-custom-protocols; script-src 'unsafe-inline' 'unsafe-eval' https: http: data: blob: 'self';";

/**
 * Firefox MV3 的 sandbox manifest 支持要求显式声明 CSP；Chrome 继续使用原有 manifest。
 * @template {object} T
 * @param {T} manifest
 * @returns {T & { content_security_policy: { sandbox: string } }}
 */
export function applyFirefoxSandboxManifest(manifest) {
  return {
    ...manifest,
    content_security_policy: {
      sandbox: FIREFOX_SANDBOX_CSP,
    },
  };
}
