/** 英文与中文声明文件共用的后台会话扩展。 */
declare namespace CATAgent {
  /** 附加到后台会话时首先返回的状态快照。 */
  interface SyncStreamChunk {
    type: "sync";
    /** 附加前已累计的 assistant 输出。 */
    streamingMessage?: {
      content: string;
      thinking?: string;
      toolCalls: ToolCallInfo[];
    };
    /** 会话正在等待输入时的 ask_user 请求。 */
    pendingAskUser?: {
      id: string;
      question: string;
      options?: string[];
      optionValues?: string[];
      multiple?: boolean;
      allowCustom?: boolean;
    };
    /** 当前任务快照。 */
    tasks: Array<{
      id: string;
      subject: string;
      status: "pending" | "in_progress" | "completed";
      description?: string;
    }>;
    /** 终态快照是 attach() 返回的最后一个数据块。 */
    status: "running" | "done" | "error";
  }

  interface ConversationCreateOptions {
    /** 原始页面断开后仍在 Service Worker 中继续运行对话。 */
    background?: boolean;
  }

  interface ConversationInstance {
    /** 附加到后台会话，先接收必需快照，再接收后续流式数据。 */
    attach(): Promise<AsyncIterable<StreamChunk | SyncStreamChunk>>;
  }
}
