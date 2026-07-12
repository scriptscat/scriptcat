// scriptcat://scripts/<uuid>/source resource. Exposes the same data as the get_script_source
// tool through the MCP resource mechanism — kept in its own module so the URI parsing/matching
// logic is testable independent of the SDK's ResourceTemplate wiring.

export const SOURCE_RESOURCE_URI_TEMPLATE = "scriptcat://scripts/{uuid}/source";

const SOURCE_RESOURCE_RE = /^scriptcat:\/\/scripts\/([0-9a-f-]{36})\/source$/i;

export function buildSourceResourceUri(uuid: string): string {
  return `scriptcat://scripts/${uuid}/source`;
}

/** Extracts the script uuid from a resource URI, or undefined if it doesn't match the template. */
export function parseSourceResourceUri(uri: string): string | undefined {
  const match = SOURCE_RESOURCE_RE.exec(uri);
  return match?.[1];
}
