import { describe, it, expect } from "vitest";
import type { SCMetadata } from "@App/app/repo/metadata";
import { derivePermissions, derivePermissionDiff } from "./permissions";

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

describe("derivePermissionDiff 权限差异派生", () => {
  it("新增的取值被标进 diff.added,未变动的不进", () => {
    const rows = derivePermissionDiff(
      { connect: ["api.example.com"] },
      { connect: ["api.example.com", "cdn.example.com"] }
    );
    const connect = rows.find((r) => r.kind === "connect")!;
    expect(connect.diff!.added).toEqual(["cdn.example.com"]);
    expect(connect.diff!.removed).toEqual([]);
  });

  it("旧版本有、新版本没有的取值进 diff.removed", () => {
    const rows = derivePermissionDiff({ grant: ["GM_setValue", "GM_notification"] }, { grant: ["GM_setValue"] });
    const grant = rows.find((r) => r.kind === "grant")!;
    expect(grant.diff!.removed).toEqual(["GM_notification"]);
    expect(grant.values).toEqual(["GM_setValue"]);
  });

  it("权限完全一致时每行的 diff 增删都为空", () => {
    const metadata: SCMetadata = { match: ["https://a.com/*"], grant: ["GM_setValue"] };
    const rows = derivePermissionDiff(metadata, metadata);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.diff!.added.length === 0 && r.diff!.removed.length === 0)).toBe(true);
  });

  it("类别计数取新版本取值,移除项不计入 values", () => {
    const rows = derivePermissionDiff(
      { grant: ["GM_setValue", "GM_notification"] },
      { grant: ["GM_setValue", "GM_cookie"] }
    );
    const grant = rows.find((r) => r.kind === "grant")!;
    expect(grant.values).toHaveLength(2);
    expect(grant.values).not.toContain("GM_notification");
  });

  it("类别在新版本被清空但旧版本非空时仍然成行,风险降为 normal", () => {
    const rows = derivePermissionDiff({ connect: ["*"] }, {});
    const connect = rows.find((r) => r.kind === "connect")!;
    expect(connect.values).toEqual([]);
    expect(connect.diff!.removed).toEqual(["*"]);
    expect(connect.risk).toBe("normal");
  });

  it("新旧两版都没有的类别不成行", () => {
    const rows = derivePermissionDiff({ match: ["https://a.com/*"] }, { match: ["https://a.com/*"] });
    expect(rows.map((r) => r.kind)).toEqual(["match"]);
  });

  it("有变动的类别排在未变动的高危类别之前", () => {
    const rows = derivePermissionDiff(
      { connect: ["*"], match: ["https://a.com/*"] },
      { connect: ["*"], match: ["https://a.com/*", "https://b.com/*"] }
    );
    expect(rows.map((r) => r.kind)).toEqual(["match", "connect"]);
  });

  it("同为有变动时仍按风险排序", () => {
    const rows = derivePermissionDiff({}, { connect: ["*"], match: ["https://a.com/*"] });
    expect(rows.map((r) => r.kind)).toEqual(["connect", "match"]);
  });

  it("新增的危险取值仍排在该行取值最前", () => {
    const rows = derivePermissionDiff({ connect: ["api.example.com"] }, { connect: ["api.example.com", "*"] });
    const connect = rows.find((r) => r.kind === "connect")!;
    expect(connect.values[0]).toBe("*");
    expect(connect.risk).toBe("danger");
    expect(connect.diff!.added).toEqual(["*"]);
  });
});
