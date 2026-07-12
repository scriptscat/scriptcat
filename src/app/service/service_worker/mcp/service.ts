import type { Group } from "@Packages/message/server";
import { McpClientDAO, McpAuditDAO, type McpClient, type McpAuditEvent, type McpOperation } from "@App/app/repo/mcp";
import type { McpApprovalService } from "./approval";
import type { OperationStatusResult, McpBridgeStatus } from "./types";

// Narrow surface McpUIService needs from McpController — status + write-session + the two
// destructive actions the settings page can trigger. Does not depend on connect()/stop()
// internals or the native-message routing McpController owns.
export interface McpControllerFacade {
  getStatus(): McpBridgeStatus;
  setWriteSessionActive(active: boolean): void;
  stop(): void;
  notifyClientRevoked(clientId: string): void;
}

/**
 * Page-facing MCP endpoints (doc 05 §4.5), registered under the `mcp` Group. Deliberately does
 * NOT include `setEnabled` or `auditExport`: `mcp_enabled` already flows through the generic
 * SystemConfig get/set plumbing every other device-local setting uses (doc 05 §5.3), and audit
 * export is a client-side JSON.stringify + download over the same data `audit` already returns
 * — adding a second endpoint for it would just duplicate `audit` (AGENTS.md: no dead/duplicate
 * code). `pairingDecision` is deferred to the commit that adds the pairing dialog and the
 * corresponding `pair.request` handling in McpController — it would have nothing to call yet.
 */
export class McpUIService {
  constructor(
    private readonly group: Group,
    private readonly controller: McpControllerFacade,
    private readonly approval: McpApprovalService,
    private readonly clientDAO: Pick<McpClientDAO, "all" | "get" | "save"> = new McpClientDAO(),
    private readonly auditDAO: Pick<McpAuditDAO, "all" | "clear"> = new McpAuditDAO()
  ) {}

  init(): void {
    this.group.on("status", this.getStatus.bind(this));
    this.group.on("setWriteSession", this.setWriteSession.bind(this));
    this.group.on("clients", this.getClients.bind(this));
    this.group.on("revokeClient", this.revokeClient.bind(this));
    this.group.on("revokeAllAndStop", this.revokeAllAndStop.bind(this));
    this.group.on("operation", this.getOperation.bind(this));
    this.group.on("operationDecision", this.decideOperation.bind(this));
    this.group.on("audit", this.getAudit.bind(this));
    this.group.on("auditClear", this.clearAudit.bind(this));
  }

  getStatus(): McpBridgeStatus {
    return this.controller.getStatus();
  }

  setWriteSession(active: boolean): void {
    this.controller.setWriteSessionActive(active);
  }

  getClients(): Promise<McpClient[]> {
    return this.clientDAO.all();
  }

  async revokeClient(clientId: string): Promise<void> {
    const client = await this.clientDAO.get(clientId);
    if (!client) return;
    await this.clientDAO.save({ ...client, revoked: true });
    this.controller.notifyClientRevoked(clientId);
  }

  async revokeAllAndStop(): Promise<void> {
    const clients = await this.clientDAO.all();
    await Promise.all(clients.filter((c) => !c.revoked).map((c) => this.clientDAO.save({ ...c, revoked: true })));
    this.controller.stop();
  }

  getOperation(operationId: string): Promise<(McpOperation & { requestingClientName?: string }) | undefined> {
    return this.approval.getOperationForUI(operationId);
  }

  decideOperation(param: { operationId: string; approved: boolean; enable?: boolean }): Promise<OperationStatusResult> {
    return this.approval.decide(param.operationId, param.approved, { enable: param.enable });
  }

  getAudit(): Promise<McpAuditEvent[]> {
    return this.auditDAO.all();
  }

  clearAudit(): Promise<void> {
    return this.auditDAO.clear();
  }
}
