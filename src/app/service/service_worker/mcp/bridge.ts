import {
  type ScriptDAO,
  type ScriptCodeDAO,
  type Script,
  type SCRIPT_TYPE,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import type { McpWritePolicy, McpSourceReadPolicy } from "@App/pkg/config/config";
import type { McpApprovalService } from "./approval";
import { McpBridgeError } from "./errors";
import { readScriptSource } from "./source";
import { logLocalAccess, type LocalAccessAudit } from "./audit";
import {
  type BridgeAction,
  type McpBridgeRequest,
  type McpBridgeResponse,
  type OperationKind,
  type ScriptSummary,
  type ScriptType,
} from "./types";

// Re-exported from its single definition in source.ts (shared with the approval service).
export { MAX_SOURCE_BYTES } from "./source";

// Sentinel dispatch returns when a request is suspended pending a human decision (write approval
// or source read under the "approval" policy): no bridge.response is produced now — the decide/void
// event pushes it back later through the approval responder (design §5.1, event-driven not SW-Promise).
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

// Best-effort target uuid for audit attribution (present on every action except list/install).
function auditUuid(request: McpBridgeRequest): string | undefined {
  const input = request.input;
  return isPlainObject(input) && typeof input.uuid === "string" ? input.uuid : undefined;
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
 * Routes an already-authenticated McpBridgeRequest to the extension's script/approval services.
 *
 * Trust is flat (design §2.3): enrollment established the ext↔sctl channel key K, and every client
 * (CLI or MCP agent) that reaches sctl inherits that trust — there is no per-client scope or token.
 * `request.clientId` is therefore an audit label only (sctl's per-connection session id / self-
 * reported name), never an authorization key. The remaining human gates are the two global policies:
 *
 *  - Writes (install/toggle/delete) → the write policy. "approval" (default) suspends behind a
 *    confirm surface (design §5.1: `handle` returns `null`, the deferred bridge.response is emitted
 *    by the decide/void event); "allow" executes immediately and fires a notification.
 *  - Source reads (scripts.source.get) → the source-read policy, same two modes. Source is a privacy
 *    read, so it keeps its own gate and — unlike the old model — is no longer CLI-exempt (§2.3).
 *
 * The "本会话允许" third tier is applied inside McpApprovalService.present(): a session-allowed
 * (script, kind) auto-approves without opening a page. Writes exactly one audit event per request.
 */
export class McpBridge {
  constructor(
    private readonly scriptDAO: Pick<ScriptDAO, "all" | "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly approval: McpApprovalService,
    private getWritePolicy: () => Promise<McpWritePolicy> = async () => "approval",
    private getSourceReadPolicy: () => Promise<McpSourceReadPolicy> = async () => "approval",
    private readonly notifyWrite: (notice: McpWriteNotice) => void = () => {},
    private readonly audit: LocalAccessAudit = logLocalAccess
  ) {}

  // daemon → bridge.cancel {requestId}: the requester (MCP client / CLI) timed out, Ctrl-C'd or
  // its WS session died. Void the matching pending op; its confirm page's next decide then fails
  // cleanly. First-terminal-wins arbitration vs a concurrent decide lives in the approval service.
  cancel(requestId: string): Promise<void> {
    return this.approval.cancelByRequestId(requestId);
  }

  async handle(request: McpBridgeRequest): Promise<McpBridgeResponse | null> {
    try {
      const result = await this.dispatch(request);
      if (result === DEFERRED) {
        // Suspended pending a human decision — the confirm surface is open, response comes later.
        this.audit({
          client: request.clientId,
          action: request.action,
          decision: "awaiting_user",
          uuid: auditUuid(request),
          requestId: request.requestId,
        });
        return null;
      }
      this.audit({
        client: request.clientId,
        action: request.action,
        decision: "allowed",
        result: "success",
        uuid: auditUuid(request),
        requestId: request.requestId,
      });
      return { requestId: request.requestId, ok: true, result };
    } catch (e) {
      const bridgeError = e instanceof McpBridgeError ? e : new McpBridgeError("INTERNAL_ERROR", "internal error");
      this.audit({
        client: request.clientId,
        action: request.action,
        decision: "denied",
        result: "failure",
        errorCode: bridgeError.code,
        uuid: auditUuid(request),
        requestId: request.requestId,
      });
      return {
        requestId: request.requestId,
        ok: false,
        error: { code: bridgeError.code, message: bridgeError.message, operationId: bridgeError.operationId },
      };
    }
  }

  private async dispatch(request: McpBridgeRequest): Promise<unknown> {
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
        // Source may embed secrets, so it keeps its own gate independent of list/metadata reads.
        // "allow" reads immediately (for CLI and MCP alike — no exemption); "approval" suspends
        // behind a confirm page, and present() auto-approves it if this (script, source) pair was
        // marked "本会话允许" earlier this session.
        if ((await this.getSourceReadPolicy()) === "allow") {
          return readScriptSource(this.scriptDAO, this.scriptCodeDAO, uuid);
        }
        const ref = await this.approval.requestSourceDisclosure({
          clientId: request.clientId,
          uuid,
          requestId: request.requestId,
        });
        await this.approval.present(ref.operationId);
        return DEFERRED;
      }
      case "scripts.install.request":
        // Install defaults to enabled under "allow" (即装即用, design §6) — the confirm-page path
        // instead honours the install page's own enable switch.
        return this.dispatchWrite(
          request,
          "install",
          (requestId) =>
            this.approval.prepareInstall({
              clientId: request.clientId,
              url: input.url as string | undefined,
              code: input.code as string | undefined,
              requestId,
            }),
          { enable: true }
        );
      case "scripts.toggle.request": {
        const enable = input.enable as boolean;
        return this.dispatchWrite(request, enable ? "enable" : "disable", (requestId) =>
          this.approval.requestToggle({ clientId: request.clientId, uuid: input.uuid as string, enable, requestId })
        );
      }
      case "scripts.delete.request":
        return this.dispatchWrite(request, "delete", (requestId) =>
          this.approval.requestDelete({ clientId: request.clientId, uuid: input.uuid as string, requestId })
        );
    }
  }

  // Shared write dispatch: create the pending op, then branch on the write policy.
  //  - "approval" (default): open the confirm surface and suspend (return DEFERRED); the decide/void
  //    event emits the bridge.response later, addressed by the op's requestId. present() short-
  //    circuits to an auto-approval when the (script, kind) is session-allowed.
  //  - "allow": execute immediately via decide(approved) and fire the notification; the op carries
  //    no requestId, so decide returns the result synchronously here instead of over the wire.
  private async dispatchWrite(
    request: McpBridgeRequest,
    kind: OperationKind,
    createOp: (requestId?: string) => Promise<{ operationId: string }>,
    decideOptions: { enable?: boolean } = {}
  ): Promise<unknown> {
    if ((await this.getWritePolicy()) === "allow") {
      const ref = await createOp(undefined);
      const result = await this.approval.decide(ref.operationId, true, decideOptions);
      this.notifyWrite({ kind, name: result.resultSummary?.name });
      return result;
    }
    const ref = await createOp(request.requestId);
    await this.approval.present(ref.operationId);
    return DEFERRED;
  }
}
