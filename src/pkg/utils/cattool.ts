import type { CATToolMetadata, CATToolParam, ToolDefinition } from "@App/app/service/agent/types";

// 解析 ==CATTool== 元数据头
export function parseCATToolMetadata(code: string): CATToolMetadata | null {
  const match = code.match(/\/\/\s*==CATTool==([\s\S]*?)\/\/\s*==\/CATTool==/);
  if (!match) return null;

  const block = match[1];
  const lines = block.split("\n");

  let name = "";
  let description = "";
  const params: CATToolParam[] = [];
  const grants: string[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^\/\/\s*/, "").trim();
    if (!trimmed.startsWith("@")) continue;

    const atMatch = trimmed.match(/^@(\w+)\s*(.*)/);
    if (!atMatch) continue;

    const [, key, value] = atMatch;
    const val = value.trim();

    switch (key) {
      case "name":
        name = val;
        break;
      case "description":
        description = val;
        break;
      case "param":
        {
          const param = parseParam(val);
          if (param) params.push(param);
        }
        break;
      case "grant":
        if (val) grants.push(val);
        break;
    }
  }

  if (!name) return null;

  return { name, description, params, grants };
}

// 解析 @param 行: name type [required] description
// type 支持 string|number|boolean，支持 enum [val1,val2]
function parseParam(raw: string): CATToolParam | null {
  // 匹配: paramName type [required] description
  // 或: paramName type[val1,val2] [required] description
  const match = raw.match(/^(\w+)\s+(string|number|boolean)(\[[^\]]*\])?\s*(.*)/);
  if (!match) return null;

  const [, name, type, enumPart, rest] = match;

  let enumValues: string[] | undefined;
  if (enumPart) {
    // 解析 [val1,val2]
    const inner = enumPart.slice(1, -1).trim();
    if (inner) {
      enumValues = inner.split(",").map((v) => v.trim());
    }
  }

  // rest 可能以 [required] 开头
  let required = false;
  let description = rest.trim();
  if (description.startsWith("[required]")) {
    required = true;
    description = description.slice("[required]".length).trim();
  }

  return {
    name,
    type: type as CATToolParam["type"],
    required,
    description,
    ...(enumValues ? { enum: enumValues } : {}),
  };
}

// 将 CATTool 元数据转为 ToolDefinition（JSON Schema 格式）
export function catToolToToolDefinition(metadata: CATToolMetadata): ToolDefinition {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const param of metadata.params) {
    const prop: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };
    if (param.enum) {
      prop.enum = param.enum;
    }
    properties[param.name] = prop;
    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    name: metadata.name,
    description: metadata.description,
    parameters: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

// 获取 CATTool 脚本体（去掉元数据头）
export function getCATToolBody(code: string): string {
  return code.replace(/\/\/\s*==CATTool==[\s\S]*?\/\/\s*==\/CATTool==\s*/, "").trim();
}
