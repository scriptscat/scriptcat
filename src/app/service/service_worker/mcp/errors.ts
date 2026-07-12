import type { BridgeErrorCode } from "./types";

// Thrown by McpApprovalService / McpBridge for any condition the bridge protocol models as a
// stable error code (one of BridgeErrorCode in ./types.ts). Never carries filesystem paths or
// stack traces in `message` — it crosses process boundaries to the MCP client and is shown to
// the agent, so it must stay a short, stable, non-sensitive string.
export class McpBridgeError extends Error {
  constructor(
    public readonly code: BridgeErrorCode,
    message: string,
    public readonly operationId?: string
  ) {
    super(message);
    this.name = "McpBridgeError";
  }
}
