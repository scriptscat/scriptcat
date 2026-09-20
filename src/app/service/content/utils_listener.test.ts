import { describe, expect, it, vi } from "vitest";
import { Native } from "./global";
import { compileInjectScript, definePropertyListener, getCompiledScriptMetadata } from "./utils";
import type { ScriptRunResource } from "@App/app/repo/scripts";

describe.sequential("definePropertyListener", () => {
  it("uses captured descriptor operations and preserves a replacement setter", () => {
    const originalDefineProperty = Object.defineProperty;
    const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const target: Record<string, unknown> = {};
    const listener = vi.fn((_value: unknown) => {
      Native.objectDefineProperty(target, "script", {
        configurable: true,
        set: replacementSetter,
      });
    });
    const replacementSetter = vi.fn();
    const poisoned = () => {
      throw new Error("page replaced Object descriptor method");
    };

    let setupError: unknown;
    let assignmentError: unknown;
    Object.defineProperty = poisoned as typeof Object.defineProperty;
    Object.getOwnPropertyDescriptor = poisoned as typeof Object.getOwnPropertyDescriptor;
    try {
      try {
        definePropertyListener(target, "script", listener);
      } catch (error) {
        setupError = error;
      }
      try {
        target.script = "first";
      } catch (error) {
        assignmentError = error;
      }
    } finally {
      Object.defineProperty = originalDefineProperty;
      Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
    }

    expect(setupError).toBeUndefined();
    expect(assignmentError).toBeUndefined();
    target.script = "second";
    expect(listener).toHaveBeenCalledOnce();
    expect(replacementSetter).toHaveBeenCalledOnce();
  });

  it("preserves a replacement data property on the already-defined path", () => {
    const originalDefineProperty = Object.defineProperty;
    const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const target: Record<string, unknown> = { script: "already-mounted" };
    const poisoned = () => {
      throw new Error("page replaced Object descriptor method");
    };

    let setupError: unknown;
    Object.defineProperty = poisoned as typeof Object.defineProperty;
    Object.getOwnPropertyDescriptor = poisoned as typeof Object.getOwnPropertyDescriptor;
    try {
      try {
        definePropertyListener(target, "script", (value) => {
          Native.objectDefineProperty(target, "script", {
            configurable: true,
            enumerable: true,
            value: `handled:${value}`,
            writable: true,
          });
        });
      } catch (error) {
        setupError = error;
      }
    } finally {
      Object.defineProperty = originalDefineProperty;
      Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
    }

    expect(setupError).toBeUndefined();
    expect(target.script).toBe("handled:already-mounted");
  });

  it("inspects compiled wrappers with the captured Function.prototype.toString", () => {
    const target: Record<string, unknown> = {};
    const script: ScriptRunResource = {
      uuid: "captured-to-string-script",
      name: "Captured Function.toString",
      namespace: "captured.to.string",
      type: 1,
      status: 1,
      sort: 0,
      runStatus: "complete",
      createtime: 1,
      checktime: 1,
      code: "",
      value: {},
      flag: "captured-to-string-flag",
      resource: {},
      metadata: {},
      originalMetadata: {},
    };
    new Function("window", compileInjectScript(script, "return undefined;"))(target);
    const wrapper = target[script.flag];
    const originalToString = Function.prototype.toString;
    let metadata: string | undefined;

    Function.prototype.toString = () => "page replacement";
    try {
      metadata = getCompiledScriptMetadata(wrapper);
    } finally {
      Function.prototype.toString = originalToString;
    }

    expect(metadata).toContain(script.uuid);
    expect(metadata).toContain(script.flag);
    expect(Native.functionToString(wrapper as object)).toContain("return m");
  });

  it("skips an undefined non-configurable property that cannot be observed", () => {
    const target: Record<string, unknown> = {};
    Native.objectDefineProperty(target, "script", {
      configurable: false,
      get: () => undefined,
    });

    expect(() => definePropertyListener(target, "script", vi.fn())).not.toThrow();
    expect(Native.objectGetOwnPropertyDescriptor(target, "script")?.configurable).toBe(false);
  });
});
