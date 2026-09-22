import { customClone, Native } from "../global";
import type {
  AudioBlock,
  Attachment,
  ChatStreamEvent,
  FileBlock,
  ImageBlock,
  SubAgentEventInfo,
  ToolCall,
} from "@App/app/service/agent/core/types";

// ============================================================================
// 通用数据形状检查
// ============================================================================
// message.data 已经过 postMessage/扩展消息传输的 structured clone，不会带 accessor/Proxy 存活；
// 这里先用 customClone() 再复制一次，拒绝 Map/Set 伪装、不可 clone 的值，并把结果规范成
// null 原型或原生 Object.prototype 的纯数据字典，随后只对这份 clone 做结构校验。

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Native.arrayIsArray(value)) return false;
  const prototype = Native.objectGetPrototypeOf(value);
  return prototype === null || Native.objectGetPrototypeOf(prototype) === null;
};

const hasOnlyKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => {
  const keys = Native.objectKeys(value);
  for (let index = 0; index < required.length; index += 1) {
    if (!Native.objectHasOwn(value, required[index])) return false;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    let known = false;
    for (let keyIndex = 0; keyIndex < required.length; keyIndex += 1) {
      if (required[keyIndex] === key) {
        known = true;
        break;
      }
    }
    if (!known) {
      for (let keyIndex = 0; keyIndex < optional.length; keyIndex += 1) {
        if (optional[keyIndex] === key) {
          known = true;
          break;
        }
      }
    }
    if (!known) return false;
  }
  return true;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";
const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === "number";
const isStringArray = (value: unknown): value is string[] => {
  if (!Native.arrayIsArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") return false;
  }
  return true;
};
const isOptionalStringArray = (value: unknown): value is string[] | undefined =>
  value === undefined || isStringArray(value);

// ============================================================================
// 编译期 key 契约：防止运行期 allowlist 与 types.ts 静默漂移（OA-P10）
// ============================================================================
// RequiredKeysOf/OptionalKeysOf 是标准的 TS 必填/可选 key 提取技巧；TypeEqual 是
// 不做联合类型分发的类型相等判定。AssertKeys<T, R, O> 只有在 R 的成员集合恰好等于
// T 的必填 key 集合、且 O 的成员集合恰好等于 T 的可选 key 集合时才是 `true`；
// 下方每个 `_assert*: AssertKeys<...> = true;` 都是纯编译期检查，drift 会直接让
// `pnpm run typecheck` 失败，而不是让运行期校验静默漏掉新字段。
// 下面两行的 {} 是标准的 "该 key 是否可选" 判定技巧（{} extends Pick<T,K>），不是
// "any non-nullish value" 的误用，故逐行关闭 no-empty-object-type。
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type RequiredKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type OptionalKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type TypeEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertKeys<T, R extends readonly string[], O extends readonly string[]> =
  TypeEqual<R[number], RequiredKeysOf<T>> extends true
    ? TypeEqual<O[number], OptionalKeysOf<T>> extends true
      ? true
      : { readonly optionalKeyDrift: OptionalKeysOf<T> }
    : { readonly requiredKeyDrift: RequiredKeysOf<T> };

// ============================================================================
// 嵌套形状：Attachment / TokenUsage / SubAgentEventInfo / ToolCall（start 与 full 两种）
// ============================================================================

const ATTACHMENT_REQUIRED = ["id", "type", "name", "mimeType"] as const;
const ATTACHMENT_OPTIONAL = ["size"] as const;
type _AssertAttachment = AssertKeys<Attachment, typeof ATTACHMENT_REQUIRED, typeof ATTACHMENT_OPTIONAL>;
const _assertAttachment: _AssertAttachment = true;

const isAttachment = (value: unknown): value is Attachment => {
  if (!isRecord(value) || !hasOnlyKeys(value, ATTACHMENT_REQUIRED, ATTACHMENT_OPTIONAL)) return false;
  return (
    isNonEmptyString(value.id) &&
    (value.type === "image" || value.type === "file" || value.type === "audio") &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string" &&
    isOptionalNumber(value.size)
  );
};

const isAttachmentArray = (value: unknown): value is Attachment[] => {
  if (!Native.arrayIsArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!isAttachment(value[index])) return false;
  }
  return true;
};
const isOptionalAttachmentArray = (value: unknown): value is Attachment[] | undefined =>
  value === undefined || isAttachmentArray(value);

