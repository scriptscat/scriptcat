import { expect, it } from "vitest";
import type { Message } from "@Packages/message/types";
import type { ScriptLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import { initEnvInfo, ScriptExecutor } from "./script_executor";
import { compilePreInjectScript, compileScriptCode } from "./utils";
import { ScriptEnvTag } from "@Packages/message/consts";
import { pageDispatchEvent } from "@Packages/message/common";

const script: ScriptLoadInfo = {
  uuid: "late-early-script",
  name: "Late early script",
  namespace: "executor.test",
  type: 1,
  status: 1,
  sort: 0,
  runStatus: "complete",
  createtime: 1,
  checktime: 1,
  code: "",
  value: {},
  flag: "late-early-script-flag",
  scriptRevision: "late-early-script-revision",
  resource: {},
  metadata: { grant: ["GM_log"], "early-start": [""], "run-at": ["document-start"] },
  originalMetadata: {},
  metadataStr: "",
  userConfigStr: "",
};

it("does not execute an early wrapper twice when it mounts after page-load", () => {
  const executor = new ScriptExecutor({ sendMessage: () => undefined } as unknown as Message, {} as Message);
  const currentScript = {
    ...script,
    executionHandle: "late-page-binding",
    executionEnvTag: "it",
    executionRunFlag: "late-run-flag",
  } as unknown as TScriptInfo;
  const pageWindow = window as unknown as Record<string, unknown>;
  const testPerformance = {
    dispatchEvent: (event: Event) => pageDispatchEvent(event),
    addEventListener: () => undefined,
  };
  const generated = new Function(
    "window",
    "performance",
    "CustomEvent",
    compilePreInjectScript(
      script,
      compileScriptCode(script, "unsafeWindow.__lateEarlyRuns = (unsafeWindow.__lateEarlyRuns || 0) + 1;")
    )
  );

  try {
    executor.checkEarlyStartScript(ScriptEnvTag.inject, initEnvInfo);
    executor.startScripts([currentScript], initEnvInfo);
    generated(pageWindow, testPerformance, CustomEvent);

    expect(pageWindow.__lateEarlyRuns).toBe(1);
  } finally {
    delete pageWindow[script.flag];
    delete pageWindow.__lateEarlyRuns;
  }
});
