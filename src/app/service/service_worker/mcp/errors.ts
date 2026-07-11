import type { BridgeErrorCode } from "./types";

// Thrown by McpApprovalService / McpBridge for any condition the bridge protocol models as a
// stable error code (doc 03 §3). Never carries filesystem paths or stack traces in `message`.
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
