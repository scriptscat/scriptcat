import { useEffect, useState } from "react";
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
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@App/pages/components/ui/select";
import { cn } from "@App/pkg/utils/cn";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { getDefaultBaseUrl } from "./provider_api";

export type TestResult = { ok: boolean; latencyMs?: number; error?: string };

const emptyModel: AgentModelConfig = {
  id: "",
  name: "",
  provider: "openai",
  apiBaseUrl: "",
  apiKey: "",
  model: "",
};

const PROVIDERS: AgentModelConfig["provider"][] = ["openai", "anthropic", "zhipu"];

export function ModelFormDialog({
  open,
  value,
  onOpenChange,
  onSubmit,
  onTest,
  onFetchModels,
}: {
  open: boolean;
  value: AgentModelConfig | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (model: AgentModelConfig) => void;
  onTest: (model: AgentModelConfig) => Promise<TestResult>;
  onFetchModels: (model: AgentModelConfig) => Promise<string[]>;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const [form, setForm] = useState<AgentModelConfig>(value ?? emptyModel);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [available, setAvailable] = useState<string[]>(value?.availableModels ?? []);

  // 弹窗打开或编辑目标变化时，重置表单
  useEffect(() => {
    if (open) {
      setForm(value ?? emptyModel);
      setAvailable(value?.availableModels ?? []);
      setTestResult(null);
    }
  }, [open, value]);

  const update = <K extends keyof AgentModelConfig>(key: K, v: AgentModelConfig[K]) =>
    setForm((f) => ({ ...f, [key]: v }));

  const canSubmit = !!form.name && !!form.model;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest(form));
    } finally {
      setTesting(false);
    }
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      setAvailable(await onFetchModels(form));
    } finally {
      setFetching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{value ? t("agent:model_edit") : t("agent:model_add")}</DialogTitle>
          <DialogDescription className="sr-only">{t("agent:provider_subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-name">{t("agent:model_name")}</Label>
            <Input
              id="model-name"
              data-testid="model-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("agent:provider_select")}</Label>
            <Select value={form.provider} onValueChange={(v) => update("provider", v as AgentModelConfig["provider"])}>
              <SelectTrigger data-testid="model-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-base-url">{t("agent:provider_api_base_url")}</Label>
            <Input
              id="model-base-url"
              data-testid="model-base-url"
              value={form.apiBaseUrl}
              placeholder={getDefaultBaseUrl(form.provider)}
              onChange={(e) => update("apiBaseUrl", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-api-key">{t("agent:provider_api_key")}</Label>
            <Input
              id="model-api-key"
              data-testid="model-api-key"
              type="password"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-id">{t("agent:provider_model")}</Label>
            <div className="flex gap-2">
              <Input
                id="model-id"
                data-testid="model-id"
                className="flex-1"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                data-testid="model-fetch"
                disabled={fetching}
                onClick={handleFetch}
              >
                {fetching && <Loader2 className="size-4 animate-spin" />}
                {t("agent:model_fetch")}
              </Button>
            </div>
            {available.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {available.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update("model", id)}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                      form.model === id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model-max-tokens">{t("agent:model_max_tokens")}</Label>
              <Input
                id="model-max-tokens"
                data-testid="model-max-tokens"
                type="number"
                value={form.maxTokens ?? ""}
                onChange={(e) => update("maxTokens", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model-context-window">{t("agent:model_context_window")}</Label>
              <Input
                id="model-context-window"
                data-testid="model-context-window"
                type="number"
                value={form.contextWindow ?? ""}
                onChange={(e) => update("contextWindow", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("agent:model_capabilities")}</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="model-vision"
                data-testid="model-vision"
                checked={!!form.supportsVision}
                onCheckedChange={(v) => update("supportsVision", v === true)}
              />
              <Label htmlFor="model-vision" className="font-normal">
                {t("agent:model_supports_vision")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="model-image-output"
                data-testid="model-image-output"
                checked={!!form.supportsImageOutput}
                onCheckedChange={(v) => update("supportsImageOutput", v === true)}
              />
              <Label htmlFor="model-image-output" className="font-normal">
                {t("agent:model_supports_image_output")}
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" data-testid="model-test" disabled={testing} onClick={handleTest}>
              {testing && <Loader2 className="size-4 animate-spin" />}
              {t("agent:provider_test_connection")}
            </Button>
            {testResult &&
              (testResult.ok ? (
                <span className="flex items-center gap-1 text-xs text-success-fg">
                  <CheckCircle2 className="size-4" />
                  {t("agent:provider_test_success")}
                  {testResult.latencyMs != null && ` · ${testResult.latencyMs}ms`}
                </span>
              ) : (
                <span className="flex items-center gap-1 truncate text-xs text-destructive">
                  <XCircle className="size-4 shrink-0" />
                  {testResult.error || t("agent:provider_test_failed")}
                </span>
              ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button data-testid="model-submit" disabled={!canSubmit} onClick={() => onSubmit(form)}>
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