const TOKEN_USAGE_REQUIRED = ["inputTokens", "outputTokens"] as const;
const TOKEN_USAGE_OPTIONAL = ["cacheCreationInputTokens", "cacheReadInputTokens"] as const;
type _AssertTokenUsage = AssertKeys<
  Extract<ChatStreamEvent, { type: "done" }>["usage"] & {},
  typeof TOKEN_USAGE_REQUIRED,
  typeof TOKEN_USAGE_OPTIONAL
>;
const _assertTokenUsage: _AssertTokenUsage = true;

const isTokenUsage = (value: unknown): boolean => {
  if (!isRecord(value) || !hasOnlyKeys(value, TOKEN_USAGE_REQUIRED, TOKEN_USAGE_OPTIONAL)) return false;
  return (
    typeof value.inputTokens === "number" &&
    typeof value.outputTokens === "number" &&
    isOptionalNumber(value.cacheCreationInputTokens) &&
    isOptionalNumber(value.cacheReadInputTokens)
  );
};
const isOptionalTokenUsage = (value: unknown): boolean => value === undefined || isTokenUsage(value);

const SUB_AGENT_EVENT_INFO_REQUIRED = ["agentId", "description"] as const;
const SUB_AGENT_EVENT_INFO_OPTIONAL = ["subAgentType", "toolCallId"] as const;
type _AssertSubAgentEventInfo = AssertKeys<
  SubAgentEventInfo,
  typeof SUB_AGENT_EVENT_INFO_REQUIRED,
  typeof SUB_AGENT_EVENT_INFO_OPTIONAL
>;
const _assertSubAgentEventInfo: _AssertSubAgentEventInfo = true;

const isSubAgentEventInfo = (value: unknown): value is SubAgentEventInfo => {
  if (!isRecord(value) || !hasOnlyKeys(value, SUB_AGENT_EVENT_INFO_REQUIRED, SUB_AGENT_EVENT_INFO_OPTIONAL)) {
    return false;
  }
  return (
    isNonEmptyString(value.agentId) &&
    typeof value.description === "string" &&
    isOptionalString(value.subAgentType) &&
    isOptionalString(value.toolCallId)
  );
};
const isOptionalSubAgentEventInfo = (value: unknown): boolean => value === undefined || isSubAgentEventInfo(value);

const TOOL_CALL_STATUS = new Native.Set(["pending", "running", "completed", "error"]);
const isOptionalToolCallStatus = (value: unknown): boolean =>
  value === undefined || TOOL_CALL_STATUS.has(value as string);

// tool_call_complete 事件自己的 status 字段只取 "completed" | "error" 两个值，比 ToolCall.status
// 的四值集合更窄（见 LLMStreamEvent 的 tool_call_complete 分支），不能复用 TOOL_CALL_STATUS。
const TOOL_CALL_COMPLETE_STATUS = new Native.Set(["completed", "error"]);
const isOptionalToolCallCompleteStatus = (value: unknown): boolean =>
  value === undefined || TOOL_CALL_COMPLETE_STATUS.has(value as string);

// tool_call_start.toolCall：Omit<ToolCall, "result">。不允许出现 "result"（见 OA plan §15）。
const TOOL_CALL_START_REQUIRED = ["id", "name", "arguments"] as const;
const TOOL_CALL_START_OPTIONAL = ["attachments", "ownedAttachmentIds", "subAgentDetails", "status"] as const;
type _AssertToolCallStart = AssertKeys<
  Omit<ToolCall, "result">,
  typeof TOOL_CALL_START_REQUIRED,
  typeof TOOL_CALL_START_OPTIONAL
>;
const _assertToolCallStart: _AssertToolCallStart = true;

const isToolCallStart = (value: unknown): value is Omit<ToolCall, "result"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, TOOL_CALL_START_REQUIRED, TOOL_CALL_START_OPTIONAL)) return false;
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.arguments === "string" &&
    isOptionalAttachmentArray(value.attachments) &&
    isOptionalStringArray(value.ownedAttachmentIds) &&
    // subAgentDetails 只要求"是 customClone 之后的纯数据值"；CAT 目前不解读其内部字段，
    // 递归建模整份子代理消息图不在本次边界内（OA-P12/OA-P16）。
    (value.subAgentDetails === undefined || isRecord(value.subAgentDetails)) &&
    isOptionalToolCallStatus(value.status)
  );
};

