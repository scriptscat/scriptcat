import { sha256OfText } from "@App/pkg/utils/crypto";
import type { ScriptDAO, ScriptCodeDAO } from "@App/app/repo/scripts";
import { ExternalAccessBridgeError } from "./errors";
import type { ScriptSource } from "./types";

// Chrome hard-caps native-messaging frames at 1 MiB host->browser; 2 MiB is the extension-local
// cap on how much source a disclosure read will return in one call.
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/**
 * Reads and formats a script's source for a disclosure response. Shared by the bridge's
 * already-allowed fast path (client holds a permanent grant) and the approval service's
 * blocking-approval path, so both return the byte-for-byte identical ScriptSource shape.
 */
export async function readScriptSource(
  scriptDAO: Pick<ScriptDAO, "get">,
  scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
  uuid: string
): Promise<ScriptSource> {
  const script = await scriptDAO.get(uuid);
  if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
  const scriptCode = await scriptCodeDAO.get(uuid);
  if (!scriptCode) throw new ExternalAccessBridgeError("NOT_FOUND", "script source not found");
  if (new TextEncoder().encode(scriptCode.code).length > MAX_SOURCE_BYTES) {
    throw new ExternalAccessBridgeError("PAYLOAD_TOO_LARGE", "script source exceeds 2 MiB");
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
