import { describe, it, expect } from "vitest";
import type { SCMetadata } from "@App/app/repo/metadata";
import { derivePermissions, derivePermissionDiff, isPermissionChanged } from "./permissions";

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

describe("derivePermissionDiff 外部资源只改查询参数", () => {
  it("同一地址只换了 ?v= 时记为一条更新,不再算一增一删", () => {
    const rows = derivePermissionDiff(
      { require: ["https://cdn.example.com/lib.js?v1.2.0"] },
      { require: ["https://cdn.example.com/lib.js?v1.3.0"] }
    );
    const require = rows.find((r) => r.kind === "require")!;
    expect(require.diff).toEqual({
      added: [],
      removed: [],
      updated: [{ from: "https://cdn.example.com/lib.js?v1.2.0", to: "https://cdn.example.com/lib.js?v1.3.0" }],
    });
    expect(isPermissionChanged(require)).toBe(true);
  });

  it("@resource 的资源名与地址都相同、只换查询参数时同样合并", () => {
    const rows = derivePermissionDiff(
      { resource: ["css https://cdn.example.com/a.css?1"] },
      { resource: ["css https://cdn.example.com/a.css?2"] }
    );
    expect(rows[0].diff!.updated).toEqual([
      { from: "css https://cdn.example.com/a.css?1", to: "css https://cdn.example.com/a.css?2" },
    ]);
  });

  it("换了域名或路径不是同一资源,仍按一增一删呈现", () => {
    const rows = derivePermissionDiff(
      { require: ["https://greasyfork.org/lib.js?v1"] },
      { require: ["https://raw.githubusercontent.com/lib.js?v2"] }
    );
    expect(rows[0].diff).toEqual({
      added: ["https://raw.githubusercontent.com/lib.js?v2"],
      removed: ["https://greasyfork.org/lib.js?v1"],
      updated: [],
    });
  });

  it("同一地址在一侧出现多次时无法一一对应,不合并", () => {
    const rows = derivePermissionDiff(
      { require: ["https://a.com/lib.js?v1"] },
      { require: ["https://a.com/lib.js?v2", "https://a.com/lib.js?v3"] }
    );
    expect(rows[0].diff!.updated).toEqual([]);
    expect(rows[0].diff!.added).toEqual(["https://a.com/lib.js?v2", "https://a.com/lib.js?v3"]);
    expect(rows[0].diff!.removed).toEqual(["https://a.com/lib.js?v1"]);
  });

  it("跨域访问等其他类别不做合并", () => {
    const rows = derivePermissionDiff({ match: ["https://a.com/*?x=1"] }, { match: ["https://a.com/*?x=2"] });
    expect(rows[0].diff!.updated).toEqual([]);
    expect(rows[0].diff!.added).toEqual(["https://a.com/*?x=2"]);
  });
});
