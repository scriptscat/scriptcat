import { z } from "zod";
import type { BridgeAction, McpScope } from "../shared/protocol.js";

// zod .strict() input schemas mirroring doc 03 §3 exactly — unknown fields rejected before a
// call ever reaches the socket (doc 03 §1 "unknown properties rejected").
const uuidField = z.string().uuid();

export const TOOL_INPUT_SCHEMAS = {
  server_info: z.object({}).strict(),
  list_scripts: z.object({}).strict(),
  get_script_metadata: z.object({ uuid: uuidField }).strict(),
  get_script_source: z.object({ uuid: uuidField }).strict(),
  request_script_install: z
    .object({ url: z.string().url().optional(), code: z.string().optional() })
    .strict()
    .refine((v) => !!v.url !== !!v.code, { message: "exactly one of url or code is required" }),
  request_script_toggle: z.object({ uuid: uuidField, enable: z.boolean() }).strict(),
  request_script_delete: z.object({ uuid: uuidField }).strict(),
  get_operation_status: z.object({ operationId: z.string().min(1) }).strict(),
  list_pending_operations: z.object({}).strict(),
  cancel_operation: z.object({ operationId: z.string().min(1) }).strict(),
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;

/** Maps a tool name to the bridge action it forwards to, and vice versa (doc 03 §5 table). */
export const TOOL_TO_ACTION: Partial<Record<ToolName, BridgeAction>> = {
  list_scripts: "scripts.list",
  get_script_metadata: "scripts.metadata.get",
  get_script_source: "scripts.source.get",
  request_script_install: "scripts.install.prepare",
  request_script_toggle: "scripts.toggle.request",
  request_script_delete: "scripts.delete.request",
  get_operation_status: "operations.get",
  list_pending_operations: "operations.list",
  cancel_operation: "operations.cancel",
};

/** Required scope per tool (doc 03 §5); `undefined` means "any authenticated client" (server_info). */
export const TOOL_REQUIRED_SCOPE: Partial<Record<ToolName, McpScope>> = {
  list_scripts: "scripts:list",
  get_script_metadata: "scripts:metadata:read",
  get_script_source: "scripts:source:read",
  request_script_install: "scripts:install:request",
  request_script_toggle: "scripts:toggle:request",
  request_script_delete: "scripts:delete:request",
};

const WRITE_TOOLS: readonly ToolName[] = ["request_script_install", "request_script_toggle", "request_script_delete"];

// Tool descriptions are compile-time constants (doc 04 §6: "Tool names/descriptions are
// compile-time constants") — never derived from script content, and every write tool's
// description states the human-approval contract up front (doc 03 §5).
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  server_info: "Reports bridge status, extension version, and this client's granted scopes.",
  list_scripts: "Lists installed userscripts as structured metadata summaries.",
  get_script_metadata: "Returns detailed metadata for a single script by uuid, still without source code.",
  get_script_source:
    "Returns a script's full source code. Source may contain secrets or proprietary logic; first use per client " +
    "may require a one-time disclosure approval in ScriptCat.",
  request_script_install:
    "Requests installation or update of a userscript from a URL or raw code. A ScriptCat window asks the user to " +
    "review and approve; poll get_operation_status with the returned operationId. The script is installed " +
    "disabled unless the user chooses otherwise.",
  request_script_toggle:
    "Requests enabling or disabling an existing script. Requires user approval in ScriptCat before it takes effect.",
  request_script_delete:
    "Requests permanent deletion of a script and its stored data. Requires explicit, strongly-confirmed user " +
    "approval in ScriptCat before it takes effect.",
  get_operation_status: "Polls the status of a previously requested write operation by operationId.",
  list_pending_operations: "Lists this client's own non-expired pending operations.",
  cancel_operation: "Cancels a pending operation that is still awaiting user approval.",
};

/** Every script-derived string travels tagged with which trust tier it belongs to (doc 04 §6). */
export type ContentTrust = "untrusted-user-script-metadata" | "untrusted-user-script-source";

export interface ToolCallOutcome {
  isError: boolean;
  payload: unknown;
}

/**
 * Filters the full tool catalog down to what a client's granted scopes make visible (doc 03 §5:
 * "tools/list only returns tools the connected client's granted scopes permit"). `server_info`
 * and the operations.* plumbing tools are visible to any authenticated client; everything else
 * needs its exact required scope.
 */
export function visibleTools(scopes: readonly McpScope[]): ToolName[] {
  return (Object.keys(TOOL_INPUT_SCHEMAS) as ToolName[]).filter((tool) => {
    const required = TOOL_REQUIRED_SCOPE[tool];
    if (!required) return true; // server_info, operations.* — ownership-gated server-side, not scope-gated here
    return scopes.includes(required);
  });
}

export function isWriteTool(tool: ToolName): boolean {
  return WRITE_TOOLS.includes(tool);
}

/**
 * Wraps a bridge call result per doc 03 §5's mandated shape: identical `content`/`structuredContent`,
 * `contentTrust` preserved verbatim wherever the bridge already set it, and — critically — never
 * Markdown-formatted or string-concatenated with script-controlled text (this is what replaces
 * the prelim's `executeToolCall` Markdown templates, the injection vector doc 04 §6 targets).
 */
export function toToolResult(
  outcome: { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }
): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
} {
  if (outcome.ok) {
    return {
      content: [{ type: "text", text: JSON.stringify(outcome.result) }],
      structuredContent: outcome.result as Record<string, unknown>,
    };
  }
  const payload = { errorCode: outcome.error.code, message: outcome.error.message };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}
