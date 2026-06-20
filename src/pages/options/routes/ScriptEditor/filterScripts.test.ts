import { describe, it, expect } from "vitest";
import type { Script } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
  type SCRIPT_TYPE,
} from "@App/app/repo/scripts";
import { filterScripts } from "./filterScripts";

const mk = (uuid: string, name: string, type: SCRIPT_TYPE, sort = 0): Script =>
  ({
    uuid,
    name,
    namespace: "",
    metadata: { name: [name] },
    type,
    status: SCRIPT_STATUS_ENABLE,
    sort,
    runStatus: "complete",
    createtime: 0,
    checktime: 0,
  }) as unknown as Script;

describe("filterScripts 扁平脚本列表", () => {
  it("应返回不分类型的扁平列表，并按 sort 升序排列", () => {
    const scripts = [
      mk("c", "定时脚本", SCRIPT_TYPE_CRONTAB, 2),
      mk("n", "普通脚本", SCRIPT_TYPE_NORMAL, 0),
      mk("b", "后台脚本", SCRIPT_TYPE_BACKGROUND, 1),
    ];
    expect(filterScripts(scripts, "").map((s) => s.uuid)).toEqual(["n", "b", "c"]);
  });

  it("应按关键词大小写不敏感过滤", () => {
    const scripts = [
      mk("a", "Bilibili Evolved", SCRIPT_TYPE_NORMAL),
      mk("b", "网页翻译助手", SCRIPT_TYPE_NORMAL),
      mk("c", "后台签到", SCRIPT_TYPE_BACKGROUND),
    ];
    expect(filterScripts(scripts, "bili").map((s) => s.uuid)).toEqual(["a"]);
  });

  it("空关键词应返回全部脚本", () => {
    const scripts = [mk("a", "x", SCRIPT_TYPE_NORMAL), mk("b", "y", SCRIPT_TYPE_BACKGROUND)];
    expect(filterScripts(scripts, "")).toHaveLength(2);
  });
});
