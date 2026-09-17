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

// API 显式接收 GM_Base 上下文。
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
  public "CAT.agent.dom.listTabs"(ctx: GMBaseContext): Promise<TabInfo[]> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "listTabs", scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.navigate"(ctx: GMBaseContext, url: string, options?: NavigateOptions): Promise<NavigateResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "navigate", url, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.readPage"(ctx: GMBaseContext, options?: ReadPageOptions): Promise<PageContent> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "readPage", options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.screenshot"(ctx: GMBaseContext, options?: ScreenshotOptions): Promise<ScreenshotResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "screenshot", options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.click"(
    ctx: GMBaseContext,
    selector: string,
    options?: DomActionOptions
  ): Promise<ActionResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "click", selector, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.fill"(
    ctx: GMBaseContext,
    selector: string,
    value: string,
    options?: DomActionOptions
  ): Promise<ActionResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "fill", selector, value, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.scroll"(
    ctx: GMBaseContext,
    direction: ScrollDirection,
    options?: ScrollOptions
  ): Promise<ScrollResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "scroll", direction, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.waitFor"(
    ctx: GMBaseContext,
    selector: string,
    options?: WaitForOptions
  ): Promise<WaitForResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "waitFor", selector, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.executeScript"(
    ctx: GMBaseContext,
    code: string,
    options?: ExecuteScriptOptions
  ): Promise<unknown> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "executeScript", code, options, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.startMonitor"(ctx: GMBaseContext, tabId: number): Promise<void> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "startMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.stopMonitor"(ctx: GMBaseContext, tabId: number): Promise<MonitorResult> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "stopMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.dom" })
  public "CAT.agent.dom.peekMonitor"(ctx: GMBaseContext, tabId: number): Promise<MonitorStatus> {
    return ctx.sendMessage("CAT_agentDom", [
      { action: "peekMonitor", tabId, scriptUuid: ctx.scriptRes?.uuid || "" } as DomApiRequest,
    ]);
  }
}
