// CAT.agent.dom API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.dom" grant

import GMContext from "./gm_context";
import type {
  DomApiRequest,
  ReadPageOptions,
  ScreenshotOptions,
  ScreenshotResult,
  DomActionOptions,
  NavigateOptions,
  ScrollDirection,
  ScrollOptions,
  WaitForOptions,
  ExecuteScriptOptions,
  TabInfo,
  NavigateResult,
  PageContent,
  ActionResult,
  ScrollResult,
  WaitForResult,
  MonitorResult,
  MonitorStatus,
} from "@App/app/service/agent/core/types";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: <T = unknown>(api: string, params: unknown[]) => Promise<T>;
  scriptRes?: { uuid: string };
}

export default class CATAgentDomApi {
  @GMContext.protected()
  protected sendMessage!: (api: string, params: any[]) => Promise<any>;

  @GMContext.protected()
  protected scriptRes?: any;

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.listTabs"(): Promise<TabInfo[]> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "listTabs", scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.navigate"(url: string, options?: NavigateOptions): Promise<NavigateResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "navigate", url, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.readPage"(options?: ReadPageOptions): Promise<PageContent> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "readPage", options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.screenshot"(options?: ScreenshotOptions): Promise<ScreenshotResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "screenshot", options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.click"(selector: string, options?: DomActionOptions): Promise<ActionResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "click", selector, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.fill"(selector: string, value: string, options?: DomActionOptions): Promise<ActionResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "fill", selector, value, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.scroll"(direction: ScrollDirection, options?: ScrollOptions): Promise<ScrollResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "scroll", direction, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.waitFor"(selector: string, options?: WaitForOptions): Promise<WaitForResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "waitFor", selector, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.executeScript"(code: string, options?: ExecuteScriptOptions): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "executeScript", code, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.startMonitor"(tabId: number): Promise<void> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "startMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.stopMonitor"(tabId: number): Promise<MonitorResult> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "stopMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.peekMonitor"(tabId: number): Promise<MonitorStatus> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentDom", [
      { action: "peekMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }
}
