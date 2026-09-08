/**
 * Chrome 启动参数 —— 不依赖 @playwright/test。
 *
 * 单独成文件是因为 @playwright/test 是进程级单例（被求值两次直接抛错），
 * 而 vitest 单测要能引用这里的纯逻辑；从 fixtures 引就会把浏览器驱动一并拖进单测进程。
 */

/**
 * 无头是默认：跑用例不该抢占桌面焦点，也才能让多个 worktree 同时跑。
 * `E2E_HEADED=1` 开出可见窗口，只为人工旁观用。
 *
 * 必须作为启动参数下发：`--headless=new` 会覆盖 Playwright 的 `headless` 选项，
 * 所以单独把 `headless` 设成 false（含 `--debug`/PWDEBUG）并不会开出窗口。
 */
export function headlessArgs(value = process.env.E2E_HEADED): string[] {
  const headed = /^(1|true|yes)$/i.test(value?.trim() ?? "");
  return headed ? [] : ["--headless=new"];
}
