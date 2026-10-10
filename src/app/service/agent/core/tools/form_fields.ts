import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { requireString } from "./param_utils";

export interface FormFieldToolDeps {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
}

interface FormFieldTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

export function bindToolToAssignedTab(tool: FormFieldTool, tabId: number): FormFieldTool {
  const parameters = tool.definition.parameters as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const properties = { ...parameters.properties };
  delete properties.tab_id;

  return {
    definition: {
      ...tool.definition,
      description: `${tool.definition.description} This tool is fixed to the assigned browser tab.`,
      parameters: {
        ...parameters,
        properties,
        required: parameters.required?.filter((name) => name !== "tab_id"),
      },
    },
    executor: {
      execute: (args) => tool.executor.execute({ ...args, tab_id: tabId }),
    },
  };
}

const READ_FORM_FIELD_DEFINITION: ToolDefinition = {
  name: "read_form_field",
  description: "Read one form field from the assigned browser tab without changing it.",
  parameters: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Exact CSS selector obtained from get_tab_content." },
    },
    required: ["selector"],
  },
};

const FILL_FORM_FIELD_DEFINITION: ToolDefinition = {
  name: "fill_form_field",
  description:
    "Fill one non-submitting form field in the assigned browser tab and return its actual value. Submit, button, file, hidden, disabled, and read-only controls are rejected.",
  parameters: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Exact CSS selector obtained from get_tab_content." },
      value: {
        description: "Value to assign. Use boolean for checkbox or radio fields and string for other fields.",
      },
    },
    required: ["selector", "value"],
  },
};

function serializeResult(result: unknown, tabId: number): string {
  return JSON.stringify({ result: result ?? null, tab_id: tabId });
}

export function createFormFieldTools(deps: FormFieldToolDeps, tabId: number): FormFieldTool[] {
  const readExecutor: ToolExecutor = {
    execute: async (args) => {
      const selector = requireString(args, "selector");
      const code = `
const selector = ${JSON.stringify(selector)};
const field = document.querySelector(selector);
if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
  throw new Error("Selector does not identify a supported form field");
}
return {
  selector,
  tag: field.tagName.toLowerCase(),
  type: field instanceof HTMLInputElement ? field.type : undefined,
  value: field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio") ? field.checked : field.value,
  disabled: field.disabled,
  readOnly: "readOnly" in field ? field.readOnly : false,
  required: field.required
};`;
      const result = await deps.executeInPage(code, { tabId });
      return serializeResult(result.result, result.tabId);
    },
  };

  const fillExecutor: ToolExecutor = {
    execute: async (args) => {
      const selector = requireString(args, "selector");
      const value = args.value;
      if (typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number") {
        throw new Error('参数 "value" 必须是字符串、数字或布尔值');
      }
      const code = `
const selector = ${JSON.stringify(selector)};
const value = ${JSON.stringify(value)};
const field = document.querySelector(selector);
if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
  throw new Error("Selector does not identify a supported form field");
}
const blockedTypes = ["submit", "button", "reset", "image", "file", "hidden"];
if (field instanceof HTMLInputElement && blockedTypes.includes(field.type)) {
  throw new Error("This control type cannot be filled");
}
if (field.disabled || ("readOnly" in field && field.readOnly)) {
  throw new Error("This form field is not editable");
}
if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
  if (typeof value !== "boolean") throw new Error("Checkbox and radio values must be boolean");
  field.checked = value;
} else if (field instanceof HTMLSelectElement) {
  const option = Array.from(field.options).find((candidate) => candidate.value === String(value));
  if (!option) throw new Error("The requested select option does not exist");
  field.value = option.value;
} else {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Unable to set this form field");
  setter.call(field, String(value));
}
const form = field.form;
let submissionAttempted = false;
const blockSubmission = (event) => {
  submissionAttempted = true;
  event.preventDefault();
  event.stopImmediatePropagation();
};
const originalRequestSubmit = form?.requestSubmit;
const originalSubmit = form?.submit;
if (form) {
  document.addEventListener("submit", blockSubmission, true);
  form.requestSubmit = () => { submissionAttempted = true; };
  form.submit = () => { submissionAttempted = true; };
}
try {
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
} finally {
  if (form) {
    document.removeEventListener("submit", blockSubmission, true);
    form.requestSubmit = originalRequestSubmit;
    form.submit = originalSubmit;
  }
}
if (submissionAttempted) throw new Error("Form submission attempt blocked while filling this field");
return {
  selector,
  value: field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio") ? field.checked : field.value
};`;
      const result = await deps.executeInPage(code, { tabId });
      return serializeResult(result.result, result.tabId);
    },
  };

  return [
    { definition: READ_FORM_FIELD_DEFINITION, executor: readExecutor },
    { definition: FILL_FORM_FIELD_DEFINITION, executor: fillExecutor },
  ];
}
