import { uuidv4 } from "@App/pkg/utils/uuid";
import { sha256OfText } from "@App/pkg/utils/crypto";
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
import type { McpApprovalService } from "./approval";
import { McpBridgeError } from "./errors";
import {
  ACTION_REQUIRED_SCOPE,
  WRITE_ACTIONS,
  type BridgeAction,
  type McpBridgeRequest,
  type McpBridgeResponse,
  type ScriptSummary,
  type ScriptType,
} from "./types";

// Chrome hard-caps native-messaging frames at 1 MiB host->browser; 2 MiB is the extension-local
// cap on how much source `scripts.source.get` will return in one call.
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

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
 * re-checking scope from McpClientDAO on every call regardless of what the native host already
 * checked before forwarding it — this is defense in depth, since the extension never trusts the
 * host's claim about a client's scopes alone; a compromised or buggy host can't grant a scope the
 * extension's own record doesn't have. Writes exactly one audit event per request.
 */
export class McpBridge {
  constructor(
    private readonly scriptDAO: Pick<ScriptDAO, "all" | "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly clientDAO: Pick<McpClientDAO, "get">,
    private readonly approval: McpApprovalService,
    private readonly auditDAO: Pick<McpAuditDAO, "append"> = new McpAuditDAO(),
    private isWriteSessionActive: () => boolean = () => false
  ) {}

  // Lets the caller wire the write-session predicate after both McpBridge and McpController
  // exist, avoiding a circular construction dependency between the two (McpController needs a
  // constructed McpBridge; McpBridge's write-session check needs to read McpController's state).
  setWriteSessionChecker(checker: () => boolean): void {
    this.isWriteSessionActive = checker;
  }

  async handle(request: McpBridgeRequest): Promise<McpBridgeResponse> {
    let client: McpClient | undefined;
    try {
      client = await this.clientDAO.get(request.clientId);
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
        const script = await this.scriptDAO.get(uuid);
        if (!script) throw new McpBridgeError("NOT_FOUND", "script not found");

        // First-use-per-client disclosure gate: source may contain secrets, so unlike
        // scripts.list/metadata.get this read isn't unconditionally granted by the scope alone —
        // the human must approve it once per client per script (or forever, via "Allow for this
        // client").
        const disclosure = await this.approval.checkSourceDisclosure({
          clientId: request.clientId,
          uuid,
          requestingClientName: client.displayName,
        });
        if (disclosure !== "allowed") {
          throw new McpBridgeError(
            "USER_APPROVAL_REQUIRED",
            "reading script source requires a one-time disclosure approval",
            disclosure.operationId
          );
        }

        const scriptCode = await this.scriptCodeDAO.get(uuid);
        if (!scriptCode) throw new McpBridgeError("NOT_FOUND", "script source not found");
        if (new TextEncoder().encode(scriptCode.code).length > MAX_SOURCE_BYTES) {
          throw new McpBridgeError("PAYLOAD_TOO_LARGE", "script source exceeds 2 MiB");
        }
        return {
          uuid: script.uuid,
          name: script.name,
          version: script.metadata.version?.[0],
          code: scriptCode.code,
          sha256: sha256OfText(scriptCode.code),
          contentTrust: "untrusted-user-script-source",
        };
      }
      case "scripts.install.request":
        return this.approval.prepareInstall({
          clientId: request.clientId,
          requestingClientName: client.displayName,
          url: input.url as string | undefined,
          code: input.code as string | undefined,
        });
      case "scripts.toggle.request":
        return this.approval.requestToggle({
          clientId: request.clientId,
          uuid: input.uuid as string,
          enable: input.enable as boolean,
        });
      case "scripts.delete.request":
        return this.approval.requestDelete({ clientId: request.clientId, uuid: input.uuid as string });
    }
  }

  private async recordAudit(
    request: McpBridgeRequest,
    client: McpClient | undefined,
    decision: "allowed" | "denied",
    result: "success" | "failure",
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
