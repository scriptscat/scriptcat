import { describe, it, expect } from "vitest";
import type { SCMetadata } from "@App/app/repo/metadata";
import { derivePermissions } from "./permissions";

describe("derivePermissions 权限派生", () => {
  it("无任何权限元数据时返回空数组", () => {
    expect(derivePermissions({})).toEqual([]);
  });

  it("将 @match 派生为运行网站权限行,风险为 normal", () => {
    const metadata: SCMetadata = { match: ["https://example.com/*"] };
    const rows = derivePermissions(metadata);
    const match = rows.find((r) => r.kind === "match");
    expect(match).toBeDefined();
    expect(match!.risk).toBe("normal");
    expect(match!.values).toEqual(["https://example.com/*"]);
  });

  it("@include 与 @match 合并进运行网站行", () => {
    const metadata: SCMetadata = {
      match: ["https://a.com/*"],
      include: ["https://b.com/*"],
    };
    const rows = derivePermissions(metadata);
    const match = rows.find((r) => r.kind === "match");
    expect(match!.values).toEqual(["https://a.com/*", "https://b.com/*"]);
  });

  it("@connect 普通域名时跨域访问行风险为 warn", () => {
    const rows = derivePermissions({ connect: ["api.example.com"] });
    const connect = rows.find((r) => r.kind === "connect");
    expect(connect!.risk).toBe("warn");
  });

  it("@connect 为 * 时跨域访问行标记为 danger", () => {
    const rows = derivePermissions({ connect: ["*"] });
    const connect = rows.find((r) => r.kind === "connect");
    expect(connect!.risk).toBe("danger");
  });

  it("@connect 中 * 应排在普通域名前面", () => {
    const rows = derivePermissions({ connect: ["api.example.com", "*", "cdn.example.com"] });
    const connect = rows.find((r) => r.kind === "connect");
    expect(connect!.values).toEqual(["*", "api.example.com", "cdn.example.com"]);
  });

  it("@grant 派生为 GM 能力行,风险为 warn", () => {
    const rows = derivePermissions({ grant: ["GM_setValue", "GM_getValue"] });
    const grant = rows.find((r) => r.kind === "grant");
    expect(grant!.risk).toBe("warn");
    expect(grant!.values).toEqual(["GM_setValue", "GM_getValue"]);
    expect(grant!.sensitive).toEqual([]);
  });

  it("@grant 含 GM_cookie 时标记为敏感能力", () => {
    const rows = derivePermissions({ grant: ["GM_setValue", "GM_cookie"] });
    const grant = rows.find((r) => r.kind === "grant");
    expect(grant!.sensitive).toEqual(["GM_cookie"]);
  });

  it("@grant 中敏感 GM 能力应排在普通能力前面", () => {
    const rows = derivePermissions({ grant: ["GM_setValue", "GM_cookie", "GM_getValue"] });
    const grant = rows.find((r) => r.kind === "grant");
    expect(grant!.values).toEqual(["GM_cookie", "GM_setValue", "GM_getValue"]);
    expect(grant!.sensitive).toEqual(["GM_cookie"]);
  });

  it("@grant 为 none 时不输出 GM 能力行", () => {
    const rows = derivePermissions({ grant: ["none"] });
    expect(rows.find((r) => r.kind === "grant")).toBeUndefined();
  });

  it("@require 与 @resource 合并为外部资源行,风险为 normal", () => {
    const rows = derivePermissions({
      require: ["https://cdn.example.com/lib.js"],
      resource: ["logo https://cdn.example.com/logo.png"],
    });
    const require = rows.find((r) => r.kind === "require");
    expect(require!.risk).toBe("normal");
    expect(require!.values).toEqual(["https://cdn.example.com/lib.js", "logo https://cdn.example.com/logo.png"]);
  });

  it("权限行按高危、告警、普通排序,同风险保持类别顺序", () => {
    const metadata: SCMetadata = {
      require: ["https://cdn.example.com/lib.js"],
      grant: ["GM_setValue"],
      connect: ["*"],
      match: ["https://example.com/*"],
    };
    const rows = derivePermissions(metadata);
    expect(rows.map((r) => r.kind)).toEqual(["connect", "grant", "match", "require"]);
    expect(rows.map((r) => r.risk)).toEqual(["danger", "warn", "normal", "normal"]);
  });
});
