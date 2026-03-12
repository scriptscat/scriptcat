import type { MessageSend } from "@Packages/message/types";
import type { CATToolRecord } from "./types";
import type { ToolExecutor } from "./tool_registry";
import { getCATToolBody } from "@App/pkg/utils/cattool";
import { executeCATTool } from "@App/app/service/offscreen/client";
import { uuidv4 } from "@App/pkg/utils/uuid";

// CATTool UUID 前缀，用于在 GM API 请求中识别 CATTool
export const CATTOOL_UUID_PREFIX = "cattool-";

// 全局的 CATTool UUID → 工具名 映射，供 GM API 查询 grants 时使用
// 注意：此 Map 在 SW 重启后会丢失，但 CATTool 执行是单次 request-response，
// SW 重启会同时中断消息通道，所以 UUID 映射丢失不会导致额外问题
const cattoolUuidMap = new Map<string, string>();

// 根据 CATTool UUID 获取工具名
export function getCATToolNameByUuid(uuid: string): string {
  return cattoolUuidMap.get(uuid) || "";
}

// CATTool 执行器，通过 Offscreen -> Sandbox 执行 CATTool 脚本
export class CATToolExecutor implements ToolExecutor {
  constructor(
    private record: CATToolRecord,
    private sender: MessageSend
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
    cattoolUuidMap.set(uuid, this.record.name);

    const code = getCATToolBody(this.record.code);
    try {
      return await executeCATTool(this.sender, {
        uuid,
        code,
        args: typedArgs,
        grants: this.record.grants,
        name: this.record.name,
      });
    } finally {
      // 执行完毕后清理映射
      cattoolUuidMap.delete(uuid);
    }
  }
}
