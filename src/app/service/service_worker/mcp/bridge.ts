import { uuidv4 } from "@App/pkg/utils/uuid";
import {
  type ScriptDAO,
  type ScriptCodeDAO,
  type Script,
  type SCRIPT_TYPE,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import type { McpClientDAO } from "@App/app/repo/mcp";
import { McpAuditDAO, type McpClient } from "@App/app/repo/mcp";
import type { McpWritePolicy } from "@App/pkg/config/config";
import type { McpApprovalService } from "./approval";
import { McpBridgeError } from "./errors";
import { readScriptSource } from "./source";
import {
  ACTION_REQUIRED_SCOPE,
  MCP_SCOPES,
  SCTL_CLI_CLIENT_ID,
  WRITE_ACTIONS,
  type BridgeAction,
  type McpBridgeRequest,
  type McpBridgeResponse,
  type OperationKind,
  type ScriptSummary,
  type ScriptType,
} from "./types";

// Re-exported from its single definition in source.ts (shared with the approval service).
export { MAX_SOURCE_BYTES } from "./source";

// The built-in sctl CLI identity, synthesized rather than read from McpClientDAO — the CLI never
// pairs (design §3.1). Full scope so every verb passes the scope gate; writes still hit the write
// policy + write-session gate + confirm page below. Never persisted, so it can't be revoked and
// never shows up in the paired-client list.
const SCTL_CLI_CLIENT: McpClient = {
  clientId: SCTL_CLI_CLIENT_ID,
  displayName: "sctl (CLI)",
  tokenHash: "",
  scopes: [...MCP_SCOPES],
  createdAt: 0,
  lastUsedAt: 0,
  revoked: false,
};

// Sentinel dispatch returns when a request is suspended pending a human decision (write approval
// or first-time source disclosure): no bridge.response is produced now — the decide/void event
// pushes it back later through the approval responder (design §5.1, event-driven not SW-Promise).
const DEFERRED = Symbol("mcp-deferred-response");

// Summary handed to the allow-policy write notification.
export interface McpWriteNotice {
  kind: OperationKind;
  name?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKeys(input: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new McpBridgeError("INVALID_REQUEST", `unexpected field: ${key}`);
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new McpBridgeError("INVALID_REQUEST", `${field} must be a UUID`);
  }
  return value;
}

// Strict, manual allow-list validation per action — any field not explicitly named here is
// rejected as INVALID_REQUEST. Every entry both rejects unexpected fields and asserts the ones
// it accepts.
const VALIDATORS: Record<BridgeAction, (input: unknown) => void> = {
  "scripts.list": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, []);
  },
  "scripts.metadata.get": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid"]);
    assertUuidField(input, "uuid");
  },
  "scripts.source.get": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid"]);
    assertUuidField(input, "uuid");
  },
  "scripts.install.request": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["url", "code"]);
    if (input.url !== undefined && typeof input.url !== "string") {
      throw new McpBridgeError("INVALID_REQUEST", "url must be a string");
    }
    if (input.code !== undefined && typeof input.code !== "string") {
      throw new McpBridgeError("INVALID_REQUEST", "code must be a string");
    }
    if (!!input.url === !!input.code) {
      throw new McpBridgeError("INVALID_REQUEST", "exactly one of url or code is required");
    }
  },
  "scripts.toggle.request": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid", "enable"]);
    assertUuidField(input, "uuid");
    if (typeof input.enable !== "boolean") {
      throw new McpBridgeError("INVALID_REQUEST", "enable must be a boolean");
    }
  },
  "scripts.delete.request": (input) => {
    if (!isPlainObject(input)) throw new McpBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid"]);
    assertUuidField(input, "uuid");
  },
};

function toScriptType(type: SCRIPT_TYPE): ScriptType {
  if (type === SCRIPT_TYPE_CRONTAB) return "crontab";
  if (type === SCRIPT_TYPE_BACKGROUND) return "background";
  return "normal";
}

function toSummary(script: Script): ScriptSummary {
  return {
    uuid: script.uuid,
    name: script.name,
    namespace: script.namespace,
    version: script.metadata.version?.[0],
    author: script.author,
    description: script.metadata.description?.[0],
    type: toScriptType(script.type),
    enabled: script.status === SCRIPT_STATUS_ENABLE,
    updatedAt: new Date(script.updatetime || script.createtime).toISOString(),
    // Metadata tier withholds the actual URL (may embed tokens) — only whether one exists.
    hasUpdateUrl: !!(script.checkUpdateUrl || script.downloadUrl),
  };
}