// 完整 ToolCall（sync.streamingMessage.toolCalls 使用）：与 start 相同 + 可选 result。
const TOOL_CALL_FULL_REQUIRED = TOOL_CALL_START_REQUIRED;
const TOOL_CALL_FULL_OPTIONAL = [...TOOL_CALL_START_OPTIONAL, "result"] as const;
type _AssertToolCallFull = AssertKeys<ToolCall, typeof TOOL_CALL_FULL_REQUIRED, typeof TOOL_CALL_FULL_OPTIONAL>;
const _assertToolCallFull: _AssertToolCallFull = true;

const isToolCallFull = (value: unknown): value is ToolCall => {
  if (!isRecord(value) || !hasOnlyKeys(value, TOOL_CALL_FULL_REQUIRED, TOOL_CALL_FULL_OPTIONAL)) return false;
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.arguments === "string" &&
    isOptionalString(value.result) &&
    isOptionalAttachmentArray(value.attachments) &&
    isOptionalStringArray(value.ownedAttachmentIds) &&
    (value.subAgentDetails === undefined || isRecord(value.subAgentDetails)) &&
    isOptionalToolCallStatus(value.status)
  );
};

const isToolCallFullArray = (value: unknown): value is ToolCall[] => {
  if (!Native.arrayIsArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!isToolCallFull(value[index])) return false;
  }
  return true;
};

// ============================================================================
// content_block_start / content_block_complete 的 block 形状
// ============================================================================

// `Omit<ImageBlock | FileBlock | AudioBlock, "attachmentId">` does NOT distribute over the union:
// Omit/Pick are plain mapped types over a fixed key set, not homomorphic over their source union,
// so TS first collapses `keyof (Image|File|Audio)` to the KEYS COMMON TO ALL THREE members
// ("type" | "mimeType" | "name" — "size" and "durationMs" are each unique to one member and drop
// out entirely), then rebuilds a single flat object type from that; empirically (confirmed via the
// AssertKeys compile-time check below) "name" keeps its optional modifier through this collapse.
// The real producer (providers/anthropic.ts content_block_start handling) matches this flattened
// shape today (`{type:"image", mimeType, name}`), so the runtime check follows the declared type
// literally rather than the three-way discriminated shape a reader might expect.
const CONTENT_BLOCK_START_REQUIRED = ["type", "mimeType"] as const;
const CONTENT_BLOCK_START_OPTIONAL = ["name"] as const;
type _StartBlockShape = Extract<ChatStreamEvent, { type: "content_block_start" }>["block"];
type _AssertContentBlockStart = AssertKeys<
  _StartBlockShape,
  typeof CONTENT_BLOCK_START_REQUIRED,
  typeof CONTENT_BLOCK_START_OPTIONAL
>;
const _assertContentBlockStart: _AssertContentBlockStart = true;

const isContentBlockStart = (value: unknown): value is _StartBlockShape => {
  if (!isRecord(value) || !hasOnlyKeys(value, CONTENT_BLOCK_START_REQUIRED, CONTENT_BLOCK_START_OPTIONAL)) {
    return false;
  }
  return (
    (value.type === "image" || value.type === "file" || value.type === "audio") &&
    typeof value.mimeType === "string" &&
    isOptionalString(value.name)
  );
};

const CONTENT_BLOCK_IMAGE_REQUIRED = ["type", "attachmentId", "mimeType"] as const;
const CONTENT_BLOCK_IMAGE_OPTIONAL = ["name"] as const;
const CONTENT_BLOCK_FILE_REQUIRED = ["type", "attachmentId", "mimeType", "name"] as const;
const CONTENT_BLOCK_FILE_OPTIONAL = ["size"] as const;
const CONTENT_BLOCK_AUDIO_REQUIRED = ["type", "attachmentId", "mimeType"] as const;
const CONTENT_BLOCK_AUDIO_OPTIONAL = ["name", "durationMs"] as const;
type _AssertContentBlockImage = AssertKeys<
  ImageBlock,
  typeof CONTENT_BLOCK_IMAGE_REQUIRED,
  typeof CONTENT_BLOCK_IMAGE_OPTIONAL
>;
const _assertContentBlockImage: _AssertContentBlockImage = true;
type _AssertContentBlockFile = AssertKeys<
  FileBlock,
  typeof CONTENT_BLOCK_FILE_REQUIRED,
  typeof CONTENT_BLOCK_FILE_OPTIONAL
>;
const _assertContentBlockFile: _AssertContentBlockFile = true;
type _AssertContentBlockAudio = AssertKeys<
  AudioBlock,
  typeof CONTENT_BLOCK_AUDIO_REQUIRED,
  typeof CONTENT_BLOCK_AUDIO_OPTIONAL
