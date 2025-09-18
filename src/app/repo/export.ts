import type { ExportParams } from "@Packages/cloudscript/cloudscript";
import { Repo } from "./repo";

export type ExportTarget = "local" | "tencentCloud";

// 导出与本地脚本关联记录
export interface Export {
  uuid: string;
  params: {
    [key: string]: ExportParams;
  };
  // 导出目标
  target: ExportTarget;
}

export class ExportDAO extends Repo<Export> {
  public tableName = "export";

  constructor() {
    super("export");
  }

  findByScriptID(uuid: string) {
    return this.get(uuid);
  }

  save(model: Export): Promise<Export> {
    return this._save(model.uuid, model);
  }
}
