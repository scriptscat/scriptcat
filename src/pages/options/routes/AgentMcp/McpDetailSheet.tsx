import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@App/pages/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@App/pages/components/ui/tabs";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt } from "@App/app/service/agent/core/types";

function ParamChips({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema?.properties as Record<string, unknown>) ?? {};
  const required = (schema?.required as string[]) ?? [];
  const keys = Object.keys(properties);
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {keys.map((k) => (
        <code key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
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
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="truncate">{server?.name}</SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">{server?.url}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("agent:mcp_loading")}
          </div>
        ) : (
          <Tabs defaultValue="tools" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-3">
              <TabsTrigger data-testid="tab-tools" value="tools">
                {t("agent:mcp_tools")} ({tools.length})
              </TabsTrigger>
              <TabsTrigger data-testid="tab-resources" value="resources">
                {t("agent:mcp_resources")} ({resources.length})
              </TabsTrigger>
              <TabsTrigger data-testid="tab-prompts" value="prompts">
                {t("agent:mcp_prompts")} ({prompts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tools" className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {tools.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_tools")} />
              ) : (
                <div className="flex flex-col gap-2">
                  {tools.map((tool) => (
                    <div key={tool.name} className="rounded-lg border border-border p-3">
                      <code className="font-mono text-xs font-semibold text-foreground">{tool.name}</code>
                      {tool.description && (
                        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                      )}
                      <ParamChips schema={tool.inputSchema} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resources" className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {resources.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_resources")} />
              ) : (
                <div className="flex flex-col gap-2">
                  {resources.map((res) => (
                    <div key={res.uri} className="rounded-lg border border-border p-3">
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

            <TabsContent value="prompts" className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {prompts.length === 0 ? (
                <EmptyHint text={t("agent:mcp_no_prompts")} />
              ) : (
                <div className="flex flex-col gap-2">
                  {prompts.map((p) => (
                    <div key={p.name} className="rounded-lg border border-border p-3">
                      <code className="font-mono text-xs font-semibold text-foreground">{p.name}</code>
                      {p.description && (
                        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
                      )}
                      {p.arguments && p.arguments.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {p.arguments.map((arg) => (
                            <code
                              key={arg.name}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
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
