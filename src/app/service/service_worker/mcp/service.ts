import type { Group } from "@Packages/message/server";
import { McpClientDAO, McpAuditDAO, type McpClient, type McpAuditEvent, type McpOperation } from "@App/app/repo/mcp";
import type { McpApprovalService } from "./approval";
import type { OperationStatusResult, McpBridgeStatus, McpScope, PendingOperationSummary } from "./types";
import type { PendingPairing } from "./controller";

// Narrow surface McpUIService needs from McpController — status + write-session + pairing +
// the two destructive actions the settings page can trigger. Does not depend on connect()/
// stop() internals or the native-message routing McpController owns.
export interface McpControllerFacade {
  getStatus(): McpBridgeStatus;
  setWriteSessionActive(active: boolean): void;
  readWriteSessionActive(): Promise<boolean>;
  stop(): void;
  pair(code: string): void;
  notifyClientRevoked(clientId: string): void;
  getPendingPairing(): PendingPairing | undefined;
  decidePairing(pairingId: string, approved: boolean, grantedScopes: McpScope[]): void;
}

/**
 * Page-facing MCP endpoints, registered under the `mcp` Group. Deliberately does NOT include
 * `setEnabled` or `auditExport`: `mcp_enabled` already flows through the generic SystemConfig
 * get/set plumbing every other device-local setting uses, and audit export is a client-side
 * JSON.stringify + download over the same data `audit` already returns — adding a second
 * endpoint for it would just duplicate `audit` (AGENTS.md: no dead/duplicate code).
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
    this.group.on("writeSession", this.getWriteSession.bind(this));
    this.group.on("clients", this.getClients.bind(this));
    this.group.on("revokeClient", this.revokeClient.bind(this));
    this.group.on("revokeAllAndStop", this.revokeAllAndStop.bind(this));
    this.group.on("operation", this.getOperation.bind(this));
    this.group.on("operationDecision", this.decideOperation.bind(this));
    this.group.on("operationReopen", this.reopenOperation.bind(this));
    this.group.on("pendingOperations", this.getPendingOperations.bind(this));
    this.group.on("audit", this.getAudit.bind(this));
    this.group.on("auditClear", this.clearAudit.bind(this));
    this.group.on("pendingPairing", this.getPendingPairing.bind(this));
    this.group.on("pairingDecision", this.decidePairing.bind(this));
    this.group.on("pair", this.pair.bind(this));
  }

  // Ext↔daemon pairing: the user pasted the one-time code printed by `sctl pair`. Dials the daemon
  // in pairing mode; on success the daemon ships the long-term key and the controller persists it.
  pair(code: string): void {
    this.controller.pair(code);
  }

  getPendingPairing(): PendingPairing | undefined {
    return this.controller.getPendingPairing();
  }

  decidePairing(param: { pairingId: string; approved: boolean; grantedScopes: McpScope[] }): void {
    this.controller.decidePairing(param.pairingId, param.approved, param.grantedScopes);
  }

  getStatus(): McpBridgeStatus {
    return this.controller.getStatus();
  }

  setWriteSession(active: boolean): void {
    this.controller.setWriteSessionActive(active);
  }

  // 权威来源是 chrome.storage.session，而不是页面自己的 useState——SW 重启或多个设置页同时开着
  // 时，内存值可能已经不作数了。
  getWriteSession(): Promise<boolean> {
    return this.controller.readWriteSessionActive();
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

  decideOperation(param: {
    operationId: string;
    approved: boolean;
    enable?: boolean;
    rememberChoice?: "once" | "client";
  }): Promise<OperationStatusResult> {
    return this.approval.decide(param.operationId, param.approved, {
      enable: param.enable,
      rememberChoice: param.rememberChoice,
    });
  }

  // Re-opens a still-pending op's confirm page — the service-layer entry behind the popup/settings
  // "待确认" row (Task #7). Closing a confirm page does not reject (误关 ≠ 拒绝, §5.1); the op stays
  // pending until decided, disconnected, or TTL-expired, and this makes it addressable again.
  reopenOperation(operationId: string): Promise<void> {
    return this.approval.reopen(operationId);
  }

  // Data source for the popup/settings "待确认" list — the still-pending ops the row renders and
  // whose reopenOperation it calls.
  getPendingOperations(): Promise<PendingOperationSummary[]> {
    return this.approval.listPending();
  }

  getAudit(): Promise<McpAuditEvent[]> {
    return this.auditDAO.all();
  }

  clearAudit(): Promise<void> {
    return this.auditDAO.clear();
  }
}