>;
const _assertContentBlockAudio: _AssertContentBlockAudio = true;

// content_block_complete.block 的类型是直接书写的 ImageBlock | FileBlock | AudioBlock 联合，
// 没有经过 Pick/Omit 改写，因此三个分支各自的字段（size、durationMs 等）都完整保留，
// 与上面 content_block_start 因 Omit 扁平化而丢字段的情况不同。
const isContentBlock = (value: unknown): value is ImageBlock | FileBlock | AudioBlock => {
  if (!isRecord(value)) return false;
  if (value.type === "image") {
    return (
      hasOnlyKeys(value, CONTENT_BLOCK_IMAGE_REQUIRED, CONTENT_BLOCK_IMAGE_OPTIONAL) &&
      isNonEmptyString(value.attachmentId) &&
      typeof value.mimeType === "string" &&
      isOptionalString(value.name)
    );
  }
  if (value.type === "file") {
    return (
      hasOnlyKeys(value, CONTENT_BLOCK_FILE_REQUIRED, CONTENT_BLOCK_FILE_OPTIONAL) &&
      isNonEmptyString(value.attachmentId) &&
      typeof value.mimeType === "string" &&
      typeof value.name === "string" &&
      isOptionalNumber(value.size)
    );
  }
  if (value.type === "audio") {
    return (
      hasOnlyKeys(value, CONTENT_BLOCK_AUDIO_REQUIRED, CONTENT_BLOCK_AUDIO_OPTIONAL) &&
      isNonEmptyString(value.attachmentId) &&
      typeof value.mimeType === "string" &&
      isOptionalString(value.name) &&
      isOptionalNumber(value.durationMs)
    );
  }
  return false;
};

// ============================================================================
// ask_user 共用形状（ask_user 事件本身与 sync.pendingAskUser 结构相同，只差 "type"）
// ============================================================================

const ASK_USER_SHAPE_REQUIRED = ["id", "question"] as const;
const ASK_USER_SHAPE_OPTIONAL = ["options", "optionValues", "multiple", "allowCustom"] as const;
type _AssertAskUserShape = AssertKeys<
  Omit<Extract<ChatStreamEvent, { type: "ask_user" }>, "type">,
  typeof ASK_USER_SHAPE_REQUIRED,
  typeof ASK_USER_SHAPE_OPTIONAL
>;
const _assertAskUserShape: _AssertAskUserShape = true;
type _AssertPendingAskUserShape = AssertKeys<
  Extract<ChatStreamEvent, { type: "sync" }>["pendingAskUser"] & {},
  typeof ASK_USER_SHAPE_REQUIRED,
  typeof ASK_USER_SHAPE_OPTIONAL
>;
const _assertPendingAskUserShape: _AssertPendingAskUserShape = true;

const isAskUserShape = (value: Record<string, unknown>): boolean =>
  hasOnlyKeys(value, ASK_USER_SHAPE_REQUIRED, ASK_USER_SHAPE_OPTIONAL) &&
  isNonEmptyString(value.id) &&
  typeof value.question === "string" &&
  isOptionalStringArray(value.options) &&
  isOptionalStringArray(value.optionValues) &&
  isOptionalBoolean(value.multiple) &&
  isOptionalBoolean(value.allowCustom);

// ============================================================================
// task_update.tasks / sync.tasks 共用的任务条目形状
// ============================================================================

const TASK_ITEM_REQUIRED = ["id", "subject", "status"] as const;
const TASK_ITEM_OPTIONAL = ["description"] as const;
type _AssertTaskItem = AssertKeys<
  Extract<ChatStreamEvent, { type: "task_update" }>["tasks"][number],
  typeof TASK_ITEM_REQUIRED,
  typeof TASK_ITEM_OPTIONAL
>;
const _assertTaskItem: _AssertTaskItem = true;

const TASK_STATUS = new Native.Set(["pending", "in_progress", "completed"]);

const isTaskArray = (value: unknown): boolean => {
  if (!Native.arrayIsArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, TASK_ITEM_REQUIRED, TASK_ITEM_OPTIONAL) ||
      !isNonEmptyString(item.id) ||
      typeof item.subject !== "string" ||
      !TASK_STATUS.has(item.status as string) ||
      !isOptionalString(item.description)
    ) {
      return false;
    }
  }
  return true;
};

// ============================================================================
// 顶层事件 key 契约
// ============================================================================

