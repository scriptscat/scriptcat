import {
  type ScriptDAO,
  type ScriptCodeDAO,
  type Script,
  type SCRIPT_TYPE,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import type { ExternalAccessWritePolicy, ExternalAccessSourceReadPolicy } from "@App/pkg/config/config";
import type { ExternalAccessApprovalService } from "./approval";
import { ExternalAccessBridgeError } from "./errors";
import {
  readScriptSource,
  grepScriptSource,
  assertLineWindow,
  assertGrepParams,
  MAX_SOURCE_BYTES,
  type TextEdit,
} from "./source";
import { logExternalAccess, type ExternalAccessAudit } from "./audit";
import {
  type BridgeAction,
  type ExternalAccessBridgeRequest,
  type ExternalAccessBridgeResponse,
  type OperationKind,
  type ScriptSummary,
  type ScriptType,
} from "./types";

// Re-exported from its single definition in source.ts (shared with the approval service).
export { MAX_SOURCE_BYTES } from "./source";

// Sentinel dispatch returns when a request is suspended pending a human decision (write approval
// or source read under the "approval" policy): no JSON-RPC response is produced now — the decide/void
// event pushes it back later through the approval responder (design §5.1, event-driven not SW-Promise).
const DEFERRED = Symbol("external-access-deferred-response");

// Summary handed to the allow-policy write notification.
export interface ExternalAccessWriteNotice {
  kind: OperationKind;
  name?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKeys(input: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", `unexpected field: ${key}`);
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", `${field} must be a UUID`);
  }
  return value;
}

// Best-effort target uuid for audit attribution (present on every action except list/install).
function auditUuid(request: ExternalAccessBridgeRequest): string | undefined {
  const input = request.input;
  return isPlainObject(input) && typeof input.uuid === "string" ? input.uuid : undefined;
}

// Strict, manual allow-list validation per action — any field not explicitly named here is
// rejected as INVALID_REQUEST. Every entry both rejects unexpected fields and asserts the ones
// it accepts.
const VALIDATORS: Record<BridgeAction, (input: unknown) => void> = {
  "scripts.list": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, []);
  },
  "scripts.metadata.get": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid"]);
    assertUuidField(input, "uuid");
  },
  "scripts.source.get": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid", "startLine", "endLine", "maxBytes"]);
    assertUuidField(input, "uuid");
    if (input.startLine !== undefined && typeof input.startLine !== "number") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "startLine must be a number");
    }
    if (input.endLine !== undefined && typeof input.endLine !== "number") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "endLine must be a number");
    }
    if (
      input.maxBytes !== undefined &&
      (!Number.isInteger(input.maxBytes) ||
        (input.maxBytes as number) < 1 ||
        (input.maxBytes as number) > MAX_SOURCE_BYTES)
    ) {
      throw new ExternalAccessBridgeError(
        "INVALID_REQUEST",
        `maxBytes must be an integer between 1 and ${MAX_SOURCE_BYTES}`
      );
    }
    assertLineWindow(input.startLine as number | undefined, input.endLine as number | undefined);
  },
  "scripts.source.grep": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid", "query", "mode", "ignoreCase", "contextLines", "maxMatches"]);
    assertUuidField(input, "uuid");
    if (typeof input.query !== "string") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "query must be a string");
    }
    if (input.mode !== undefined && input.mode !== "text" && input.mode !== "regex") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", 'mode must be "text" or "regex"');
    }
    if (input.ignoreCase !== undefined && typeof input.ignoreCase !== "boolean") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "ignoreCase must be a boolean");
    }
    if (input.contextLines !== undefined && typeof input.contextLines !== "number") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "contextLines must be a number");
    }
    if (input.maxMatches !== undefined && typeof input.maxMatches !== "number") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "maxMatches must be a number");
    }
    assertGrepParams(input.query as string, {
      mode: input.mode as "text" | "regex" | undefined,
      ignoreCase: input.ignoreCase as boolean | undefined,
      contextLines: input.contextLines as number | undefined,
      maxMatches: input.maxMatches as number | undefined,
    });
  },
  "scripts.install.request": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["url", "code"]);
    if (input.url !== undefined && typeof input.url !== "string") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "url must be a string");
    }
    if (input.code !== undefined && typeof input.code !== "string") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "code must be a string");
    }
    if (!!input.url === !!input.code) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "exactly one of url or code is required");
    }
  },
  "scripts.toggle.request": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid", "enable"]);
    assertUuidField(input, "uuid");
    if (typeof input.enable !== "boolean") {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "enable must be a boolean");
    }
  },
  "scripts.delete.request": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid"]);
    assertUuidField(input, "uuid");
  },
  "scripts.edit.request": (input) => {
    if (!isPlainObject(input)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "input must be an object");
    assertKeys(input, ["uuid", "edits"]);
    assertUuidField(input, "uuid");
    if (!Array.isArray(input.edits) || input.edits.length === 0) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "edits must be a non-empty array");
    }
    // Only the wire shape here; anchoring (uniqueness, hit count, resulting size) needs the script
    // itself and is judged in the approval service — still before any confirm page opens.
    for (const edit of input.edits) {
      if (!isPlainObject(edit)) throw new ExternalAccessBridgeError("INVALID_REQUEST", "each edit must be an object");
      assertKeys(edit, ["oldText", "newText", "replaceAll"]);
      if (typeof edit.oldText !== "string") {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", "oldText must be a string");
      }
      if (typeof edit.newText !== "string") {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", "newText must be a string");
      }
      if (edit.replaceAll !== undefined && typeof edit.replaceAll !== "boolean") {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", "replaceAll must be a boolean");
      }
    }
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
 * Routes an already-authenticated ExternalAccessBridgeRequest to the extension's script/approval services.
 *
 * Trust is flat (design §2.3): enrollment established the ext↔sctl channel key K, and every client
 * (CLI or MCP agent) that reaches sctl inherits that trust — there is no per-client scope or token.
 * `request.clientId` is therefore an audit label only (sctl's per-connection session id / self-
 * reported name), never an authorization key. The remaining human gates are the two global policies:
 *
 *  - Writes (install/toggle/delete) → the write policy. "approval" (default) suspends behind a
 *    confirm surface (design §5.1: `handle` returns `null`, the deferred JSON-RPC response is emitted
 *    by the decide/void event); "allow" executes immediately and fires a notification.
 *  - Source reads (scripts.source.get) → the source-read policy, same two modes. Source is a privacy
 *    read, so it keeps its own gate and — unlike the old model — is no longer CLI-exempt (§2.3).
 *
 * The "本会话允许" third tier is applied inside ExternalAccessApprovalService.present(): a session-allowed
 * (script, kind) auto-approves without opening a page. Writes exactly one audit event per request.
 */
