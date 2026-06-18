import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import { CalendarCheck } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Switch } from "@App/pages/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@App/pages/components/ui/select";
import { cn } from "@App/pkg/utils/cn";
import type { AgentTask, AgentModelConfig } from "@App/app/service/agent/core/types";
import { nextRunText } from "./cron";

// 在联合类型每个分支上分别 Omit，保留 internal/event 各自的专有字段
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type TaskFormValue = DistributiveOmit<AgentTask, "id" | "createtime" | "updatetime" | "nextruntime">;

export function TaskFormDialog({
  open,
  value,
  models,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  value: AgentTask | null;
  models: AgentModelConfig[];
  onOpenChange: (v: boolean) => void;
  onSubmit: (task: TaskFormValue) => void;
}) {
  const { t } = useTranslation(["agent", "common", "script"]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"internal" | "event">("internal");
  const [crontab, setCrontab] = useState("");
  const [notify, setNotify] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [maxIterations, setMaxIterations] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(value?.name ?? "");
    setMode(value?.mode ?? "internal");
    setCrontab(value?.crontab ?? "");
    setNotify(value?.notify ?? false);
    setEnabled(value?.enabled ?? true);
    if (value?.mode === "internal") {
      setPrompt(value.prompt ?? "");
      setModelId(value.modelId ?? "");
      setMaxIterations(value.maxIterations != null ? String(value.maxIterations) : "");
    } else {
      setPrompt("");
      setModelId("");
      setMaxIterations("");
    }
  }, [open, value]);

  const cron = nextRunText(crontab);
  const cronInvalid = crontab.trim().length > 0 && !cron.valid;
  const canSubmit = !!name && cron.valid;

  const handleSubmit = () => {
    const base = { name, crontab, enabled, notify };
    const task: TaskFormValue =
      mode === "internal"
        ? {
            ...base,
            mode: "internal",
            prompt,
            modelId: modelId || undefined,
            maxIterations: maxIterations ? Number(maxIterations) : undefined,
          }
        : {
            ...base,
            mode: "event",
            // 事件任务由脚本创建；编辑时保留来源脚本 UUID，新建时留空
            sourceScriptUuid: value?.mode === "event" ? value.sourceScriptUuid : "",
          };
    onSubmit(task);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{value ? t("agent:tasks_edit") : t("agent:tasks_create")}</DialogTitle>
          <DialogDescription className="sr-only">{t("agent:tasks_subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-name">{t("agent:model_name")}</Label>
            <Input id="task-name" data-testid="task-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("agent:tasks_mode", { defaultValue: "模式" })}</Label>
            <div className="flex w-full gap-1 rounded-[9px] bg-muted p-[3px]">
              {(["internal", "event"] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-testid={`task-mode-${m}`}
                    aria-pressed={active}
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex h-[30px] flex-1 items-center justify-center rounded-[7px] text-[13px] transition-colors",
                      active
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-normal text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "internal"
                      ? t("agent:tasks_mode_internal_short", { defaultValue: "内部" })
                      : t("agent:tasks_mode_event_short", { defaultValue: "事件" })}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-cron">{t("agent:tasks_cron")}</Label>
            <Input
              id="task-cron"
              data-testid="task-cron"
              className="font-mono"
              placeholder="0 9 * * *"
              value={crontab}
              onChange={(e) => setCrontab(e.target.value)}
            />
            {cronInvalid ? (
              <span data-testid="task-cron-error" className="text-xs text-destructive">
                {t("script:cron_invalid_expr")}
              </span>
            ) : (
              cron.valid && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CalendarCheck className="size-3.5" />
                  {t("agent:tasks_next_run")} {"·"} {cron.text}
                </span>
              )
            )}
          </div>

          {mode === "internal" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-prompt">{t("agent:tasks_prompt")}</Label>
                <Textarea
                  id="task-prompt"
                  data-testid="task-prompt"
                  className="h-20"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("agent:tasks_model_select")}</Label>
                  <Select value={modelId} onValueChange={setModelId}>
                    <SelectTrigger data-testid="task-model">
                      <SelectValue placeholder={t("agent:tasks_model_select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-max-iter">{t("agent:tasks_max_iterations")}</Label>
                  <Input
                    id="task-max-iter"
                    data-testid="task-max-iter"
                    type="number"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {mode === "event" && <p className="text-xs text-muted-foreground">{t("agent:tasks_event_hint")}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="task-notify">{t("agent:tasks_notify")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("agent:tasks_notify_desc", { defaultValue: "任务完成后发送浏览器通知" })}
              </span>
            </div>
            <Switch id="task-notify" data-testid="task-notify" checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button data-testid="task-submit" disabled={!canSubmit} onClick={handleSubmit}>
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
