import { MCP_SCOPES, type BridgeAction, type McpScope } from "../shared/protocol.js";

export { MCP_SCOPES };
export type { McpScope };

export function hasScope(clientScopes: readonly McpScope[], required: McpScope): boolean {
  return clientScopes.includes(required);
}

export function hasAnyWriteScope(clientScopes: readonly McpScope[]): boolean {
  return clientScopes.some((scope) => scope.endsWith(":request"));
}

function isOperationAction(action: BridgeAction): boolean {
  return action.startsWith("operations.");
}

/**
 * Filters the bridge action catalog down to what a client's granted scopes make visible in
 * `tools/list` (doc 03 §5). operations.get/list/cancel are visible to any client holding at
 * least one write scope — ownership, not a fixed scope, is the real per-call gate enforced by
 * the extension bridge (mcp/bridge.ts); everything else needs its own exact required scope.
 */
export function visibleActions(
  clientScopes: readonly McpScope[],
  actionRequiredScope: Record<BridgeAction, McpScope>
): BridgeAction[] {
  return (Object.keys(actionRequiredScope) as BridgeAction[]).filter((action) =>
    isOperationAction(action) ? hasAnyWriteScope(clientScopes) : clientScopes.includes(actionRequiredScope[action])
  );
}