/**
 * Routes an already-received McpBridgeRequest to the extension's script/approval services,
 * re-checking scope from McpClientDAO on every call regardless of what the daemon already checked
 * before forwarding it — this is defense in depth, since the extension never trusts the daemon's
 * claim about a client's scopes alone; a compromised or buggy daemon can't grant a scope the
 * extension's own record doesn't have. Writes exactly one audit event per request.
 *
 * Write actions and first-time source disclosure are blocking (design §5.1): under the default
 * "approval" write policy they suspend — `handle` returns `null` (no response now) after opening a
 * confirm page, and the deferred `bridge.response` is emitted by the decide/void event. Under the
 * "allow" policy writes execute immediately and fire a notification (source disclosure is never
 * exempt — it is a privacy read, decision #12).
 */
export class McpBridge {
  constructor(
    private readonly scriptDAO: Pick<ScriptDAO, "all" | "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly clientDAO: Pick<McpClientDAO, "get">,
    private readonly approval: McpApprovalService,
    private readonly auditDAO: Pick<McpAuditDAO, "append"> = new McpAuditDAO(),
    private isWriteSessionActive: () => boolean = () => false,
    private getWritePolicy: () => Promise<McpWritePolicy> = async () => "approval",
    private readonly notifyWrite: (notice: McpWriteNotice) => void = () => {}
  ) {}

  // Lets the caller wire the write-session predicate after both McpBridge and McpController
  // exist, avoiding a circular construction dependency between the two (McpController needs a
  // constructed McpBridge; McpBridge's write-session check needs to read McpController's state).
  setWriteSessionChecker(checker: () => boolean): void {
    this.isWriteSessionActive = checker;
  }

  // daemon → bridge.cancel {requestId}: the requester (MCP client / CLI) timed out, Ctrl-C'd or
  // its WS session died. Void the matching pending op; its confirm page's next decide then fails
  // cleanly. First-terminal-wins arbitration vs a concurrent decide lives in the approval service.
  cancel(requestId: string): Promise<void> {
    return this.approval.cancelByRequestId(requestId);
  }

  async handle(request: McpBridgeRequest): Promise<McpBridgeResponse | null> {
    let client: McpClient | undefined;
    try {
      client = request.clientId === SCTL_CLI_CLIENT_ID ? SCTL_CLI_CLIENT : await this.clientDAO.get(request.clientId);
      if (!client || client.revoked) {
        throw new McpBridgeError("UNAUTHENTICATED", "unknown or revoked client");
      }
      const requiredScope = ACTION_REQUIRED_SCOPE[request.action];
      if (!client.scopes.includes(requiredScope)) {
        throw new McpBridgeError("INSUFFICIENT_SCOPE", `missing scope ${requiredScope}`);
      }
      if (WRITE_ACTIONS.includes(request.action) && !this.isWriteSessionActive()) {
        throw new McpBridgeError("WRITE_MODE_DISABLED", "write mode is off for this session");
      }

      const result = await this.dispatch(request, client);
      if (result === DEFERRED) {
        // Suspended pending a human decision — the confirm page is open, response comes later.
        await this.recordAudit(request, client, "awaiting_user");
        return null;
      }
      await this.recordAudit(request, client, "allowed", "success");
      return { requestId: request.requestId, ok: true, result };
    } catch (e) {
      const bridgeError = e instanceof McpBridgeError ? e : new McpBridgeError("INTERNAL_ERROR", "internal error");
      await this.recordAudit(request, client, "denied", "failure", bridgeError.code);
      return {
        requestId: request.requestId,
        ok: false,
        error: { code: bridgeError.code, message: bridgeError.message, operationId: bridgeError.operationId },
      };
    }
  }

