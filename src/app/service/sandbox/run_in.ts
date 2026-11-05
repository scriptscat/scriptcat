import type { SCMetadata } from "@App/app/repo/metadata";
import type { TExtensionEnv } from "../extension/extension_env";

/**
 * 后台/定时脚本的 @run-in 是否允许它在该扩展环境的 sandbox 中运行。sandbox 据此跳过不匹配的运行，
 * 外部接入 scripts.run 据此在触发前拒绝，两处必须同一判断。拿不到隐身状态时不过滤（fail-open），
 * 避免静默丢失任务。
 */
export function backgroundRunInAllowed(metadata: SCMetadata | undefined, extensionEnv: TExtensionEnv | undefined) {
  const runIn = metadata?.["run-in"]?.[0];
  const inIncognitoContext = extensionEnv?.inIncognitoContext;
  // Firefox spanning 只有一个共享 event page / sandbox，没有按普通窗口与隐身窗口拆分的后台环境。
  // 因此后台/定时脚本只能运行一次；tab 专属的 run-in 值在该共享环境中不做伪隔离。
  const hasPerContextBackground = extensionEnv?.incognitoMode !== "spanning";
  if (hasPerContextBackground && runIn && runIn !== "all" && typeof inIncognitoContext === "boolean") {
    return runIn === (inIncognitoContext ? "incognito-tabs" : "normal-tabs");
  }
  return true;
}
