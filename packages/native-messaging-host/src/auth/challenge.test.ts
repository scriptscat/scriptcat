import { describe, it, expect } from "vitest";
import { generateNonce, computeMac, verifyMac } from "./challenge";

describe("generateNonce", () => {
  it("生成 32 字节（64 十六进制字符）随机数", () => {
    expect(generateNonce()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("每次调用生成不同的 nonce", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("computeMac / verifyMac - HMAC 挑战响应", () => {
  const tokenHash = "a".repeat(64);
  const nonce = generateNonce();
  const endpoint = "/run/scriptcat-mcp-abc123.sock";

  it("正确的 tokenHash/nonce/endpoint 组合验证通过", () => {
    const mac = computeMac(tokenHash, nonce, endpoint);
    expect(verifyMac(tokenHash, nonce, endpoint, mac)).toBe(true);
  });

  it("错误的 token 验证失败", () => {
    const mac = computeMac(tokenHash, nonce, endpoint);
    expect(verifyMac("b".repeat(64), nonce, endpoint, mac)).toBe(false);
  });

  it("重放到不同 endpoint 时验证失败 —— 端点名已绑定进 MAC", () => {
    const mac = computeMac(tokenHash, nonce, endpoint);
    expect(verifyMac(tokenHash, nonce, "/run/scriptcat-mcp-different.sock", mac)).toBe(false);
  });

  it("重放到不同 nonce 时验证失败", () => {
    const mac = computeMac(tokenHash, nonce, endpoint);
    expect(verifyMac(tokenHash, generateNonce(), endpoint, mac)).toBe(false);
  });

  it("非法十六进制字符串的 candidateMac 不会抛出，只是验证失败", () => {
    expect(verifyMac(tokenHash, nonce, endpoint, "not-hex-zzz")).toBe(false);
  });

  it("candidateMac 运行时类型与声明不符（如解析 JSON 得到 null）时 Buffer.from 抛出，仍应捕获并返回 false 而非让调用方崩溃", () => {
    // candidateMac arrives over the socket as parsed JSON — untrusted input whose runtime shape
    // isn't guaranteed to match the `string` type declaration. Buffer.from(null, "hex") throws a
    // TypeError, which is exactly what the try/catch in verifyMac exists to swallow.
    expect(verifyMac(tokenHash, nonce, endpoint, null as unknown as string)).toBe(false);
  });

  it("长度不同的 candidateMac 验证失败", () => {
    expect(verifyMac(tokenHash, nonce, endpoint, "ab")).toBe(false);
  });
});
