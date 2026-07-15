import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 回收站把「删除」拆成了两个事件，两边的订阅者必须严格二分：
//   trashScripts  = 脚本不再活跃 → 注销/停 cron/刷 badge/云端删除/UI 移行
//   deleteScripts = 销毁关联数据 → value/权限/资源/图标（只在彻底删除时发生）
// 订错边的后果是静默的：订阅者会永远收不到事件（比如列表不移除已删除的行），
// 而单元测试普遍 mock 掉消息层，跨上下文的 topic 不匹配跑不出来——本护栏就是为此存在。
// 曾经真实发生：ScriptList/hooks.ts 与 popup/usePopupData.ts 漏迁移，导致删除后行不消失。

const repoRoot = process.cwd();
const SCAN_DIRS = [path.join(repoRoot, "src")];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 找出订阅了指定 topic 的文件（排除 publish 调用） */
function subscribersOf(topic: string): string[] {
  const hits: string[] = [];
  for (const file of SCAN_DIRS.flatMap((d) => walk(d))) {
    const src = fs.readFileSync(file, "utf8");
    for (const line of src.split("\n")) {
      if (!line.includes(`"${topic}"`)) continue;
      if (!/subscribe/i.test(line)) continue;
      hits.push(path.relative(repoRoot, file));
      break;
    }
  }
  return hits.sort();
}

describe("回收站事件二分护栏", () => {
  it("trashScripts 的订阅者只能是「脚本不再活跃」的反应方", () => {
    expect(subscribersOf("trashScripts")).toEqual([
      "src/app/service/offscreen/script.ts", // 停掉后台/定时脚本
      "src/app/service/service_worker/popup.ts", // 清 popup 菜单缓存 + 刷 badge
      "src/app/service/service_worker/runtime.ts", // 注销脚本、失效匹配器
      "src/app/service/service_worker/synchronize.ts", // 删除云端文件 + 写墓碑
      "src/pages/options/routes/ScriptList/hooks.ts", // 从「已安装」列表移除该行
      "src/pages/popup/usePopupData.ts", // 从 popup 列表移除该行
    ]);
  });

  it("deleteScripts 的订阅者只能是「销毁关联数据」的反应方，外加只读的 UI 刷新方", () => {
    // 前四个一旦误订阅 trashScripts，脚本进回收站时数据就被销毁了，
    // 「还原」会还原出一个空壳——这正是回收站要防的事。
    expect(subscribersOf("deleteScripts")).toEqual([
      "src/app/service/service_worker/permission_verify.ts", // 清权限
      "src/app/service/service_worker/resource.ts", // 清资源
      "src/app/service/service_worker/system.ts", // 清图标
      "src/app/service/service_worker/value.ts", // 清 value
      // useTrashCount：彻底删除后刷新回收站 tab 的数量角标。它只读不销毁，故不违反二分。
      // 不可省：到期自动清理由 chrome.alarms 在 SW 里直接 purge，全程没有 UI 参与，
      // 不订阅这里角标就会一直停在旧数字（站内手动清空另有 onCountChange 回报）。
      "src/pages/options/routes/ScriptList/hooks.ts",
    ]);
  });
});
