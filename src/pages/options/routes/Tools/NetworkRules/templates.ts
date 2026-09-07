import {
  CSP_RESPONSE_HEADERS,
  X_FRAME_OPTIONS_HEADER,
  cspRemovalAction,
  isDeniedRequestHeader,
  isValidHeaderName,
  type NetworkRuleAction,
  type NetworkRuleActionType,
  type NetworkRuleHeaderEdit,
  type NetworkRuleHeaderOperation,
} from "@App/app/repo/network_rule";
import type { NetworkRuleResourceType } from "@App/pkg/utils/network_rule_condition";

export const RULE_TEMPLATE_IDS = [
  "csp",
  "userAgent",
  "referer",
  "responseHeaders",
  "block",
  "redirect",
  "custom",
] as const;
export type RuleTemplateId = (typeof RULE_TEMPLATE_IDS)[number];

export const USER_AGENT_HEADER = "user-agent";

export const USER_AGENT_PRESETS = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};
export const REFERER_HEADER = "referer";

/** 「移除 CSP」只作用于文档请求，页面内的子资源不携带 CSP 响应头。 */
export const CSP_RESOURCE_TYPES: NetworkRuleResourceType[] = ["main_frame", "sub_frame"];

export type HeaderDraft = { header: string; operation: NetworkRuleHeaderOperation; value: string };

export type ActionDraft = {
  /** 只有「自定义」模板会让用户改动它，其余模板由模板本身固定。 */
  actionType: NetworkRuleActionType;
  includeXFrameOptions: boolean;
  userAgent: string;
  refererOperation: Extract<NetworkRuleHeaderOperation, "set" | "remove">;
  referer: string;
  headers: HeaderDraft[];
  redirectUrl: string;
};

export type DraftErrorKey =
  | "required"
  | "header_name_invalid"
  | "header_denied"
  | "header_value_required"
  | "redirect_url_invalid";

export type ActionDraftErrors = { headers: (DraftErrorKey | undefined)[]; action?: DraftErrorKey };

const EMPTY_HEADER: HeaderDraft = { header: "", operation: "set", value: "" };

export const ACTION_TYPE_BY_TEMPLATE: Record<Exclude<RuleTemplateId, "custom">, NetworkRuleActionType> = {
  csp: "removeResponseHeaders",
  userAgent: "modifyRequestHeaders",
  referer: "modifyRequestHeaders",
  responseHeaders: "modifyResponseHeaders",
  block: "block",
  redirect: "redirect",
};

export function emptyActionDraft(template: RuleTemplateId): ActionDraft {
  const actionType = template === "custom" ? "block" : ACTION_TYPE_BY_TEMPLATE[template];
  return {
    actionType,
    includeXFrameOptions: false,
    userAgent: "",
    refererOperation: "set",
    referer: "",
    headers: [{ ...EMPTY_HEADER }],
    redirectUrl: "",
  };
}

/** 动作里带值的头改写才需要值列；移除响应头只填头名。 */
export function editsHeaderList(actionType: NetworkRuleActionType): boolean {
  return (
    actionType === "modifyRequestHeaders" ||
    actionType === "modifyResponseHeaders" ||
    actionType === "removeResponseHeaders"
  );
}

export function editsRequestHeaders(actionType: NetworkRuleActionType): boolean {
  return actionType === "modifyRequestHeaders";
}

function sameHeaderSet(headers: string[], expected: string[]): boolean {
  return headers.length === expected.length && expected.every((header) => headers.includes(header));
}

export function detectTemplate(action: NetworkRuleAction): RuleTemplateId {
  switch (action.type) {
    case "removeResponseHeaders":
      if (sameHeaderSet(action.headers, CSP_RESPONSE_HEADERS)) return "csp";
      if (sameHeaderSet(action.headers, [...CSP_RESPONSE_HEADERS, X_FRAME_OPTIONS_HEADER])) return "csp";
      return "custom";
    case "modifyRequestHeaders": {
      const [edit] = action.headers;
      if (action.headers.length !== 1) return "custom";
      if (edit.header === USER_AGENT_HEADER && edit.operation === "set") return "userAgent";
      if (edit.header === REFERER_HEADER && edit.operation !== "append") return "referer";
      return "custom";
    }
    case "modifyResponseHeaders":
      return "responseHeaders";
    case "block":
      return "block";
    case "redirect":
      return "redirect";
    case "allow":
      return "custom";
  }
}

