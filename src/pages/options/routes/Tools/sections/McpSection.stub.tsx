// Build-time stand-in for McpSection.tsx when EnableMCP is false (rspack.config.ts
// NormalModuleReplacementPlugin). Tools/index.tsx already guards rendering with
// `{EnableMCP && <McpSection .../>}`, so this never renders — its purpose is purely to keep the
// real component (and its transitive MCPClient/mcp-repo-type imports) out of store builds
// deterministically. JSX-conditional tree-shaking across module boundaries alone was verified
// unreliable for this (grepping the built store-profile bundle still showed McpSection's strings
// present when only the `{EnableMCP && ...}` guard was relied on), so this module-replacement
// approach guarantees exclusion at the module-resolution level instead.
export function McpSection(): null {
  return null;
}
