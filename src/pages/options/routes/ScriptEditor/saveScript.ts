import type { Script } from "@App/app/repo/scripts";

// 用户主动取消保存（重名/编辑冲突时点了取消）——非错误，调用方静默处理
export const SAVE_CANCELED = "SAVE_CANCELED";

export interface SaveDeps {
  // 解析代码并与磁盘对比，返回新脚本及磁盘旧脚本
  prepareScript: (code: string, origin: string, uuid?: string) => Promise<{ script: Script; oldScript?: Script }>;
  // 按 name+namespace 查重
  findByNameAndNamespace: (name: string, namespace: string) => Promise<Script | undefined>;
  // 安装/更新脚本
  install: (params: { script: Script; code: string }) => Promise<{ update: boolean; updatetime?: number }>;
  // 冲突确认：返回 true 继续，false 取消
  confirm: (o: { kind: "name" | "edit" }) => Promise<boolean>;
  now?: () => number;
}

export interface SaveResult {
  script: Script;
  updated: boolean;
  updatetime?: number;
}

// 保存逻辑（移植自 release/v1.4 ScriptEditor.save，UI 副作用由调用方处理）
export async function saveScript(editorScript: Script, code: string, deps: SaveDeps): Promise<SaveResult> {
  const now = deps.now ?? Date.now;
  const targetUUID = editorScript.uuid;
  const { script, oldScript } = await deps.prepareScript(code, editorScript.origin || "", targetUUID);

  // 新增/改名时若已有同名同命名空间的其他脚本，提醒确认
  if (
    (!oldScript || oldScript.name !== script.name || oldScript.namespace !== script.namespace) &&
    script.name &&
    script.namespace
  ) {
    const dup = await deps.findByNameAndNamespace(script.name, script.namespace);
    if (dup && dup.uuid !== targetUUID) {
      const ok = await deps.confirm({ kind: "name" });
      if (!ok) throw new Error(SAVE_CANCELED);
    }
  }

  if (targetUUID) {
    if (editorScript.createtime !== 0) {
      if (!oldScript || oldScript.uuid !== targetUUID) {
        throw new Error("The editing script does not exist.");
      }
    }
    script.createtime = editorScript.createtime !== 0 ? editorScript.createtime : now();
  }

  if (!script.name) {
    throw new Error("script name cannot be empty");
  }

  // 编辑冲突：编辑器内记录的 updatetime 与磁盘最新不一致
  const currentEditorUpdateTime = editorScript.updatetime;
  const latestUpdateTime = oldScript?.updatetime ?? 0;
  if (
    currentEditorUpdateTime !== latestUpdateTime &&
    latestUpdateTime > 0 &&
    script.uuid === editorScript.uuid &&
    script.uuid === oldScript?.uuid
  ) {
    const ok = await deps.confirm({ kind: "edit" });
    if (!ok) throw new Error(SAVE_CANCELED);
  }

  if (script.ignoreVersion) script.ignoreVersion = "";

  const result = await deps.install({ script, code });
  return { script, updated: result.update, updatetime: result.updatetime };
}