  private async dispatch(request: McpBridgeRequest, client: McpClient): Promise<unknown> {
    VALIDATORS[request.action](request.input);
    const input = request.input as Record<string, unknown>;

    switch (request.action) {
      case "scripts.list": {
        const scripts = await this.scriptDAO.all();
        return { scripts: scripts.map(toSummary), contentTrust: "untrusted-user-script-metadata" };
      }
      case "scripts.metadata.get": {
        const script = await this.scriptDAO.get(input.uuid as string);
        if (!script) throw new McpBridgeError("NOT_FOUND", "script not found");
        return {
          ...toSummary(script),
          matches: script.metadata.match ?? [],
          includes: script.metadata.include ?? [],
          excludes: script.metadata.exclude ?? [],
          grants: script.metadata.grant ?? [],
          connects: script.metadata.connect ?? [],
          requires: script.metadata.require ?? [],
          resources: script.metadata.resource ?? [],
          runAt: script.metadata["run-at"]?.[0],
          crontab: script.metadata.crontab?.[0],
          contentTrust: "untrusted-user-script-metadata",
        };
      }
      case "scripts.source.get": {
        const uuid = input.uuid as string;
        // First-use-per-client disclosure gate: source may contain secrets, so unlike
        // scripts.list/metadata.get this read isn't unconditionally granted by the scope alone —
        // the human must approve it once per client per script (or forever, via "Allow for this
        // client"). Not exempt from blocking even under the "allow" write policy (decision #12).
        const disclosure = await this.approval.checkSourceDisclosure({
          clientId: request.clientId,
          uuid,
          requestingClientName: client.displayName,
          requestId: request.requestId,
        });
        if (disclosure !== "allowed") {
          // Blocking: suspend until the user decides; the source is returned by the decide event,
          // and a disconnect voids the op.
          await this.approval.present(disclosure.operationId);
          return DEFERRED;
        }
        return readScriptSource(this.scriptDAO, this.scriptCodeDAO, uuid);
      }
      case "scripts.install.request":
        return this.dispatchWrite(request, "install", (requestId) =>
          this.approval.prepareInstall({
            clientId: request.clientId,
            requestingClientName: client.displayName,
            url: input.url as string | undefined,
            code: input.code as string | undefined,
            requestId,
          })
        );
      case "scripts.toggle.request": {
        const enable = input.enable as boolean;
        return this.dispatchWrite(
          request,
          enable ? "enable" : "disable",
          (requestId) =>
            this.approval.requestToggle({
              clientId: request.clientId,
              uuid: input.uuid as string,
              enable,
              requestId,
            }),
          {}
        );
      }
      case "scripts.delete.request":
        return this.dispatchWrite(request, "delete", (requestId) =>
          this.approval.requestDelete({ clientId: request.clientId, uuid: input.uuid as string, requestId })
        );
    }
  }

  // Shared write dispatch: create the pending op, then branch on write policy.
  //  - "approval" (default): open the confirm page and suspend (return DEFERRED); the decide/void
  //    event emits the bridge.response later, addressed by the op's requestId.
  //  - "allow": execute immediately via decide(approved) and fire the notification; the op carries
  //    no requestId, so decide returns the result synchronously here instead of over the wire.
  // `decideOptions` is passed to decide on the allow path (install forces enable:false so a
  // freshly-installed script still defaults disabled — decision #12).
  private async dispatchWrite(
    request: McpBridgeRequest,
    kind: OperationKind,
    createOp: (requestId?: string) => Promise<{ operationId: string }>,
    decideOptions: { enable?: boolean } = { enable: false }
  ): Promise<unknown> {
    const policy = await this.getWritePolicy();
    if (policy === "allow") {
      const ref = await createOp(undefined);
      const result = await this.approval.decide(ref.operationId, true, decideOptions);
      this.notifyWrite({ kind, name: result.resultSummary?.name });
      return result;
    }
    const ref = await createOp(request.requestId);
    await this.approval.present(ref.operationId);
    return DEFERRED;
  }

  private async recordAudit(
    request: McpBridgeRequest,
    client: McpClient | undefined,
    decision: "allowed" | "denied" | "awaiting_user",
    result?: "success" | "failure",
    errorCode?: string
  ): Promise<void> {
    await this.auditDAO.append({
      eventId: uuidv4(),
      timestamp: Date.now(),
      clientId: request.clientId,
      clientName: client?.displayName ?? "",
      action: request.action,
      decision,
      result,
      errorCode,
      correlationId: request.requestId,
    });
  }
}
