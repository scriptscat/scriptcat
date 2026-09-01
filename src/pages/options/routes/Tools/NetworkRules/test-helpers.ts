import { vi } from "vitest";
import { notify } from "@App/pages/components/ui/toast";

const NOTIFY_METHODS = ["success", "error", "info", "warning"] as const;

/**
 * ui project 以 isolate:false 运行，同一 worker 内模块缓存跨测试文件共享：谁先加载被测组件，
 * 组件里的 `notify` 就永久绑定到那个文件 vi.mock 工厂产出的对象，后续文件再 mock 也收不到调用。
 * 所以不替换模块，改为在真实 notify 单例上打桩；调用方须在 afterEach 里 vi.restoreAllMocks() 还原，
 * 否则桩会随单例泄漏给同 worker 的其他测试文件。
 */
export function stubNotify() {
  for (const method of NOTIFY_METHODS) vi.spyOn(notify, method).mockReturnValue("");
}
