import { ExportParams } from "@Pkg/cloudscript/cloudscript";
import { DAO, db } from "./dao";

export type ExportTarget = "local" | "tencentCloud";

// 导出与本地脚本关联记录
export interface Export {
  id: number;
  scriptId: number;
  params: {
    [key: string]: ExportParams;
  };
  // 导出目标
  target: ExportTarget;
}

export class ExportDAO extends DAO<Export> {
  public tableName = "export";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }

  findByScriptID(scriptID: number) {
    return this.table.where({ scriptId: scriptID }).first();
  }
}
