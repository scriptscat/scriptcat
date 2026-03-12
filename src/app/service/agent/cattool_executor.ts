import type { MessageSend } from "@Packages/message/types";
import type { CATToolRecord } from "./types";
import type { ToolExecutor } from "./tool_registry";
import { getCATToolBody } from "@App/pkg/utils/cattool";
import { executeCATTool } from "@App/app/service/offscreen/client";

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

    const code = getCATToolBody(this.record.code);
    return executeCATTool(this.sender, {
      code,
      args: typedArgs,
      grants: this.record.grants,
      name: this.record.name,
    });
  }
}
