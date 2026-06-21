import { useState } from "react";
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
import { FormField, SwitchField } from "@App/pages/components/ui/form-field";
import { Input } from "@App/pages/components/ui/input";
import { SegmentedControl, type SegmentedControlOption } from "@App/pages/components/ui/segmented-control";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Switch } from "@App/pages/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@App/pages/components/ui/select";
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

  // 弹窗打开（或打开期间 value 变化）时，依据传入的 value 重置/同步各字段。
  // 用「渲染期比较上一次的 open/value 再 setState」模式同步外部 prop，等价于原 useEffect。
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevValue, setPrevValue] = useState(value);
  if (open && (open !== prevOpen || value !== prevValue)) {
    setPrevOpen(open);
    setPrevValue(value);
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
  } else if (open !== prevOpen || value !== prevValue) {
    // 弹窗关闭或 value 在关闭状态下变化：仅记录最新值，不触碰表单字段（与原 `if (!open) return` 一致）
    setPrevOpen(open);
    setPrevValue(value);
  }

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
          <FormField label={t("agent:model_name")} htmlFor="task-name">
            <Input id="task-name" data-testid="task-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          <FormField label={t("agent:tasks_mode")}>
            <SegmentedControl
              aria-label={t("agent:tasks_mode")}
              value={mode}
              onValueChange={setMode}
              options={(["internal", "event"] as const).map<SegmentedControlOption<"internal" | "event">>((m) => ({
                value: m,
                label: m === "internal" ? t("agent:tasks_mode_internal_short") : t("agent:tasks_mode_event_short"),
                testId: `task-mode-${m}`,
              }))}
            />
          </FormField>

          <FormField
            label={t("agent:tasks_cron")}
            htmlFor="task-cron"
            error={cronInvalid ? <span data-testid="task-cron-error">{t("script:cron_invalid_expr")}</span> : undefined}
          >
            <Input
              id="task-cron"
              data-testid="task-cron"
              className="font-mono"
              placeholder="0 9 * * *"
              value={crontab}
              onChange={(e) => setCrontab(e.target.value)}
            />
            {!cronInvalid && cron.valid && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <CalendarCheck className="size-3.5" />
                {t("agent:tasks_next_run")} {"·"} {cron.text}
              </span>
            )}
          </FormField>

          {mode === "internal" && (
            <>
              <FormField label={t("agent:tasks_prompt")} htmlFor="task-prompt">
                <Textarea
                  id="task-prompt"
                  data-testid="task-prompt"
                  className="h-20"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("agent:tasks_model_select")}>
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
                </FormField>
                <FormField label={t("agent:tasks_max_iterations")} htmlFor="task-max-iter">
                  <Input
                    id="task-max-iter"
                    data-testid="task-max-iter"
                    type="number"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(e.target.value)}
                  />
                </FormField>
              </div>
            </>
          )}

          {mode === "event" && <p className="text-xs text-muted-foreground">{t("agent:tasks_event_hint")}</p>}

          <SwitchField label={t("agent:tasks_notify")} description={t("agent:tasks_notify_desc")} className="pt-1">
            <Switch id="task-notify" data-testid="task-notify" checked={notify} onCheckedChange={setNotify} />
          </SwitchField>
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