// ForwardableEvent 派生的十二个变体都额外允许可选的 subAgent；ask_user 系列 / task_update /
// compact_done / sync 六个变体没有 subAgent 字段（见 types.ts 的联合定义）。
const CONTENT_DELTA_REQUIRED = ["type", "delta"] as const;
const CONTENT_DELTA_OPTIONAL = ["subAgent"] as const;
type _AssertContentDelta = AssertKeys<
  Extract<ChatStreamEvent, { type: "content_delta" }>,
  typeof CONTENT_DELTA_REQUIRED,
  typeof CONTENT_DELTA_OPTIONAL
>;
const _assertContentDelta: _AssertContentDelta = true;
type _AssertThinkingDelta = AssertKeys<
  Extract<ChatStreamEvent, { type: "thinking_delta" }>,
  typeof CONTENT_DELTA_REQUIRED,
  typeof CONTENT_DELTA_OPTIONAL
>;
const _assertThinkingDelta: _AssertThinkingDelta = true;

const TOOL_CALL_START_EVENT_REQUIRED = ["type", "toolCall"] as const;
const TOOL_CALL_START_EVENT_OPTIONAL = ["subAgent"] as const;
type _AssertToolCallStartEvent = AssertKeys<
  Extract<ChatStreamEvent, { type: "tool_call_start" }>,
  typeof TOOL_CALL_START_EVENT_REQUIRED,
  typeof TOOL_CALL_START_EVENT_OPTIONAL
>;
const _assertToolCallStartEvent: _AssertToolCallStartEvent = true;

const TOOL_CALL_DELTA_REQUIRED = ["type", "id", "delta"] as const;
const TOOL_CALL_DELTA_OPTIONAL = ["index", "subAgent"] as const;
type _AssertToolCallDelta = AssertKeys<
  Extract<ChatStreamEvent, { type: "tool_call_delta" }>,
  typeof TOOL_CALL_DELTA_REQUIRED,
  typeof TOOL_CALL_DELTA_OPTIONAL
>;
const _assertToolCallDelta: _AssertToolCallDelta = true;

const TOOL_CALL_COMPLETE_REQUIRED = ["type", "id", "result"] as const;
const TOOL_CALL_COMPLETE_OPTIONAL = ["status", "attachments", "ownedAttachmentIds", "subAgent"] as const;
type _AssertToolCallComplete = AssertKeys<
  Extract<ChatStreamEvent, { type: "tool_call_complete" }>,
  typeof TOOL_CALL_COMPLETE_REQUIRED,
  typeof TOOL_CALL_COMPLETE_OPTIONAL
>;
const _assertToolCallComplete: _AssertToolCallComplete = true;

const CONTENT_BLOCK_START_EVENT_REQUIRED = ["type", "block"] as const;
const CONTENT_BLOCK_START_EVENT_OPTIONAL = ["subAgent"] as const;
type _AssertContentBlockStartEvent = AssertKeys<
  Extract<ChatStreamEvent, { type: "content_block_start" }>,
  typeof CONTENT_BLOCK_START_EVENT_REQUIRED,
  typeof CONTENT_BLOCK_START_EVENT_OPTIONAL
>;
const _assertContentBlockStartEvent: _AssertContentBlockStartEvent = true;

const CONTENT_BLOCK_COMPLETE_REQUIRED = ["type", "block"] as const;
const CONTENT_BLOCK_COMPLETE_OPTIONAL = ["data", "subAgent"] as const;
type _AssertContentBlockCompleteEvent = AssertKeys<
  Extract<ChatStreamEvent, { type: "content_block_complete" }>,
  typeof CONTENT_BLOCK_COMPLETE_REQUIRED,
  typeof CONTENT_BLOCK_COMPLETE_OPTIONAL
>;
const _assertContentBlockCompleteEvent: _AssertContentBlockCompleteEvent = true;

const NEW_MESSAGE_REQUIRED = ["type"] as const;
const NEW_MESSAGE_OPTIONAL = ["subAgent"] as const;
type _AssertNewMessage = AssertKeys<
  Extract<ChatStreamEvent, { type: "new_message" }>,
  typeof NEW_MESSAGE_REQUIRED,
  typeof NEW_MESSAGE_OPTIONAL
>;
const _assertNewMessage: _AssertNewMessage = true;

