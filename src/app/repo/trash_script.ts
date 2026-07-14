import { Repo } from "./repo";
import type { Script } from "./scripts";
import type { InstallSource } from "../service/service_worker/types";

/** 回收站中的脚本:原脚本 + 删除元数据 */
export interface TrashScript extends Script {
  /** 进入回收站的时间戳(毫秒) */
  deleteTime: number;
  /** 删除来源 */
  deleteBy: InstallSource;
}

export class TrashScriptDAO extends Repo<TrashScript> {
  constructor() {
    super("trashScript");
  }

  public save(val: TrashScript) {
    return super._save(val.uuid, val);
  }

  public findByNameAndNamespace(name: string, namespace: string) {
    return this.findOne((key, value) => {
      return value.name === name && (!namespace || value.namespace === namespace);
    });
  }
}
