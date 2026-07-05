import { useTranslation } from "react-i18next";
import { Loader2, Plug, Wrench, MessageSquareQuote } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@App/pages/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@App/pages/components/ui/tabs";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt } from "@App/app/service/agent/core/types";

// 详情抽屉 Tab：品牌色下划线激活态（覆盖 shadcn 默认胶囊样式）
const TAB_LIST_CLASS = "h-11 w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 px-5";
const TAB_TRIGGER_CLASS =
  "-mb-px h-11 rounded-none border-b-2 pt-[2px] border-transparent bg-transparent px-0.5 font-normal text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none";

function ParamChips({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema?.properties as Record<string, unknown>) ?? {};
  const required = (schema?.required as string[]) ?? [];
  const keys = Object.keys(properties);
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {keys.map((k) => (
        <code key={k} className="rounded-[5px] bg-muted px-[7px] py-0.5 font-mono text-[10px] text-muted-foreground">
          {k}
          {required.includes(k) ? "" : "?"}
        </code>
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function McpDetailSheet({
  open,
  server,
  onOpenChange,
  tools,
  resources,
  prompts,
  loading,
}: {
  open: boolean;
  server: MCPServerConfig | null;
  onOpenChange: (v: boolean) => void;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
  loading: boolean;
}) {
  const { t } = useTranslation(["agent"]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="flex-row items-center gap-2.5 border-b border-border px-5 py-4 text-left">
          <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-success-bg">
            <Plug className="size-[17px] text-success-fg" />
          </div>
          <div className="flex min-w-0 flex-col gap-px">
            <SheetTitle className="truncate text-[15px]">{server?.name}</SheetTitle>
            <SheetDescription className="truncate font-mono text-[11px]">{server?.url}</SheetDescription>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("agent:mcp_loading")}
          </div>
        ) : (
          <Tabs defaultValue="tools" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className={TAB_LIST_CLASS}>
              <TabsTrigger data-testid="tab-tools" value="tools" className={TAB_TRIGGER_CLASS}>
                {t("agent:mcp_tools")} {`(${tools.length})`}
              </TabsTrigger>
              <TabsTrigger data-testid="tab-resources" value="resources" className={TAB_TRIGGER_CLASS}>
                {t("agent:mcp_resources")} {`(${resources.length})`}
              </TabsTrigger>
              <TabsTrigger data-testid="tab-prompts" value="prompts" className={TAB_TRIGGER_CLASS}>
                {t("agent:mcp_prompts")} {`(${prompts.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tools" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              {tools.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_tools")} />
              ) : (
                <div className="flex flex-col">
                  {tools.map((tool) => (
                    <div key={tool.name} className="flex flex-col gap-2 border-b border-border px-5 py-[15px]">
                      <div className="flex items-center gap-2">
                        <Wrench className="size-3.5 shrink-0 text-primary" />
                        <code className="font-mono text-[13.5px] font-semibold text-foreground">{tool.name}</code>
                      </div>
                      {tool.description && (
                        <p className="text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                      )}
                      <ParamChips schema={tool.inputSchema} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resources" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              {resources.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_resources")} />
              ) : (
                <div className="flex flex-col">
                  {resources.map((res) => (
                    <div key={res.uri} className="flex flex-col gap-1 border-b border-border px-5 py-[15px]">
                      <p className="text-xs font-semibold text-foreground">{res.name}</p>
                      <code className="font-mono text-[10px] text-muted-foreground">{res.uri}</code>
                      {res.description && (
                        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{res.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="prompts" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              {prompts.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_prompts")} />
              ) : (
                <div className="flex flex-col">
                  {prompts.map((p) => (
                    <div key={p.name} className="flex flex-col gap-2 border-b border-border px-5 py-[15px]">
                      <div className="flex items-center gap-2">
                        <MessageSquareQuote className="size-3.5 shrink-0 text-skill-fg" />
                        <code className="font-mono text-[13.5px] font-semibold text-foreground">{p.name}</code>
                      </div>
                      {p.description && (
                        <p className="text-xs leading-relaxed text-muted-foreground">{p.description}</p>
                      )}
                      {p.arguments && p.arguments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {p.arguments.map((arg) => (
                            <code
                              key={arg.name}
                              className="rounded-[5px] bg-muted px-[7px] py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {arg.name}
                              {arg.required ? "" : "?"}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