const DONE_REQUIRED = ["type"] as const;
const DONE_OPTIONAL = ["usage", "durationMs", "subAgent"] as const;
type _AssertDone = AssertKeys<Extract<ChatStreamEvent, { type: "done" }>, typeof DONE_REQUIRED, typeof DONE_OPTIONAL>;
const _assertDone: _AssertDone = true;

const ERROR_REQUIRED = ["type", "message"] as const;
const ERROR_OPTIONAL = ["errorCode", "usage", "durationMs", "subAgent"] as const;
type _AssertError = AssertKeys<
  Extract<ChatStreamEvent, { type: "error" }>,
  typeof ERROR_REQUIRED,
  typeof ERROR_OPTIONAL
>;
const _assertError: _AssertError = true;

const RETRY_REQUIRED = ["type", "attempt", "maxRetries", "error", "delayMs"] as const;
const RETRY_OPTIONAL = ["subAgent"] as const;
type _AssertRetry = AssertKeys<
  Extract<ChatStreamEvent, { type: "retry" }>,
  typeof RETRY_REQUIRED,
  typeof RETRY_OPTIONAL
>;
const _assertRetry: _AssertRetry = true;

const SYSTEM_WARNING_REQUIRED = ["type", "message"] as const;
const SYSTEM_WARNING_OPTIONAL = ["subAgent"] as const;
type _AssertSystemWarning = AssertKeys<
  Extract<ChatStreamEvent, { type: "system_warning" }>,
  typeof SYSTEM_WARNING_REQUIRED,
  typeof SYSTEM_WARNING_OPTIONAL
>;
const _assertSystemWarning: _AssertSystemWarning = true;

const ASK_USER_EVENT_REQUIRED = ["type", "id", "question"] as const;
const ASK_USER_EVENT_OPTIONAL = ["options", "optionValues", "multiple", "allowCustom"] as const;
type _AssertAskUserEvent = AssertKeys<
  Extract<ChatStreamEvent, { type: "ask_user" }>,
  typeof ASK_USER_EVENT_REQUIRED,
  typeof ASK_USER_EVENT_OPTIONAL
>;
const _assertAskUserEvent: _AssertAskUserEvent = true;

const ASK_USER_ID_ONLY_REQUIRED = ["type", "id"] as const;
const ASK_USER_ID_ONLY_OPTIONAL = [] as const;
type _AssertAskUserExpired = AssertKeys<
  Extract<ChatStreamEvent, { type: "ask_user_expired" }>,
  typeof ASK_USER_ID_ONLY_REQUIRED,
  typeof ASK_USER_ID_ONLY_OPTIONAL
>;
const _assertAskUserExpired: _AssertAskUserExpired = true;
type _AssertAskUserResolved = AssertKeys<
  Extract<ChatStreamEvent, { type: "ask_user_resolved" }>,
  typeof ASK_USER_ID_ONLY_REQUIRED,
  typeof ASK_USER_ID_ONLY_OPTIONAL
>;
const _assertAskUserResolved: _AssertAskUserResolved = true;

const TASK_UPDATE_REQUIRED = ["type", "tasks"] as const;
const TASK_UPDATE_OPTIONAL = [] as const;
type _AssertTaskUpdate = AssertKeys<
  Extract<ChatStreamEvent, { type: "task_update" }>,
  typeof TASK_UPDATE_REQUIRED,
  typeof TASK_UPDATE_OPTIONAL
>;
const _assertTaskUpdate: _AssertTaskUpdate = true;

const COMPACT_DONE_REQUIRED = ["type", "summary", "originalCount"] as const;
const COMPACT_DONE_OPTIONAL = [] as const;
type _AssertCompactDone = AssertKeys<
  Extract<ChatStreamEvent, { type: "compact_done" }>,
  typeof COMPACT_DONE_REQUIRED,
  typeof COMPACT_DONE_OPTIONAL
>;
const _assertCompactDone: _AssertCompactDone = true;

const SYNC_REQUIRED = ["type", "tasks", "status"] as const;
const SYNC_OPTIONAL = ["streamingMessage", "pendingAskUser"] as const;
type _AssertSync = AssertKeys<Extract<ChatStreamEvent, { type: "sync" }>, typeof SYNC_REQUIRED, typeof SYNC_OPTIONAL>;
const _assertSync: _AssertSync = true;

const SYNC_STREAMING_MESSAGE_REQUIRED = ["content", "toolCalls"] as const;
const SYNC_STREAMING_MESSAGE_OPTIONAL = ["thinking"] as const;
type _AssertSyncStreamingMessage = AssertKeys<
  Extract<ChatStreamEvent, { type: "sync" }>["streamingMessage"] & {},
  typeof SYNC_STREAMING_MESSAGE_REQUIRED,
  typeof SYNC_STREAMING_MESSAGE_OPTIONAL