export function actionDraftFrom(action: NetworkRuleAction): ActionDraft {
  const draft = emptyActionDraft(detectTemplate(action));
  draft.actionType = action.type;
  switch (action.type) {
    case "removeResponseHeaders":
      draft.includeXFrameOptions = action.headers.includes(X_FRAME_OPTIONS_HEADER);
      draft.headers = action.headers.map((header) => ({ header, operation: "remove", value: "" }));
      return draft;
    case "modifyRequestHeaders":
    case "modifyResponseHeaders": {
      const [edit] = action.headers;
      if (action.type === "modifyRequestHeaders" && action.headers.length === 1) {
        if (edit.header === USER_AGENT_HEADER) draft.userAgent = edit.value ?? "";
        if (edit.header === REFERER_HEADER) {
          draft.refererOperation = edit.operation === "remove" ? "remove" : "set";
          draft.referer = edit.value ?? "";
        }
      }
      draft.headers = action.headers.map(({ header, operation, value }) => ({
        header,
        operation,
        value: value ?? "",
      }));
      return draft;
    }
    case "redirect":
      draft.redirectUrl = action.url;
      return draft;
    default:
      return draft;
  }
}

function normalizeHeaderName(input: string): string {
  return input.trim().toLowerCase();
}

function headerRowError(row: HeaderDraft, actionType: NetworkRuleActionType): DraftErrorKey | undefined {
  const header = normalizeHeaderName(row.header);
  if (!header) return "required";
  if (!isValidHeaderName(header)) return "header_name_invalid";
  if (editsRequestHeaders(actionType) && isDeniedRequestHeader(header)) return "header_denied";
  if (actionType !== "removeResponseHeaders" && row.operation !== "remove" && !row.value.trim()) {
    return "header_value_required";
  }
  return undefined;
}

export function validateActionDraft(template: RuleTemplateId, draft: ActionDraft): ActionDraftErrors {
  const actionType = template === "custom" ? draft.actionType : ACTION_TYPE_BY_TEMPLATE[template];
  if (template === "userAgent") return { headers: [], action: draft.userAgent.trim() ? undefined : "required" };
  if (template === "referer") {
    const missing = draft.refererOperation === "set" && !draft.referer.trim();
    return { headers: [], action: missing ? "required" : undefined };
  }
  if (actionType === "redirect") {
    const url = draft.redirectUrl.trim();
    if (!url) return { headers: [], action: "required" };
    try {
      const parsed = new URL(url);
      const supported = parsed.protocol === "http:" || parsed.protocol === "https:";
      return { headers: [], action: supported ? undefined : "redirect_url_invalid" };
    } catch {
      return { headers: [], action: "redirect_url_invalid" };
    }
  }
  if (template === "csp" || !editsHeaderList(actionType)) return { headers: [] };
  return { headers: draft.headers.map((row) => headerRowError(row, actionType)) };
}

export function hasActionDraftError({ headers, action }: ActionDraftErrors): boolean {
  return action !== undefined || headers.some((error) => error !== undefined);
}

function headerEdits(draft: ActionDraft): NetworkRuleHeaderEdit[] {
  return draft.headers.map(({ header, operation, value }) =>
    operation === "remove"
      ? { header: normalizeHeaderName(header), operation }
      : { header: normalizeHeaderName(header), operation, value: value.trim() }
  );
}

export function buildAction(template: RuleTemplateId, draft: ActionDraft): NetworkRuleAction {
  const actionType = template === "custom" ? draft.actionType : ACTION_TYPE_BY_TEMPLATE[template];
  switch (template) {
    case "csp":
      return cspRemovalAction(draft.includeXFrameOptions);
    case "userAgent":
      return {
        type: "modifyRequestHeaders",
        headers: [{ header: USER_AGENT_HEADER, operation: "set", value: draft.userAgent.trim() }],
      };
    case "referer":
      return {
        type: "modifyRequestHeaders",
        headers: [
          draft.refererOperation === "remove"
            ? { header: REFERER_HEADER, operation: "remove" }
            : { header: REFERER_HEADER, operation: "set", value: draft.referer.trim() },
        ],
      };
    default:
      break;
  }
  switch (actionType) {
    case "removeResponseHeaders":
      return { type: "removeResponseHeaders", headers: draft.headers.map((row) => normalizeHeaderName(row.header)) };
    case "modifyRequestHeaders":
      return { type: "modifyRequestHeaders", headers: headerEdits(draft) };
    case "modifyResponseHeaders":
      return { type: "modifyResponseHeaders", headers: headerEdits(draft) };
    case "redirect":
      return { type: "redirect", url: draft.redirectUrl.trim() };
    case "allow":
      return { type: "allow" };
    case "block":
      return { type: "block" };
  }
}
