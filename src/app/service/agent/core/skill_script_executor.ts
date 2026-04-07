import type { MessageSend } from "@Packages/message/types";
import type { SkillScriptRecord, JsonValue } from "./types";
import type { ToolExecutor } from "./tool_registry";
import { getSkillScriptBody } from "@App/pkg/utils/skill_script";
import { executeSkillScript } from "@App/app/service/offscreen/client";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { withTimeout } from "@App/pkg/utils/with_timeout";

// Skill Script UUID 前缀，用于在 GM API 请求中识别 Skill Script
export const SKILL_SCRIPT_UUID_PREFIX = "skillscript-";

// Skill Script 默认超时（ms）
const SKILL_SCRIPT_DEFAULT_TIMEOUT_MS = 300_000;

// 全局的 Skill Script UUID → 工具信息映射，供 GM API 权限验证时使用
// 直接携带 grants，避免运行时再查 repo（skill 的 Skill Script 不在 skillScriptRepo 中）
// 注意：此 Map 在 SW 重启后会丢失，但 Skill Script 执行是单次 request-response，
// SW 重启会同时中断消息通道，所以映射丢失不会导致额外问题
const skillScriptUuidMap = new Map<string, { name: string; grants: string[] }>();

// 根据 Skill Script UUID 获取工具名
export function getSkillScriptNameByUuid(uuid: string): string {
  return skillScriptUuidMap.get(uuid)?.name || "";
}

// 根据 Skill Script UUID 直接获取 grants（用于 GM API 权限验证）
export function getSkillScriptGrantsByUuid(uuid: string): string[] {
  return skillScriptUuidMap.get(uuid)?.grants || [];
}

// require 资源加载器类型：根据 URL 返回资源内容
export type RequireLoader = (url: string) => Promise<string | undefined>;

// Skill Script 执行器，通过 Offscreen -> Sandbox 执行 Skill Script 脚本
export class SkillScriptExecutor implements ToolExecutor {
  constructor(
    private record: SkillScriptRecord,
    private sender: MessageSend,
    private requireLoader?: RequireLoader,
    private configValues?: Record<string, unknown>
  ) {}

  async execute(args: Record<string, unknown>): Promise<JsonValue> {
    // 根据 @param 定义做基本的类型转换
    const typedArgs: Record<string, unknown> = {};
    for (const param of this.record.params) {
      const val = args[param.name];
      if (val === undefined) continue;
      switch (param.type) {
        case "number":
          typedArgs[param.name] = Number(val);
          break;
        case "boolean":
          typedArgs[param.name] = val === true || val === "true";
          break;
        default:
          typedArgs[param.name] = String(val);
      }
    }

    // 在 service worker 端生成 UUID 并注册映射
    const uuid = SKILL_SCRIPT_UUID_PREFIX + uuidv4();
    skillScriptUuidMap.set(uuid, { name: this.record.name, grants: this.record.grants });

    // 加载 @require 资源内容
    let requires: Array<{ url: string; content: string }> | undefined;
    if (this.record.requires?.length && this.requireLoader) {
      const loaded: Array<{ url: string; content: string }> = [];
      for (const url of this.record.requires) {
        const content = await this.requireLoader(url);
        if (content) {
          loaded.push({ url, content });
        }
      }
      if (loaded.length > 0) {
        requires = loaded;
      }
    }

    const code = getSkillScriptBody(this.record.code);
    const timeoutMs = this.record.timeout ? this.record.timeout * 1000 : SKILL_SCRIPT_DEFAULT_TIMEOUT_MS;
    const timeoutSec = timeoutMs / 1000;
    try {
      const execPromise = executeSkillScript(this.sender, {
        uuid,
        code,
        args: typedArgs,
        grants: this.record.grants,
        name: this.record.name,
        requires,
        configValues: this.configValues,
      });
      return await withTimeout(execPromise, timeoutMs, () =>
        Object.assign(new Error(`SkillScript "${this.record.name}" timed out after ${timeoutSec}s`), {
          errorCode: "tool_timeout",
        })
      );
    } finally {
      // 执行完毕后清理映射
      skillScriptUuidMap.delete(uuid);
    }
  }
}
