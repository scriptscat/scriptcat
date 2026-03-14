import type { MessageSend } from "@Packages/message/types";
import type { CATToolRecord } from "./types";
import type { ToolExecutor } from "./tool_registry";
import { getCATToolBody } from "@App/pkg/utils/cattool";
import { executeCATTool } from "@App/app/service/offscreen/client";
import { uuidv4 } from "@App/pkg/utils/uuid";

// CATTool UUID 前缀，用于在 GM API 请求中识别 CATTool
export const CATTOOL_UUID_PREFIX = "cattool-";

// CATTool 单次执行超时（ms）
const CATTOOL_EXEC_TIMEOUT_MS = 30_000;

// 全局的 CATTool UUID → 工具信息映射，供 GM API 权限验证时使用
// 直接携带 grants，避免运行时再查 repo（skill 的 CATTool 不在 catToolRepo 中）
// 注意：此 Map 在 SW 重启后会丢失，但 CATTool 执行是单次 request-response，
// SW 重启会同时中断消息通道，所以映射丢失不会导致额外问题
const cattoolUuidMap = new Map<string, { name: string; grants: string[] }>();

// 根据 CATTool UUID 获取工具名
export function getCATToolNameByUuid(uuid: string): string {
  return cattoolUuidMap.get(uuid)?.name || "";
}

// 根据 CATTool UUID 直接获取 grants（用于 GM API 权限验证）
export function getCATToolGrantsByUuid(uuid: string): string[] {
  return cattoolUuidMap.get(uuid)?.grants || [];
}

// require 资源加载器类型：根据 URL 返回资源内容
export type RequireLoader = (url: string) => Promise<string | undefined>;

// CATTool 执行器，通过 Offscreen -> Sandbox 执行 CATTool 脚本
export class CATToolExecutor implements ToolExecutor {
  constructor(
    private record: CATToolRecord,
    private sender: MessageSend,
    private requireLoader?: RequireLoader,
    private configValues?: Record<string, unknown>
  ) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
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
    const uuid = CATTOOL_UUID_PREFIX + uuidv4();
    cattoolUuidMap.set(uuid, { name: this.record.name, grants: this.record.grants });

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

    const code = getCATToolBody(this.record.code);
    try {
      const execPromise = executeCATTool(this.sender, {
        uuid,
        code,
        args: typedArgs,
        grants: this.record.grants,
        name: this.record.name,
        requires,
        configValues: this.configValues,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              Object.assign(new Error(`CATTool "${this.record.name}" timed out after 30s`), {
                errorCode: "tool_timeout",
              })
            ),
          CATTOOL_EXEC_TIMEOUT_MS
        )
      );
      return await Promise.race([execPromise, timeoutPromise]);
    } finally {
      // 执行完毕后清理映射
      cattoolUuidMap.delete(uuid);
    }
  }
}
