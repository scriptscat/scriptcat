import { describe, it, expect } from "vitest";
import { generateManifest, serializeManifest, isValidExtensionId } from "./manifest-gen";

const VALID_ID = "abcdefghijklmnopabcdefghijklmnop";

describe("isValidExtensionId - 严格校验扩展 ID", () => {
  it("32 个 a-p 字符的 ID 合法", () => {
    expect(isValidExtensionId(VALID_ID)).toBe(true);
  });

  it("看似合法但含 a-p 之外字符的 ID 非法（如 fomrtutthjerocmw，其中 r/t/u/w 超出 a-p 范围）", () => {
    expect(isValidExtensionId("fomrtutthjerocmw")).toBe(false);
  });

  it("含 a-p 之外字符（如 z、数字）非法", () => {
    expect(isValidExtensionId("z".repeat(32))).toBe(false);
    expect(isValidExtensionId("1".repeat(32))).toBe(false);
  });

  it("长度不为 32 时非法", () => {
    expect(isValidExtensionId("abc")).toBe(false);
    expect(isValidExtensionId(VALID_ID + "a")).toBe(false);
  });

  it("空字符串非法", () => {
    expect(isValidExtensionId("")).toBe(false);
  });

  it("通配符非法", () => {
    expect(isValidExtensionId("*")).toBe(false);
  });
});

describe("generateManifest - 类型化 manifest 生成", () => {
  it("有效输入生成正确的 manifest", () => {
    const result = generateManifest({
      extensionIds: [VALID_ID],
      hostExecutablePath: "/usr/local/bin/scriptcat-native-host",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest).toEqual({
      name: "com.scriptcat.native_host",
      description: "ScriptCat Native Messaging Host + MCP Bridge",
      path: "/usr/local/bin/scriptcat-native-host",
      type: "stdio",
      allowed_origins: [`chrome-extension://${VALID_ID}/`],
    });
  });

  it("多个扩展 ID 生成对应的多个 allowed_origins", () => {
    const secondId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const result = generateManifest({ extensionIds: [VALID_ID, secondId], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.allowed_origins).toEqual([
      `chrome-extension://${VALID_ID}/`,
      `chrome-extension://${secondId}/`,
    ]);
  });

  it("空扩展 ID 列表被拒绝", () => {
    const result = generateManifest({ extensionIds: [], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("NO_EXTENSION_IDS");
  });

  it("非法扩展 ID 被拒绝，不生成 manifest", () => {
    const result = generateManifest({ extensionIds: ["not-valid"], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("INVALID_EXTENSION_ID");
  });

  it("看似合法但含 a-p 之外字符的 ID 非法（如 fomrtutthjerocmw，其中 r/t/u/w 超出 a-p 范围），不能被安装器复现该缺陷", () => {
    const result = generateManifest({ extensionIds: ["fomrtutthjerocmw"], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(false);
  });

  it("空 host 可执行路径被拒绝", () => {
    const result = generateManifest({ extensionIds: [VALID_ID], hostExecutablePath: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("EMPTY_HOST_PATH");
  });

  it("allowed_origins 从不包含通配符", () => {
    const result = generateManifest({ extensionIds: [VALID_ID], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.allowed_origins.every((o) => !o.includes("*"))).toBe(true);
  });
});

describe("serializeManifest - 无 BOM 的 UTF-8 输出", () => {
  it("序列化结果不含 BOM 字符", () => {
    const result = generateManifest({ extensionIds: [VALID_ID], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = serializeManifest(result.manifest);
    expect(serialized.charCodeAt(0)).not.toBe(0xfeff);
    expect(serialized.startsWith("﻿")).toBe(false);
  });

  it("序列化结果是合法 JSON，字段与输入一致", () => {
    const result = generateManifest({ extensionIds: [VALID_ID], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(serializeManifest(result.manifest));
    expect(parsed).toEqual(result.manifest);
  });

  it("序列化结果以换行符结尾", () => {
    const result = generateManifest({ extensionIds: [VALID_ID], hostExecutablePath: "/bin/host" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(serializeManifest(result.manifest).endsWith("\n")).toBe(true);
  });
});