export class ExternalAccessBridge {
  constructor(
    private readonly scriptDAO: Pick<ScriptDAO, "all" | "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly approval: ExternalAccessApprovalService,
    private getWritePolicy: () => Promise<ExternalAccessWritePolicy> = async () => "approval",
    private getSourceReadPolicy: () => Promise<ExternalAccessSourceReadPolicy> = async () => "approval",
    private readonly notifyWrite: (notice: ExternalAccessWriteNotice) => void = () => {},
    private readonly audit: ExternalAccessAudit = logExternalAccess
  ) {}

  // daemon → $/cancelRequest {id}: the requester (MCP client / CLI) timed out, Ctrl-C'd or
  // its WS session died. Void the matching pending op; its confirm page's next decide then fails
  // cleanly. First-terminal-wins arbitration vs a concurrent decide lives in the approval service.
  cancel(requestId?: string): Promise<void> {
    return requestId ? this.approval.cancelByRequestId(requestId) : this.approval.cancelAllPending();
  }

  async handle(request: ExternalAccessBridgeRequest): Promise<ExternalAccessBridgeResponse | null> {
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
      const bridgeError =
        e instanceof ExternalAccessBridgeError ? e : new ExternalAccessBridgeError("INTERNAL_ERROR", "internal error");
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

  private async dispatch(request: ExternalAccessBridgeRequest): Promise<unknown> {
    VALIDATORS[request.action](request.input);
    const input = request.input as Record<string, unknown>;

    switch (request.action) {
      case "scripts.list": {
        const scripts = await this.scriptDAO.all();
        return { scripts: scripts.map(toSummary), contentTrust: "untrusted-user-script-metadata" };
      }
      case "scripts.metadata.get": {
        const script = await this.scriptDAO.get(input.uuid as string);
        if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
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
        const startLine = input.startLine as number | undefined;
        const endLine = input.endLine as number | undefined;
        const maxBytes = input.maxBytes as number | undefined;
        // Source may embed secrets, so it keeps its own gate independent of list/metadata reads.
        // "allow" reads immediately (for CLI and MCP alike — no exemption); "approval" suspends
        // behind a confirm page, and present() auto-approves it if this (script, source) pair was
        // marked "本会话允许" earlier this session.
        if ((await this.getSourceReadPolicy()) === "allow") {
          return readScriptSource(this.scriptDAO, this.scriptCodeDAO, uuid, startLine, endLine, maxBytes);
        }
        const ref = await this.approval.requestSourceDisclosure({
          clientId: request.clientId,
          uuid,
          requestId: request.requestId,
          form: { form: "full", startLine, endLine, maxBytes },
        });
        await this.approval.present(ref.operationId);
        return DEFERRED;
      }
      case "scripts.source.grep": {
        const uuid = input.uuid as string;
        const query = input.query as string;
        const mode = (input.mode as "text" | "regex" | undefined) ?? "text";
        const ignoreCase = (input.ignoreCase as boolean | undefined) ?? false;
        const contextLines = (input.contextLines as number | undefined) ?? 0;
        const maxMatches = (input.maxMatches as number | undefined) ?? 50;
        // Grep discloses source content one match at a time, so it shares scripts.source.get's
        // gate byte for byte: same scope, same policy, same sessionAllowKey (design §3 决策 13).
        if ((await this.getSourceReadPolicy()) === "allow") {
          return grepScriptSource(this.scriptDAO, this.scriptCodeDAO, uuid, query, {
            mode,
            ignoreCase,
            contextLines,
            maxMatches,
          });
        }
        const ref = await this.approval.requestSourceDisclosure({
          clientId: request.clientId,
          uuid,
          requestId: request.requestId,
          form: { form: "grep", query, mode, ignoreCase, contextLines, maxMatches },
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
      case "scripts.edit.request":
        // No decideOptions: an edit carries no enable decision, so the script keeps whatever
        // enabled state it already had (design §5「启用状态必须保留」).
        return this.dispatchWrite(request, "update", (requestId) =>
          this.approval.requestEdit({
            clientId: request.clientId,
            uuid: input.uuid as string,
            edits: input.edits as TextEdit[],
            requestId,
          })
        );
    }
  }

  // Shared write dispatch: create the pending op, then branch on the write policy.
  //  - "approval" (default): open the confirm surface and suspend (return DEFERRED); the decide/void
  //    event emits the JSON-RPC response later, addressed by the operation's request ID. present() short-
  //    circuits to an auto-approval when the (script, kind) is session-allowed.
  //  - "allow": execute immediately via decide(approved) and fire the notification; the op carries
  //    no requestId, so decide returns the result synchronously here instead of over the wire.
  private async dispatchWrite(
    request: ExternalAccessBridgeRequest,
    kind: OperationKind,
    createOp: (requestId?: string) => Promise<{ operationId: string }>,
    decideOptions: { enable?: boolean } = {}
  ): Promise<unknown> {
    if ((await this.getWritePolicy()) === "allow") {
      const ref = await createOp(undefined);
      const result = await this.approval.decideForBridge(ref.operationId, decideOptions);
      const name = typeof result === "object" && result !== null && "name" in result ? String(result.name) : undefined;
      this.notifyWrite({ kind, name });
      return result;
    }
    const ref = await createOp(request.requestId);
    await this.approval.present(ref.operationId);
    return DEFERRED;
  }
}
