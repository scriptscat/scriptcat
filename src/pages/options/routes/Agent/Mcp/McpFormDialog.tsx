import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Switch } from "@App/pages/components/ui/switch";
import type { MCPServerConfig } from "@App/app/service/agent/core/types";

export type McpServerInput = Omit<MCPServerConfig, "id" | "createtime" | "updatetime">;
export type McpModalTestResult = {
  ok: boolean;
  tools?: number;
  resources?: number;
  prompts?: number;
  error?: string;
};

// 解析自定义请求头文本：每行 `Key: value`，忽略空行，仅按首个冒号切分
export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx > 0) {
      headers[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return headers;
}

// 将请求头 Record 还原为多行 `Key: value` 文本
export function stringifyHeaders(headers?: Record<string, string>): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function McpFormDialog({
  open,
  value,
  onOpenChange,
  onSubmit,
  onTest,
}: {
  open: boolean;
  value: MCPServerConfig | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (config: McpServerInput) => void;
  onTest: (config: McpServerInput) => void | Promise<McpModalTestResult | void>;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<McpModalTestResult | null>(null);

  // 弹窗打开时(open false→true)或打开期间 value 变化时,用 value 同步表单字段。
  // 沿用「渲染期比较上一次输入再 setState」模式,等价于原 useEffect([open, value]) 的触发时机:
  // 仅当 open 为 true 且 [open, value] 较上次渲染发生变化时重置;open 为 false 时变化不重置。
  // 初值 open 取 false,使首渲染若已 open(等价于原 effect 在挂载后执行一次)也能用 value 初始化表单。
  const [prevReset, setPrevReset] = useState<{ open: boolean; value: MCPServerConfig | null }>({
    open: false,
    value,
  });
  if (open && (open !== prevReset.open || value !== prevReset.value)) {
    setPrevReset({ open, value });
    setName(value?.name ?? "");
    setUrl(value?.url ?? "");
    setApiKey(value?.apiKey ?? "");
    setHeadersText(stringifyHeaders(value?.headers));
    setEnabled(value?.enabled ?? true);
    setResult(null);
  }

  const buildConfig = (): McpServerInput => ({
    name,
    url,
    apiKey: apiKey || undefined,
    headers: parseHeaders(headersText),
    enabled,
  });

  const canSubmit = !!name && !!url;

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await onTest(buildConfig());
      if (r) setResult(r);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{value ? t("common:edit") : t("agent:mcp_add_server")}</DialogTitle>
          <DialogDescription className="sr-only">{t("agent:mcp_subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-name">{t("agent:model_name")}</Label>
            <Input id="mcp-name" data-testid="mcp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-url">{"URL"}</Label>
            <Input
              id="mcp-url"
              data-testid="mcp-url"
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-api-key">
              {t("agent:provider_api_key")}
              <span className="ml-1 text-xs text-muted-foreground">{`(${t("agent:mcp_optional")})`}</span>
            </Label>
            <Input
              id="mcp-api-key"
              data-testid="mcp-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-headers">{t("agent:mcp_custom_headers")}</Label>
            <Textarea
              id="mcp-headers"
              data-testid="mcp-headers"
              className="h-20 font-mono text-xs"
              placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="mcp-enabled">{t("agent:mcp_enabled")}</Label>
            <Switch id="mcp-enabled" data-testid="mcp-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" data-testid="mcp-test" disabled={testing} onClick={handleTest}>
              {testing && <Loader2 className="size-4 animate-spin" />}
              {t("agent:mcp_test_connection")}
            </Button>
            {result &&
              (result.ok ? (
                <span className="flex items-center gap-1 text-xs text-success-fg">
                  <CheckCircle2 className="size-4" />
                  {t("agent:provider_test_success")}
                  {` · ${t("agent:mcp_tools")} ${result.tools ?? 0} / ${t("agent:mcp_resources")} ${result.resources ?? 0} / ${t("agent:mcp_prompts")} ${result.prompts ?? 0}`}
                </span>
              ) : (
                <span className="flex items-center gap-1 truncate text-xs text-destructive">
                  <XCircle className="size-4 shrink-0" />
                  {result.error || t("agent:provider_test_failed")}
                </span>
              ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button data-testid="mcp-submit" disabled={!canSubmit} onClick={() => onSubmit(buildConfig())}>
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
