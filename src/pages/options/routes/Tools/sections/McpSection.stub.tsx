// Build-time stand-in for McpSection.tsx when EnableMCP is false (rspack.config.ts
// NormalModuleReplacementPlugin). Tools/index.tsx already guards rendering with
// `{EnableMCP && <McpSection .../>}`, so this never renders — its purpose is purely to keep the
// real component (and its transitive MCPClient/mcp-repo-type imports) out of store builds
// deterministically, since JSX-conditional tree-shaking across module boundaries isn't reliable
// enough to satisfy that guarantee on its own (workspace/.ref-docs/05-extension-implementation.md
// §1.3, doc 08 §5).
export function McpSection(): null {
  return null;
}
