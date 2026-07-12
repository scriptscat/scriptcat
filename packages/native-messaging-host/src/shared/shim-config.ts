import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { atomicWriteFile } from "./config.js";

export interface ShimCredentials {
  clientId: string;
  token: string;
  tokenHash: string;
  endpointDiscoveryPath: string; // path to the host's config.json, where the live endpoint name is published
}

export function resolveShimConfigDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "scriptcat-mcp");
  }
  return path.join(os.homedir(), ".config", "scriptcat-mcp");
}

export function credentialsPath(shimConfigDir: string): string {
  return path.join(shimConfigDir, "credentials.json");
}

export async function loadShimCredentials(shimConfigDir: string): Promise<ShimCredentials | undefined> {
  try {
    const content = await fs.readFile(credentialsPath(shimConfigDir), "utf-8");
    return JSON.parse(content) as ShimCredentials;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export async function saveShimCredentials(shimConfigDir: string, credentials: ShimCredentials): Promise<void> {
  await fs.mkdir(shimConfigDir, { recursive: true, mode: 0o700 });
  await atomicWriteFile(credentialsPath(shimConfigDir), JSON.stringify(credentials, null, 2), 0o600);
}
