/* eslint-disable import/prefer-default-export */
import { Script, ScriptDAO } from "@App/app/repo/scripts";

// 较对脚本排序位置
export function scriptListSort(result: Script[]) {
  const dao = new ScriptDAO();
  for (let i = 0; i < result.length; i += 1) {
    if (result[i].sort !== i) {
      dao.update(result[i].id, { sort: i });
      result[i].sort = i;
    }
  }
}
