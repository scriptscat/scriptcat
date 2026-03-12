import type { CATToolRecord } from "@App/app/service/agent/types";
import { OPFSRepo } from "./opfs_repo";

const REGISTRY_FILE = "registry.json";

// 目录结构：agents/tools/registry.json
export class CATToolRepo extends OPFSRepo {
  constructor() {
    super("tools");
  }

  async listTools(): Promise<CATToolRecord[]> {
    return this.readJsonFile<CATToolRecord[]>(REGISTRY_FILE, []);
  }

  async getTool(name: string): Promise<CATToolRecord | null> {
    const tools = await this.listTools();
    return tools.find((t) => t.name === name) || null;
  }

  async saveTool(record: CATToolRecord): Promise<void> {
    const tools = await this.listTools();
    const index = tools.findIndex((t) => t.name === record.name);
    if (index >= 0) {
      tools[index] = record;
    } else {
      tools.push(record);
    }
    await this.writeJsonFile(REGISTRY_FILE, tools);
  }

  async removeTool(name: string): Promise<boolean> {
    const tools = await this.listTools();
    const filtered = tools.filter((t) => t.name !== name);
    if (filtered.length === tools.length) return false;
    await this.writeJsonFile(REGISTRY_FILE, filtered);
    return true;
  }
}