>;
const _assertSyncStreamingMessage: _AssertSyncStreamingMessage = true;

const SYNC_STATUS = new Native.Set(["running", "done", "error"]);

// ============================================================================
// 主入口
// ============================================================================

/**
 * 先 customClone 再做结构校验；校验失败一律返回 undefined，调用方在此之前不得读取
 * 原始 message.data 的任何字段。已声明但当前 switch 未处理的变体（如 retry、ask_user 等）
 * 同样会被接受，交由调用方按现状忽略——校验层不因"今天没人处理"而拒绝合法协议事件。
 */
export const cloneChatStreamEvent = (raw: unknown): ChatStreamEvent | undefined => {
  const cloned = customClone(raw);
  if (!isRecord(cloned) || typeof cloned.type !== "string") return undefined;

  switch (cloned.type) {
    case "content_delta":
    case "thinking_delta": {
      if (!hasOnlyKeys(cloned, CONTENT_DELTA_REQUIRED, CONTENT_DELTA_OPTIONAL)) return undefined;
      if (typeof cloned.delta !== "string" || !isOptionalSubAgentEventInfo(cloned.subAgent)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "tool_call_start": {
      if (!hasOnlyKeys(cloned, TOOL_CALL_START_EVENT_REQUIRED, TOOL_CALL_START_EVENT_OPTIONAL)) return undefined;
      if (!isToolCallStart(cloned.toolCall) || !isOptionalSubAgentEventInfo(cloned.subAgent)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "tool_call_delta": {
      if (!hasOnlyKeys(cloned, TOOL_CALL_DELTA_REQUIRED, TOOL_CALL_DELTA_OPTIONAL)) return undefined;
      if (
        !isNonEmptyString(cloned.id) ||
        typeof cloned.delta !== "string" ||
        !isOptionalNumber(cloned.index) ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "tool_call_complete": {
      if (!hasOnlyKeys(cloned, TOOL_CALL_COMPLETE_REQUIRED, TOOL_CALL_COMPLETE_OPTIONAL)) return undefined;
      if (
        !isNonEmptyString(cloned.id) ||
        typeof cloned.result !== "string" ||
        !isOptionalToolCallCompleteStatus(cloned.status) ||
        !isOptionalAttachmentArray(cloned.attachments) ||
        !isOptionalStringArray(cloned.ownedAttachmentIds) ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "content_block_start": {
      if (!hasOnlyKeys(cloned, CONTENT_BLOCK_START_EVENT_REQUIRED, CONTENT_BLOCK_START_EVENT_OPTIONAL)) {
        return undefined;
      }
      if (!isContentBlockStart(cloned.block) || !isOptionalSubAgentEventInfo(cloned.subAgent)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "content_block_complete": {
      if (!hasOnlyKeys(cloned, CONTENT_BLOCK_COMPLETE_REQUIRED, CONTENT_BLOCK_COMPLETE_OPTIONAL)) return undefined;
      if (
        !isContentBlock(cloned.block) ||
        !isOptionalString(cloned.data) ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "new_message": {
      if (!hasOnlyKeys(cloned, NEW_MESSAGE_REQUIRED, NEW_MESSAGE_OPTIONAL)) return undefined;
      if (!isOptionalSubAgentEventInfo(cloned.subAgent)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "done": {
      if (!hasOnlyKeys(cloned, DONE_REQUIRED, DONE_OPTIONAL)) return undefined;
      if (
        !isOptionalTokenUsage(cloned.usage) ||
        !isOptionalNumber(cloned.durationMs) ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "error": {
      if (!hasOnlyKeys(cloned, ERROR_REQUIRED, ERROR_OPTIONAL)) return undefined;
      if (
        typeof cloned.message !== "string" ||
        !isOptionalString(cloned.errorCode) ||
        !isOptionalTokenUsage(cloned.usage) ||
        !isOptionalNumber(cloned.durationMs) ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "retry": {
      if (!hasOnlyKeys(cloned, RETRY_REQUIRED, RETRY_OPTIONAL)) return undefined;
      if (
        typeof cloned.attempt !== "number" ||
        typeof cloned.maxRetries !== "number" ||
        typeof cloned.error !== "string" ||
        typeof cloned.delayMs !== "number" ||
        !isOptionalSubAgentEventInfo(cloned.subAgent)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "system_warning": {
      if (!hasOnlyKeys(cloned, SYSTEM_WARNING_REQUIRED, SYSTEM_WARNING_OPTIONAL)) return undefined;
      if (typeof cloned.message !== "string" || !isOptionalSubAgentEventInfo(cloned.subAgent)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "ask_user": {
      if (!hasOnlyKeys(cloned, ASK_USER_EVENT_REQUIRED, ASK_USER_EVENT_OPTIONAL)) return undefined;
      if (
        !isNonEmptyString(cloned.id) ||
        typeof cloned.question !== "string" ||
        !isOptionalStringArray(cloned.options) ||
        !isOptionalStringArray(cloned.optionValues) ||
        !isOptionalBoolean(cloned.multiple) ||
        !isOptionalBoolean(cloned.allowCustom)
      ) {
        return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    case "ask_user_expired":
    case "ask_user_resolved": {
      if (!hasOnlyKeys(cloned, ASK_USER_ID_ONLY_REQUIRED, ASK_USER_ID_ONLY_OPTIONAL)) return undefined;
      if (!isNonEmptyString(cloned.id)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "task_update": {
      if (!hasOnlyKeys(cloned, TASK_UPDATE_REQUIRED, TASK_UPDATE_OPTIONAL)) return undefined;
      if (!isTaskArray(cloned.tasks)) return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "compact_done": {
      if (!hasOnlyKeys(cloned, COMPACT_DONE_REQUIRED, COMPACT_DONE_OPTIONAL)) return undefined;
      if (typeof cloned.summary !== "string" || typeof cloned.originalCount !== "number") return undefined;
      return cloned as unknown as ChatStreamEvent;
    }
    case "sync": {
      if (!hasOnlyKeys(cloned, SYNC_REQUIRED, SYNC_OPTIONAL)) return undefined;
      if (!isTaskArray(cloned.tasks) || !SYNC_STATUS.has(cloned.status as string)) return undefined;
      if (cloned.streamingMessage !== undefined) {
        const streamingMessage = cloned.streamingMessage;
        if (
          !isRecord(streamingMessage) ||
          !hasOnlyKeys(streamingMessage, SYNC_STREAMING_MESSAGE_REQUIRED, SYNC_STREAMING_MESSAGE_OPTIONAL) ||
          typeof streamingMessage.content !== "string" ||
          !isOptionalString(streamingMessage.thinking) ||
          !isToolCallFullArray(streamingMessage.toolCalls)
        ) {
          return undefined;
        }
      }
      if (cloned.pendingAskUser !== undefined) {
        const pendingAskUser = cloned.pendingAskUser;
        if (!isRecord(pendingAskUser) || !isAskUserShape(pendingAskUser)) return undefined;
      }
      return cloned as unknown as ChatStreamEvent;
    }
    default:
      return undefined;
  }
};

// ============================================================================
// error 事件 -> Error 对象
// ============================================================================

export type ChatStreamErrorEvent = Extract<ChatStreamEvent, { type: "error" }>;
type ChatStreamError = Error &
  Pick<ChatStreamErrorEvent, "type"> &
  Partial<Pick<ChatStreamErrorEvent, "errorCode" | "usage" | "durationMs">>;

/**
 * 用固定字段集重建 Error，替代 `Object.assign(new Error(event.message), event)`：
 * 后者对每个 key 做的是普通 [[Set]]，若 event 上有 own enumerable 的 "__proto__" 数据属性，
 * 会经由 Error.prototype 继承的 Object.prototype.__proto__ setter 真的改写这个 Error 实例的
 * 原型链——这与调用的是哪一份 Object.assign 实现无关。cloneChatStreamEvent() 已经用
 * exact-key allowlist 排除了这种事件，这里只需要按已知字段名逐个搬运，不再整体搬运 event。
 * 用 Native.objectHasOwn 判断是否搬运每个可选字段，保留"own key 存在但值为 undefined"与
 * "整个 key 不存在"的语义差异。
 */
export const buildChatStreamError = (event: ChatStreamErrorEvent): ChatStreamError => {
  const err = new Error(event.message) as ChatStreamError;
  err.type = "error";
  if (Native.objectHasOwn(event, "errorCode")) err.errorCode = event.errorCode;
  if (Native.objectHasOwn(event, "usage")) err.usage = event.usage;
  if (Native.objectHasOwn(event, "durationMs")) err.durationMs = event.durationMs;
  return err;
};
