// @vitest-environment node
import { describe, it, expect, vi, afterAll } from "vitest";

// 配置在导入时按 process.env.CI 求值；须在导入前清空，才能断言本地（非 CI）分支。
vi.hoisted(() => {
  vi.stubEnv("CI", "");
});

import config from "../vitest.config.ts";

// Vitest 4 对 vmThreads/vmForks 强制 isolate=false，且在 isolate=false && maxWorkers===1 时
// 把整个项目的文件合并成一个任务、跑在同一个 VM 上下文里：setup 只执行一次，
// 模块缓存、vi.mock 与 chrome mock 在文件之间共享，测试互相污染。
describe("vitest 配置 - vm 池按文件隔离", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("本地（非 CI）运行时 vm 池项目的 maxWorkers 不能为 1", () => {
    const vmProjects = (config.test?.projects ?? [])
      .flatMap((project) => (typeof project === "object" && "test" in project && project.test ? [project.test] : []))
      .filter((test) => test.pool === "vmThreads" || test.pool === "vmForks")
      .map((test) => ({
        name: typeof test.name === "object" ? test.name.label : test.name,
        maxWorkers: test.maxWorkers,
      }));

    expect(vmProjects.map((project) => project.name)).toEqual(["fast", "ui"]);
    for (const project of vmProjects) {
      expect(project.maxWorkers, project.name).not.toBe(1);
    }
  });
});
