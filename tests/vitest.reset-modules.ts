import { cleanup } from "@testing-library/react";
import { vi } from "vitest";

// document 跨文件共享：renderHook 容器、未 cleanup 的渲染结果会被下一个文件里的
// document.querySelector 等全局查询命中。必须经 RTL 卸载，而不是直接清空 body——
// 仍挂载的 React 树稍后做 removeChild 时会因节点已被移除而抛 DOMException。
cleanup();

// isolate:false 的 worker 会跨文件共享模块缓存：先被加载的文件把真实依赖图（如 popup/App 带入的
// ScriptList/components）缓存下来后，后续文件对同一依赖的 vi.mock 无法重新绑定，用例即失败；
// 失败与否取决于文件执行顺序（本地单 worker 时必现，CI 多 worker 则碰运气）。
// 必须在 vitest.setup.ts 之前单独执行：setup 里的静态 import 会先于同文件的任何语句求值。
// 只重置模块注册表，仍共享 VM 上下文，因此不会牺牲 isolate:false 的速度。
vi.resetModules();

// vi.restoreAllMocks() 不会撤销 vi.stubGlobal；上一个文件遗留的桩（WebSocket、fetch、navigator…）
// 会泄漏到下一个文件。vitest.setup.ts 随后会重新桩入 chrome/localStorage。
vi.unstubAllGlobals();
