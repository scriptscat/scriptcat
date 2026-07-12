// Typed native-messaging host manifest generation: the manifest is built as a typed object and
// serialized, never assembled via string templating/replacement, so it can't accidentally
// produce malformed JSON or drift from what NativeMessagingManifest declares. Chrome requires an
// exact path and an exact allowed_origins list — no wildcards.

const EXTENSION_ID_RE = /^[a-p]{32}$/;

export type ManifestGenResult = { ok: true; manifest: NativeMessagingManifest } | { ok: false; reason: string };

export interface NativeMessagingManifest {
  name: "com.scriptcat.native_host";
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export function isValidExtensionId(id: string): boolean {
  return EXTENSION_ID_RE.test(id);
}

/**
 * Builds the manifest object Chrome expects at the registered path. Validates every extension ID
 * strictly (`^[a-p]{32}$`) — a plausible-looking but invalid ID like `fomrtutthjerocmw` (it
 * contains characters outside a-p) must be rejected rather than silently written into the
 * manifest. Rejects an empty ID list too: a manifest with no allowed_origins would still be
 * syntactically valid but functionally lock out every extension, which is never the intent of
 * running the installer.
 */
export function generateManifest(params: { extensionIds: string[]; hostExecutablePath: string }): ManifestGenResult {
  if (params.extensionIds.length === 0) {
    return { ok: false, reason: "NO_EXTENSION_IDS" };
  }
  for (const id of params.extensionIds) {
    if (!isValidExtensionId(id)) {
      return { ok: false, reason: `INVALID_EXTENSION_ID:${id}` };
    }
  }
  if (params.hostExecutablePath.length === 0) {
    return { ok: false, reason: "EMPTY_HOST_PATH" };
  }

  return {
    ok: true,
    manifest: {
      name: "com.scriptcat.native_host",
      description: "ScriptCat Native Messaging Host + MCP Bridge",
      path: params.hostExecutablePath,
      type: "stdio",
      allowed_origins: params.extensionIds.map((id) => `chrome-extension://${id}/`),
    },
  };
}

/**
 * Serializes to the exact bytes written to disk: UTF-8 without a byte-order mark. The prelim
 * committed manifest had a BOM, which breaks strict JSON parsers Chrome's manifest loader (and
 * some downstream tooling) may use — this function is the single place that formatting decision
 * is made, so nothing downstream can accidentally reintroduce it.
 */
export function serializeManifest(manifest: NativeMessagingManifest): string {
  // JSON.stringify never emits a BOM; Node's fs.writeFile with the default "utf8" encoding
  // likewise never prepends one — the risk in other toolchains is usually an editor or a
  // Windows-specific write path adding one, which callers must avoid when writing this string.
  return JSON.stringify(manifest, null, 2) + "\n";
}
