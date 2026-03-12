// ==CATTool==
// @name         hello_world
// @description  一个最简单的 CATTool 示例，向指定的人打招呼
// @param        name string [required] 要打招呼的人名
// ==/CATTool==

// args 由运行时自动注入，包含 LLM 传入的参数
return `你好，${args.name}！欢迎使用 ScriptCat CATTool。`;
