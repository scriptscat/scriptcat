import * as path from "node:path";
import * as fs from "node:fs/promises";
import { atomicWriteFile } from "./config.js";
import type { Limits } from "./limits.js";

export interface HostConfig {
  allowedOrigins: string[];
  endpointName?: string;
  limitOverrides?: Partial<Record<keyof Limits, number>>;
}

export function hostConfigPath(configDir: string): string {
  return path.join(configDir, "config.json");
}

export function clientsPath(configDir: string): string {
  return path.join(configDir, "clients.json");
}

export function runtimeDir(configDir: string): string {
  return path.join(configDir, "run");
}

export async function loadHostConfig(configDir: string): Promise<HostConfig> {
  try {
    const content = await fs.readFile(hostConfigPath(configDir), "utf-8");
    const parsed = JSON.parse(content) as Partial<HostConfig>;
    return {
      allowedOrigins: parsed.allowedOrigins ?? [],
      endpointName: parsed.endpointName,
      limitOverrides: parsed.limitOverrides,
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { allowedOrigins: [] };
    }
    throw e;
  }
}

export async function saveHostConfig(configDir: string, config: HostConfig): Promise<void> {
  await atomicWriteFile(hostConfigPath(configDir), JSON.stringify(config, null, 2), 0o600);
}
