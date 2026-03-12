// ==CATTool==
// @name         json_formatter
// @description  格式化、验证和查询 JSON 数据，支持 JSONPath 风格的简单路径查询
// @param        json string [required] JSON 字符串
// @param        path string 可选的查询路径，如 data.items.0.name
// @param        indent number 缩进空格数，默认 2
// ==/CATTool==

const indent = args.indent || 2;

let parsed;
try {
  parsed = JSON.parse(args.json);
} catch (e) {
  return { error: "JSON 解析失败: " + e.message, valid: false };
}

// 如果指定了路径，按路径查询
if (args.path) {
  const keys = args.path.split(".");
  let current = parsed;
  for (const key of keys) {
    if (current === undefined || current === null) {
      return { error: `路径 "${args.path}" 无效：在 "${key}" 处值为 ${current}` };
    }
    current = current[key];
  }
  return {
    valid: true,
    path: args.path,
    value: current,
    type: Array.isArray(current) ? "array" : typeof current,
  };
}

// 否则返回格式化结果
return {
  valid: true,
  formatted: JSON.stringify(parsed, null, indent),
  type: Array.isArray(parsed) ? "array" : typeof parsed,
  keys: typeof parsed === "object" && parsed !== null ? Object.keys(parsed) : [],
};
