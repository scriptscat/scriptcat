import { describe, expect, it } from "vitest";
import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import {
  PAGE_LOAD_SCRIPT_REQUIRED_KEYS,
  hasValidPageLoadScriptShape,
  pickPageLoadScriptFields,
} from "./page_load_contract";

const createScriptLoadInfo = (): ScriptLoadInfo => ({
  uuid: "script",
  name: "Script",
  namespace: "runtime-guard",
  metadata: {},
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: "complete",
  createtime: 1,
  checktime: 1,
  code: "console.log('source')",
  value: {},
  flag: "script-flag",
  resource: {},
  originalMetadata: {},
  metadataStr: "",
  userConfigStr: "",
});

describe("page-load contract", () => {
  it("allows optional wire fields to be absent", () => {
    const requiredOnly = Object.fromEntries(PAGE_LOAD_SCRIPT_REQUIRED_KEYS.map((key) => [key, key]));

    expect(hasValidPageLoadScriptShape(requiredOnly)).toBe(true);
  });

  it("projects only contract fields without claiming to validate unknown values", () => {
    const source = createScriptLoadInfo() as ScriptLoadInfo & { originalUrlPatterns?: unknown[] };
    source.originalUrlPatterns = [];
    const resource = {} as TScriptInfo["resource"];
    const requireCssResource = {} as NonNullable<TScriptInfo["requireCssResource"]>;

    const picked = pickPageLoadScriptFields(source, {
      resource,
      requireCssResource,
      code: "",
    });

    expect(Object.hasOwn(picked, "originalUrlPatterns")).toBe(false);
    expect(hasValidPageLoadScriptShape(picked)).toBe(true);
  });

  it("rejects unexpected top-level fields", () => {
    const value: Record<string, unknown> = Object.fromEntries(PAGE_LOAD_SCRIPT_REQUIRED_KEYS.map((key) => [key, key]));
    value.unexpected = true;

    expect(hasValidPageLoadScriptShape(value)).toBe(false);
  });
});
