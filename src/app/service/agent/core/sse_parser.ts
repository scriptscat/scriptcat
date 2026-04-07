// SSE (Server-Sent Events) 文本流解析器
export type SSEEvent = {
  event: string;
  data: string;
};

export class SSEParser {
  private buffer = "";
  private currentEvent = "";
  private currentData: string[] = [];

  // 解析输入的文本块，返回完整的事件列表
  parse(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];
    const lines = this.buffer.split("\n");
    // 保留最后一个不完整的行
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line === "" || line === "\r") {
        // 空行表示事件结束
        if (this.currentData.length > 0) {
          events.push({
            event: this.currentEvent || "message",
            data: this.currentData.join("\n"),
          });
        }
        // 无条件重置，防止 currentEvent 残留污染下一条事件
        this.currentEvent = "";
        this.currentData = [];
        continue;
      }

      const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line;

      if (cleanLine.startsWith(":")) {
        // 注释行，忽略
        continue;
      }

      const colonIndex = cleanLine.indexOf(":");
      if (colonIndex === -1) {
        // 没有冒号，整行作为字段名
        continue;
      }

      const field = cleanLine.slice(0, colonIndex);
      // 冒号后如果有空格则跳过
      const value =
        cleanLine[colonIndex + 1] === " " ? cleanLine.slice(colonIndex + 2) : cleanLine.slice(colonIndex + 1);

      switch (field) {
        case "event":
          this.currentEvent = value;
          break;
        case "data":
          this.currentData.push(value);
          break;
      }
    }

    return events;
  }

  // 重置解析器状态
  reset(): void {
    this.buffer = "";
    this.currentEvent = "";
    this.currentData = [];
  }
}
