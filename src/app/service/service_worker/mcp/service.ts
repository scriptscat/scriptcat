import type { Group } from "@Packages/message/server";
import type { SystemConfig } from "@App/pkg/config/config";
import type { McpOperation } from "@App/app/repo/mcp";
import type { McpApprovalService } from "./approval";
import type { OperationStatusResult, McpBridgeStatus, PendingOperationSummary } from "./types";

// Narrow surface McpUIService needs from McpController — flat trust leaves only the status read and
// the enrollment dial; the settings page reads/writes the two policies + mcp_enabled directly via
// the generic SystemConfig plumbing.
export interface McpControllerFacade {
  getStatus(): McpBridgeStatus;
  enroll(code: string): void;
  stop(): void;
}

/**
 * Page-facing 外部接入 endpoints, registered under the `mcp` Group. Deliberately does NOT include
 * `setEnabled` or the two policies: those flow through the generic SystemConfig get/set plumbing
 * every other device-local setting uses. Audit is not served here either — it lives in the shared
 * logger and the card deep-links to the log page (design §4).
 */
export class McpUIService {
  constructor(
    private readonly group: Group,
    private readonly controller: McpControllerFacade,
    private readonly approval: McpApprovalService,
    private readonly systemConfig: SystemConfig
  ) {}

  init(): void {
    this.group.on("status", this.getStatus.bind(this));
    this.group.on("enroll", this.enroll.bind(this));
    this.group.on("operation", this.getOperation.bind(this));
    this.group.on("operationDecision", this.decideOperation.bind(this));
    this.group.on("operationReopen", this.reopenOperation.bind(this));
    this.group.on("pendingOperations", this.getPendingOperations.bind(this));
    this.group.on("stopExternalAccess", this.stopExternalAccess.bind(this));
  }

  // Enrollment (接入): the user ran `sctl connect` and typed its one-time terminal code into the
  // dialog. Dials the daemon in pairing mode; on success the daemon ships the long-term key K and
  // the controller persists it — CLI + every MCP client then inherit that single enrollment.
  enroll(code: string): void {
    this.controller.enroll(code);
  }

  getStatus(): McpBridgeStatus {
    return this.controller.getStatus();
  }

  getOperation(operationId: string): Promise<McpOperation | undefined> {
    return this.approval.getOperationForUI(operationId);
  }

  decideOperation(param: {
    operationId: string;
    approved: boolean;
    enable?: boolean;
    rememberSession?: boolean;
  }): Promise<OperationStatusResult> {
    return this.approval.decide(param.operationId, param.approved, {
      enable: param.enable,
      rememberSession: param.rememberSession,
    });
  }

  // Re-opens a still-pending op's confirm page — the entry behind the "待确认" reopen row. Closing a
  // confirm page does not reject (误关 ≠ 拒绝, §5.1); the op stays pending until decided,
  // disconnected, or TTL-expired, and this makes it addressable again.
  reopenOperation(operationId: string): Promise<void> {
    return this.approval.reopen(operationId);
  }

  getPendingOperations(): Promise<PendingOperationSummary[]> {
    return this.approval.listPending();
  }

  // "停止外部接入" kill switch (design §2.3): discard the long-term key K so a re-enrollment is
  // required, drop all 本会话允许 grants, stop the connection, and flip the feature off.
  async stopExternalAccess(): Promise<void> {
    this.systemConfig.setMcpPairing(undefined);
    await this.approval.clearSessionAllow();
    this.controller.stop();
    this.systemConfig.setMcpEnabled(false);
  }
}
